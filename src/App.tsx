import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { auth, db, legacyDb, testConnection } from './lib/firebase';
import {
  DEFAULT_CATEGORIES,
  extractEstoque,
  extractNome,
  isAdminEmail,
  normalizeText,
  sanitizeCategoryForFirestore,
  sanitizeDocId,
  sanitizeProductForFirestore,
} from './lib/format';
import type {
  AppView,
  Banner,
  CartItem,
  Category,
  Product,
  StoreSettings,
  ToastMessage,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import {
  CatalogView,
  CategoryView,
  ComoComprarView,
  HomeView,
  SobreView,
} from './components/StorefrontViews';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthModal } from './components/AuthModal';
import { AccountView } from './components/AccountView';
import { AdminView } from './components/AdminView';

const CART_STORAGE_KEY = 'bw_cart_v2';
const WISH_STORAGE_KEY = 'bw_wish_v2';

const DEFAULT_SETTINGS: StoreSettings = {
  nome: 'BW Parfum Imports',
  slogan: 'Alta perfumaria importada com procedência garantida e envio seguro.',
  wpp: '5511999999999',
  topbar: 'Perfumes importados originais · Parcelamento em até 12x · Envio para todo o Brasil',
  parcelas: 12,
  freteGratis: 399,
  estoqueAlerta: 3,
  lojaAberta: true,
  mostraPix: true,
  loginObrig: false,
};

function loadStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function fetchStoreSnapshot(targetDb: Firestore) {
  const [settingsRes, bannersRes, categoriesRes, productsRes] = await Promise.allSettled([
    getDoc(doc(targetDb, 'config', 'settings')),
    getDoc(doc(targetDb, 'config', 'banners')),
    getDocs(collection(targetDb, 'categories')),
    getDocs(collection(targetDb, 'produtos')),
  ]);

  const settings =
    settingsRes.status === 'fulfilled' && settingsRes.value.exists()
      ? (settingsRes.value.data() as StoreSettings)
      : null;

  const bannersData =
    bannersRes.status === 'fulfilled' && bannersRes.value.exists()
      ? bannersRes.value.data()?.list
      : null;
  const banners = Array.isArray(bannersData) ? (bannersData as Banner[]) : [];

  const categories =
    categoriesRes.status === 'fulfilled' && !categoriesRes.value.empty
      ? categoriesRes.value.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)
      : [];

  const products =
    productsRes.status === 'fulfilled' && !productsRes.value.empty
      ? productsRes.value.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)
      : [];

  return { settings, banners, categories, products };
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [catalogCatFilter, setCatalogCatFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(() =>
    loadStoredJson<CartItem[]>(CART_STORAGE_KEY, [])
  );
  const [wishlist, setWishlist] = useState<string[]>(() =>
    loadStoredJson<string[]>(WISH_STORAGE_KEY, [])
  );

  const [selectedProdId, setSelectedProdId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminEditProductId, setAdminEditProductId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const autoMigratedRef = useRef(false);

  const showToast = useCallback((text: string, type: 'ok' | 'er' | 'ts' = 'ts') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const loadStoreData = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const primary = await fetchStoreSnapshot(db);
      const needsFallback =
        legacyDb &&
        (primary.products.length === 0 ||
          primary.categories.length === 0 ||
          primary.banners.length === 0 ||
          !primary.settings);

      const fallback = needsFallback && legacyDb ? await fetchStoreSnapshot(legacyDb) : null;

      const resolvedSettings = primary.settings || fallback?.settings;
      if (resolvedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...resolvedSettings });
      }

      const resolvedCategories =
        primary.categories.length > 0 ? primary.categories : fallback?.categories || [];
      if (resolvedCategories.length > 0) {
        setCategories(resolvedCategories);
      }

      const resolvedBanners =
        primary.banners.length > 0 ? primary.banners : fallback?.banners || [];
      if (resolvedBanners.length > 0) {
        setBanners(resolvedBanners);
      }

      const resolvedProducts =
        primary.products.length > 0 ? primary.products : fallback?.products || [];
      resolvedProducts.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
      setProducts(resolvedProducts);
    } catch (err) {
      console.error('Erro ao carregar dados da loja:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const migrateLegacyCatalogToPrimary = useCallback(async (): Promise<number> => {
    if (!legacyDb) return 0;
    const legacy = await fetchStoreSnapshot(legacyDb);
    let importedCount = 0;

    if (legacy.settings) {
      await setDoc(
        doc(db, 'config', 'settings'),
        { ...legacy.settings, updAt: serverTimestamp() },
        { merge: true }
      );
    }

    if (legacy.banners.length > 0) {
      await setDoc(
        doc(db, 'config', 'banners'),
        { list: legacy.banners, updAt: serverTimestamp() },
        { merge: true }
      );
    }

    if (legacy.categories.length > 0) {
      const catBatch = writeBatch(db);
      legacy.categories.forEach((cat) => {
        const cleanId = sanitizeDocId(cat.id);
        const payload = sanitizeCategoryForFirestore(cat as unknown as Record<string, unknown>, cat.slug || cleanId);
        catBatch.set(
          doc(db, 'categories', cleanId),
          { ...payload, updAt: serverTimestamp() },
          { merge: true }
        );
      });
      await catBatch.commit();
    }

    if (legacy.products.length > 0) {
      // Firestore writeBatch limit is 500 ops; chunk safely at 200
      for (let i = 0; i < legacy.products.length; i += 200) {
        const chunk = legacy.products.slice(i, i + 200);
        const batch = writeBatch(db);
        chunk.forEach((prod) => {
          const cleanId = sanitizeDocId(prod.id);
          const payload = sanitizeProductForFirestore(prod as unknown as Record<string, unknown>);
          batch.set(
            doc(db, 'produtos', cleanId),
            { ...payload, updAt: serverTimestamp(), syncedAt: serverTimestamp() },
            { merge: true }
          );
          importedCount++;
        });
        await batch.commit();
      }
    }

    await loadStoreData();
    return importedCount;
  }, [loadStoreData]);

  useEffect(() => {
    void testConnection();
    void loadStoreData();
  }, [loadStoreData]);

  // Auth listener & automatic one-time migration when Admin enters with an empty primary DB
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        return;
      }

      let adminFlag = false;
      try {
        const adminDoc = await getDoc(doc(db, 'admins', u.uid));
        if (adminDoc.exists()) {
          adminFlag = true;
        }
      } catch {
        // Ignore
      }
      if (!adminFlag && legacyDb) {
        try {
          const legacyAdminDoc = await getDoc(doc(legacyDb, 'admins', u.uid));
          if (legacyAdminDoc.exists()) {
            adminFlag = true;
          }
        } catch {
          // Ignore
        }
      }
      if (!adminFlag && (await isAdminEmail(u.email))) {
        adminFlag = true;
      }
      setIsAdmin(adminFlag);

      if (adminFlag && legacyDb && !autoMigratedRef.current) {
        autoMigratedRef.current = true;
        try {
          const primarySnap = await getDocs(collection(db, 'produtos'));
          if (primarySnap.empty) {
            const count = await migrateLegacyCatalogToPrimary();
            if (count > 0) {
              showToast(`${count} perfumes importados do seu catálogo principal!`, 'ok');
            }
          }
        } catch (err) {
          console.warn('Migração automática pendente:', err);
        }
      }

      try {
        const clientSnap = await getDoc(doc(db, 'clients', u.uid));
        if (clientSnap.exists()) {
          const remoteFavs = clientSnap.data()?.favoritos;
          if (Array.isArray(remoteFavs)) {
            setWishlist((prev) => Array.from(new Set([...prev, ...remoteFavs])));
          }
        }
      } catch {
        // Ignore offline/rules errors for initial client read
      }
    });
    return () => unsub();
  }, [migrateLegacyCatalogToPrimary, showToast]);

  // Persist cart & wishlist locally
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISH_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // Ignore storage quota errors
    }
  }, [wishlist]);

  // Handle ?prod= deep link once products load
  useEffect(() => {
    if (products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const prodParam = params.get('prod');
    if (prodParam && products.some((p) => p.id === prodParam)) {
      setSelectedProdId(prodParam);
    }
  }, [products]);

  const navigateTo = useCallback((view: AppView) => {
    setActiveView(view);
    if (view !== 'catalogo') {
      setCatalogCatFilter('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectCategory = (slug: string) => {
    const norm = normalizeText(slug);
    if (norm.startsWith('fem')) return navigateTo('feminino');
    if (norm.startsWith('masc')) return navigateTo('masculino');
    if (norm.startsWith('uni')) return navigateTo('unissex');
    if (norm.startsWith('kit')) return navigateTo('kits');
    setCatalogCatFilter(slug);
    navigateTo('catalogo');
  };

  const handleOpenProduct = (id: string) => {
    setSelectedProdId(id);
    addDoc(collection(db, 'analytics_events'), {
      type: 'view',
      prodId: sanitizeDocId(id),
      uid: user?.uid ?? null,
      ts: serverTimestamp(),
    }).catch(() => {});
  };

  const handleAddCart = (id: string) => {
    const prod = products.find((p) => p.id === id);
    if (!prod) return;
    const stock = extractEstoque(prod);
    if (stock <= 0) {
      showToast('Este perfume está esgotado no momento.', 'er');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        if (existing.qty >= stock) {
          showToast(`Estoque máximo disponível: ${stock} unidade(s).`, 'er');
          return prev;
        }
        showToast(`${extractNome(prod)} atualizado na sacola.`, 'ok');
        return prev.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
      }
      showToast(`${extractNome(prod)} adicionado à sacola!`, 'ok');
      return [...prev, { id, qty: 1 }];
    });
  };

  const handleChangeCartQty = (id: string, delta: number) => {
    const prod = products.find((p) => p.id === id);
    const maxStock = prod ? extractEstoque(prod) : 99;
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const next = item.qty + delta;
          if (next <= 0) return null;
          if (delta > 0 && next > maxStock) {
            showToast(`Limite em estoque: ${maxStock} unidade(s).`, 'er');
            return item;
          }
          return { ...item, qty: next };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const handleRemoveCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleWish = (id: string) => {
    setWishlist((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      showToast(exists ? 'Removido dos favoritos.' : 'Salvo nos favoritos!', 'ok');
      if (user) {
        setDoc(
          doc(db, 'clients', user.uid),
          { favoritos: next.slice(0, 100), updAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }
      return next;
    });
  };

  const handleProceedCheckout = () => {
    if (settings.loginObrig && !user) {
      setCartOpen(false);
      setAuthOpen(true);
      showToast('Faça login ou crie sua conta para finalizar o pedido.', 'ts');
      return;
    }
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const handleAdminDeleteProduct = async (id: string) => {
    if (!isAdmin) return;
    const prod = products.find((p) => p.id === id);
    if (!window.confirm(`Excluir "${extractNome(prod || {}) || 'este produto'}"?`)) return;
    try {
      await deleteDoc(doc(db, 'produtos', id));
      showToast('Produto removido do catálogo.', 'ok');
      await loadStoreData();
    } catch {
      showToast('Erro ao remover produto.', 'er');
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProdId) || null;
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartIds = cart.map((i) => i.id);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1E1712]">
        <Header
          activeView={activeView}
          onNavigate={navigateTo}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSubmitSearch={() => navigateTo('catalogo')}
          onOpenProduct={handleOpenProduct}
          onOpenCart={() => setCartOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          cartCount={cartCount}
          products={products}
          settings={settings}
          user={user}
          isAdmin={isAdmin}
        />

        <main className="flex-1">
          {activeView === 'home' && (
            <HomeView
              products={products}
              categories={categories}
              banners={banners}
              settings={settings}
              loading={loadingCatalog}
              cartIds={cartIds}
              wishlist={wishlist}
              isAdmin={isAdmin}
              onNavigate={navigateTo}
              onSelectCategory={handleSelectCategory}
              onOpenProduct={handleOpenProduct}
              onAddCart={handleAddCart}
              onToggleWish={handleToggleWish}
              onAdminEditProduct={(id) => {
                setAdminEditProductId(id);
                navigateTo('admin');
              }}
              onAdminDeleteProduct={handleAdminDeleteProduct}
            />
          )}

          {activeView === 'catalogo' && (
            <CatalogView
              products={products}
              categories={categories}
              settings={settings}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              initialCategoryFilter={catalogCatFilter}
              cartIds={cartIds}
              wishlist={wishlist}
              isAdmin={isAdmin}
              onOpenProduct={handleOpenProduct}
              onAddCart={handleAddCart}
              onToggleWish={handleToggleWish}
              onAdminEditProduct={(id) => {
                setAdminEditProductId(id);
                navigateTo('admin');
              }}
              onAdminDeleteProduct={handleAdminDeleteProduct}
            />
          )}

          {(activeView === 'feminino' ||
            activeView === 'masculino' ||
            activeView === 'unissex' ||
            activeView === 'kits') && (
            <CategoryView
              slug={
                activeView === 'feminino'
                  ? 'fem'
                  : activeView === 'masculino'
                    ? 'masc'
                    : activeView === 'unissex'
                      ? 'uni'
                      : 'kit'
              }
              products={products}
              settings={settings}
              cartIds={cartIds}
              wishlist={wishlist}
              isAdmin={isAdmin}
              onOpenProduct={handleOpenProduct}
              onAddCart={handleAddCart}
              onToggleWish={handleToggleWish}
              onAdminEditProduct={(id) => {
                setAdminEditProductId(id);
                navigateTo('admin');
              }}
              onAdminDeleteProduct={handleAdminDeleteProduct}
              onAdminAddInCategory={() => navigateTo('admin')}
              onNavigateCatalog={() => navigateTo('catalogo')}
            />
          )}

          {activeView === 'como' && (
            <ComoComprarView
              settings={settings}
              onNavigateCatalog={() => navigateTo('catalogo')}
            />
          )}

          {activeView === 'sobre' && (
            <SobreView
              settings={settings}
              onNavigateCatalog={() => navigateTo('catalogo')}
            />
          )}

          {activeView === 'conta' &&
            (user ? (
              <AccountView
                user={user}
                products={products}
                wishlist={wishlist}
                settings={settings}
                onBackStore={() => navigateTo('home')}
                onOpenProduct={handleOpenProduct}
                onAddCart={handleAddCart}
                onToggleWish={handleToggleWish}
                cartIds={cartIds}
                onToast={showToast}
              />
            ) : (
              <div className="max-w-md mx-auto my-16 px-4 text-center space-y-4">
                <h1 className="font-display text-3xl text-[#1E1712]">Minha Conta</h1>
                <p className="text-sm text-[#7A6E65]">
                  Entre na sua conta para acompanhar seus pedidos, rastreio e favoritos.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="px-6 py-3 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] transition-colors"
                >
                  Entrar / Criar Conta
                </button>
              </div>
            ))}

          {activeView === 'admin' &&
            (user && isAdmin ? (
              <AdminView
                user={user}
                products={products}
                categories={categories}
                banners={banners}
                settings={settings}
                initialEditProductId={adminEditProductId}
                onClearInitialEdit={() => setAdminEditProductId(null)}
                onBackStore={() => navigateTo('home')}
                onRefreshData={loadStoreData}
                onImportLegacyCatalog={migrateLegacyCatalogToPrimary}
                onToast={showToast}
              />
            ) : (
              <div className="max-w-md mx-auto my-16 px-4 text-center space-y-4">
                <h1 className="font-display text-3xl text-[#1E1712]">Acesso Restrito</h1>
                <p className="text-sm text-[#7A6E65]">
                  Esta área é exclusiva para administradores da BW Parfum.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('home')}
                  className="px-6 py-3 rounded-lg bg-[#1E1712] text-white text-xs font-semibold"
                >
                  Voltar à loja
                </button>
              </div>
            ))}
        </main>

        <Footer settings={settings} onNavigate={navigateTo} />

        {/* Modals & Drawers */}
        <ProductModal
          product={selectedProduct}
          inCart={selectedProduct ? cartIds.includes(selectedProduct.id) : false}
          inWishlist={selectedProduct ? wishlist.includes(selectedProduct.id) : false}
          settings={settings}
          user={user}
          onClose={() => setSelectedProdId(null)}
          onAddCart={handleAddCart}
          onToggleWish={handleToggleWish}
          onToast={showToast}
        />

        <CartDrawer
          open={cartOpen}
          cart={cart}
          products={products}
          settings={settings}
          onClose={() => setCartOpen(false)}
          onChangeQty={handleChangeCartQty}
          onRemove={handleRemoveCart}
          onOpenProduct={handleOpenProduct}
          onProceedCheckout={handleProceedCheckout}
          onExploreCatalog={() => {
            setCartOpen(false);
            navigateTo('catalogo');
          }}
        />

        <CheckoutModal
          open={checkoutOpen}
          cart={cart}
          products={products}
          settings={settings}
          user={user}
          onClose={() => setCheckoutOpen(false)}
          onBackToCart={() => {
            setCheckoutOpen(false);
            setCartOpen(true);
          }}
          onOrderSuccess={() => {
            setCart([]);
          }}
          onToast={showToast}
        />

        <AuthModal
          open={authOpen}
          settings={settings}
          onClose={() => setAuthOpen(false)}
          onSuccess={(adminDetected) => {
            if (adminDetected) {
              navigateTo('admin');
            }
          }}
          onToast={showToast}
        />

        {/* Accessible Toast Stack */}
        {toasts.length > 0 && (
          <div
            aria-live="polite"
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 w-[92%] max-w-sm pointer-events-none"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`px-4 py-3 rounded-xl text-xs font-semibold shadow-lg text-center border ${
                  t.type === 'er'
                    ? 'bg-[#A93226] text-white border-[#8B281E]'
                    : t.type === 'ok'
                      ? 'bg-[#1F6E43] text-white border-[#175533]'
                      : 'bg-[#1E1712] text-white border-[#332820]'
                }`}
              >
                {t.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
