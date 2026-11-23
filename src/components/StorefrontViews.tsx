import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import type { AppView, Banner, Category, Product, StoreSettings } from '../types';
import { BRAND_ASSETS, resolveSafeMediaUrl } from '../lib/assets';
import {
  buildWhatsappUrl,
  DEFAULT_CATEGORIES,
  extractEstoque,
  extractMarca,
  extractNome,
  extractPreco,
  formatBRL,
  getCategoryFallbackImage,
  matchesCategory,
  normalizeText,
} from '../lib/format';
import { ProductCard } from './ProductCard';
import { SmartImage } from './SmartImage';

/* ============================================================================
 * SKELETON CARD
 * ========================================================================== */
const ProductSkeleton: React.FC = () => (
  <div className="bg-white border border-[#E6DFD5] rounded-xl overflow-hidden">
    <div className="aspect-square skeleton-shimmer" />
    <div className="p-4 space-y-3">
      <div className="h-3 w-1/2 rounded skeleton-shimmer" />
      <div className="h-4 w-4/5 rounded skeleton-shimmer" />
      <div className="pt-2 border-t border-[#F2EDE6] flex justify-between items-center">
        <div className="h-5 w-20 rounded skeleton-shimmer" />
        <div className="h-9 w-24 rounded-lg skeleton-shimmer" />
      </div>
    </div>
  </div>
);

/* ============================================================================
 * 1. HOME VIEW (Strictly 4 Editorial Sections)
 * ========================================================================== */
interface HomeViewProps {
  products: Product[];
  categories: Category[];
  banners: Banner[];
  settings: StoreSettings;
  loading: boolean;
  cartIds: string[];
  wishlist: string[];
  isAdmin: boolean;
  onNavigate: (view: AppView) => void;
  onSelectCategory: (slug: string) => void;
  onOpenProduct: (id: string) => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  onAdminEditProduct: (id: string) => void;
  onAdminDeleteProduct: (id: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  products,
  categories,
  banners,
  settings,
  loading,
  cartIds,
  wishlist,
  isAdmin,
  onNavigate,
  onSelectCategory,
  onOpenProduct,
  onAddCart,
  onToggleWish,
  onAdminEditProduct,
  onAdminDeleteProduct,
}) => {
  const [homeSort, setHomeSort] = useState<'destaques' | 'menor' | 'maior' | 'az'>('destaques');
  const [bannerIdx, setBannerIdx] = useState(0);

  const activeProducts = useMemo(
    () => products.filter((p) => p.ativo !== false),
    [products]
  );

  const visibleBanners = useMemo(
    () => banners.filter((b) => b.visivel !== false),
    [banners]
  );

  useEffect(() => {
    if (visibleBanners.length <= 1) {
      setBannerIdx(0);
      return;
    }
    if (bannerIdx >= visibleBanners.length) {
      setBannerIdx(0);
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = window.setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % visibleBanners.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [visibleBanners.length, bannerIdx]);

  const primaryBanner = visibleBanners[bannerIdx] || visibleBanners[0] || null;

  const heroImage = resolveSafeMediaUrl(primaryBanner?.img, BRAND_ASSETS.heroMain);
  const heroTitle =
    primaryBanner?.titulo?.trim() || 'Alta Perfumaria Importada com Procedência Garantida';
  const heroSubtitle =
    primaryBanner?.desc?.trim() ||
    primaryBanner?.sub?.trim() ||
    'Fragrâncias icônicas selecionadas com curadoria rigorosa, pronta entrega e consultoria pessoal pelo WhatsApp.';

  const visibleCategories = useMemo(() => {
    const source = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    return source.filter((c) => !c.hidden && c.ativo !== false).slice(0, 4);
  }, [categories]);

  const featuredProducts = useMemo(() => {
    const list = [...activeProducts];
    list.sort((a, b) => {
      if (homeSort === 'menor') return extractPreco(a) - extractPreco(b);
      if (homeSort === 'maior') return extractPreco(b) - extractPreco(a);
      if (homeSort === 'az') return extractNome(a).localeCompare(extractNome(b), 'pt-BR');
      const aFeat = a.dest || a.destaque ? 1 : 0;
      const bFeat = b.dest || b.destaque ? 1 : 0;
      if (aFeat !== bFeat) return bFeat - aFeat;
      return (a.ordem ?? 999) - (b.ordem ?? 999);
    });
    return list.slice(0, 8);
  }, [activeProducts, homeSort]);

  const handleHeroCta = () => {
    const link = primaryBanner?.link?.trim();
    if (link === 'feminino' || link === 'masculino' || link === 'unissex' || link === 'kits' || link === 'catalogo' || link === 'como') {
      onNavigate(link);
      return;
    }
    onNavigate('catalogo');
  };

  return (
    <div className="space-y-12 sm:space-y-16 pb-8">
      {/* SECTION 1: HERO CAMPAIGN */}
      <section className="relative bg-[#1E1712] text-white overflow-hidden">
        <div
          onClick={primaryBanner?.somenteImagem ? handleHeroCta : undefined}
          className={`relative min-h-[260px] sm:min-h-[420px] lg:min-h-[500px] flex items-center ${
            primaryBanner?.somenteImagem ? 'cursor-pointer' : ''
          }`}
        >
          <SmartImage
            src={heroImage}
            fallbackSrc={BRAND_ASSETS.heroMain}
            alt={heroTitle}
            fit={primaryBanner?.fit || 'cover'}
            pos={primaryBanner?.pos || 'center'}
            priority
            containerClassName="absolute inset-0 w-full h-full bg-[#1E1712]"
          />

          {!primaryBanner?.somenteImagem && (
            <>
              <div
                className="absolute inset-0 bg-gradient-to-r from-[#1E1712]/90 via-[#1E1712]/65 to-[#1E1712]/25"
                aria-hidden="true"
              />

              <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 py-12 sm:py-16">
                <div className="max-w-xl space-y-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF6E] font-semibold">
                    {primaryBanner?.tag?.trim() || 'BW Parfum Imports · Curadoria Exclusiva'}
                  </p>

                  <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.06] text-white text-balance">
                    {heroTitle}
                  </h1>

                  <p className="text-sm sm:text-base text-[#E6DFD5] leading-relaxed max-w-lg">
                    {heroSubtitle}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleHeroCta}
                      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#9A7437] hover:bg-[#82602B] text-white text-sm font-semibold transition-colors min-h-[44px]"
                    >
                      {primaryBanner?.btnTxt?.trim() || 'Explorar Catálogo'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('como')}
                      className="inline-flex items-center gap-2 px-5 py-3.5 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/25 text-sm font-medium transition-colors min-h-[44px]"
                    >
                      Como Comprar
                    </button>
                  </div>

                  <p className="pt-2 text-xs text-[#CFC5B8] tracking-wide">
                    100% Originais · Envio Protegido · Parcelamento em até {settings.parcelas || 12}x
                  </p>
                </div>
              </div>
            </>
          )}

          {visibleBanners.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Banner anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  setBannerIdx((prev) => (prev - 1 + visibleBanners.length) % visibleBanners.length);
                }}
                className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Próximo banner"
                onClick={(e) => {
                  e.stopPropagation();
                  setBannerIdx((prev) => (prev + 1) % visibleBanners.length);
                }}
                className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
                {visibleBanners.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Ver banner ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBannerIdx(idx);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === bannerIdx ? 'w-6 bg-[#D4AF6E]' : 'w-2 bg-white/45 hover:bg-white/75'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* SECTION 2: CATEGORIAS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#9A7437] font-semibold">
              Famílias & Estilos
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#1E1712] mt-1">
              Navegue por Categoria
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('catalogo')}
            className="text-xs sm:text-sm font-semibold text-[#9A7437] hover:text-[#1E1712] inline-flex items-center gap-1 whitespace-nowrap"
          >
            Ver tudo <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {visibleCategories.map((cat) => {
            const catImg = resolveSafeMediaUrl(
              cat.img || cat.imgUrl,
              getCategoryFallbackImage(cat.slug)
            );
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.slug)}
                className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E6DFD5] bg-[#EFEAE2] text-left"
              >
                <SmartImage
                  src={catImg}
                  fallbackSrc={getCategoryFallbackImage(cat.slug)}
                  alt={cat.nome}
                  fit="cover"
                  className="transition-transform duration-500 group-hover:scale-105"
                  containerClassName="w-full h-full"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#1E1712]/80 via-[#1E1712]/20 to-transparent"
                  aria-hidden="true"
                />
                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 flex items-end justify-between">
                  <div>
                    <p className="font-display text-lg sm:text-xl font-semibold text-white">
                      {cat.nome}
                    </p>
                    <p className="text-[11px] text-[#E6DFD5]">Explorar seleção →</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: DESTAQUES DO CATÁLOGO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#9A7437] font-semibold">
              Seleção BW Parfum
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#1E1712] mt-1">
              Fragrâncias em Destaque
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="home-sort" className="sr-only">
              Ordenar destaques
            </label>
            <select
              id="home-sort"
              value={homeSort}
              onChange={(e) => setHomeSort(e.target.value as typeof homeSort)}
              className="px-3 py-2 rounded-lg bg-white border border-[#E0D9CF] text-xs font-medium text-[#1E1712] focus:outline-none focus:border-[#9A7437]"
            >
              <option value="destaques">Destaques</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="az">Ordem alfabética</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : featuredProducts.length === 0 ? (
          <div className="bg-white border border-[#E6DFD5] rounded-2xl p-10 text-center space-y-3">
            <p className="font-display text-2xl text-[#1E1712]">
              Catálogo em atualização
            </p>
            <p className="text-sm text-[#7A6E65] max-w-md mx-auto">
              Estamos preparando novas fragrâncias. Fale com nossa equipe pelo WhatsApp para consultar disponibilidade imediata.
            </p>
            <a
              href={buildWhatsappUrl(settings.wpp, 'Olá! Gostaria de consultar o catálogo da BW Parfum.')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold hover:bg-[#175533] transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Consultar no WhatsApp
            </a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
              {featuredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  inCart={cartIds.includes(p.id)}
                  inWishlist={wishlist.includes(p.id)}
                  showPix={settings.mostraPix !== false}
                  isAdmin={isAdmin}
                  onOpen={onOpenProduct}
                  onAddCart={onAddCart}
                  onToggleWish={onToggleWish}
                  onAdminEdit={onAdminEditProduct}
                  onAdminDelete={onAdminDeleteProduct}
                />
              ))}
            </div>

            {activeProducts.length > 8 && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => onNavigate('catalogo')}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-[#1E1712] bg-white hover:bg-[#1E1712] hover:text-white text-[#1E1712] text-xs font-semibold tracking-wider uppercase transition-colors"
                >
                  Ver todos os {activeProducts.length} perfumes
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* SECTION 4: EDITORIAL CONFIANÇA & ATENDIMENTO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-[#E6DFD5] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          <div className="relative min-h-[260px] sm:min-h-[340px] bg-[#EFEAE2]">
            <SmartImage
              src={BRAND_ASSETS.heroSecondary}
              fallbackSrc={BRAND_ASSETS.heroSecondary}
              alt="Curadoria BW Parfum Imports"
              fit="cover"
              containerClassName="absolute inset-0 w-full h-full"
            />
          </div>

          <div className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center space-y-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#9A7437] font-semibold">
              Confiança & Atendimento Direto
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#1E1712] leading-tight text-balance">
              Sua escolha com segurança do pedido à entrega
            </h2>
            <p className="text-sm text-[#5C5147] leading-relaxed">
              Cada pedido registrado no site gera um comprovante com código único e histórico de rastreio na sua conta, além de atendimento humano imediato no WhatsApp para tirar dúvidas sobre notas olfativas, pagamento e envio.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#F2EDE6]">
              <div>
                <ShieldCheck className="w-5 h-5 text-[#9A7437] mb-1.5" />
                <p className="text-xs font-semibold text-[#1E1712]">100% Originais</p>
                <p className="text-[11px] text-[#7A6E65]">Selados de procedência</p>
              </div>
              <div>
                <Truck className="w-5 h-5 text-[#9A7437] mb-1.5" />
                <p className="text-xs font-semibold text-[#1E1712]">Envio Protegido</p>
                <p className="text-[11px] text-[#7A6E65]">Embalagem reforçada</p>
              </div>
              <div>
                <Sparkles className="w-5 h-5 text-[#9A7437] mb-1.5" />
                <p className="text-xs font-semibold text-[#1E1712]">Consultoria</p>
                <p className="text-[11px] text-[#7A6E65]">Indicação sob medida</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('sobre')}
                className="px-5 py-2.5 rounded-lg border border-[#E0D9CF] hover:border-[#1E1712] text-xs font-semibold text-[#1E1712] transition-colors"
              >
                Sobre a BW Parfum
              </button>
              <a
                href={buildWhatsappUrl(
                  settings.wpp,
                  'Olá! Gostaria de uma recomendação de perfume da BW Parfum.'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1F6E43] hover:bg-[#175533] text-white text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Falar com Consultor
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/* ============================================================================
 * 2. CATALOG VIEW (Full Filtering + Fixed Real-Time Search)
 * ========================================================================== */
interface CatalogViewProps {
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  initialCategoryFilter: string;
  cartIds: string[];
  wishlist: string[];
  isAdmin: boolean;
  onOpenProduct: (id: string) => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  onAdminEditProduct: (id: string) => void;
  onAdminDeleteProduct: (id: string) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  products,
  categories,
  settings,
  searchQuery,
  onSearchChange,
  initialCategoryFilter,
  cartIds,
  wishlist,
  isAdmin,
  onOpenProduct,
  onAddCart,
  onToggleWish,
  onAdminEditProduct,
  onAdminDeleteProduct,
}) => {
  const activeProducts = useMemo(
    () => products.filter((p) => p.ativo !== false),
    [products]
  );

  const maxCatalogPrice = useMemo(() => {
    const prices = activeProducts.map((p) => extractPreco(p)).filter((n) => n > 0);
    const highest = prices.length ? Math.max(...prices) : 1000;
    return Math.max(100, Math.ceil(highest / 50) * 50);
  }, [activeProducts]);

  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter || '');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(maxCatalogPrice);
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [onlyStock, setOnlyStock] = useState(false);
  const [onlyFeat, setOnlyFeat] = useState(false);
  const [sortBy, setSortBy] = useState<'destaques' | 'menor' | 'maior' | 'az'>('destaques');
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setCategoryFilter(initialCategoryFilter || '');
    setVisibleCount(12);
  }, [initialCategoryFilter]);

  useEffect(() => {
    setMaxPriceFilter(maxCatalogPrice);
  }, [maxCatalogPrice]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    activeProducts.forEach((p) => {
      const m = extractMarca(p);
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeProducts]);

  const categoryOptions = useMemo(() => {
    const source = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    return source.filter((c) => !c.hidden && c.ativo !== false);
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const q = normalizeText(searchQuery);
    const list = activeProducts.filter((p) => {
      if (q) {
        const hay = normalizeText(
          `${extractNome(p)} ${extractMarca(p)} ${p.notas || ''} ${p.vol || ''}`
        );
        if (!hay.includes(q)) return false;
      }
      if (brandFilter && extractMarca(p) !== brandFilter) return false;
      if (categoryFilter && !matchesCategory(p, categoryFilter)) return false;
      if (extractPreco(p) > maxPriceFilter) return false;
      if (onlyPromo && !(p.promo || p.promocao || (p.precoOld ?? 0) > extractPreco(p)))
        return false;
      if (onlyStock && extractEstoque(p) <= 0) return false;
      if (onlyFeat && !(p.dest || p.destaque)) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'menor') return extractPreco(a) - extractPreco(b);
      if (sortBy === 'maior') return extractPreco(b) - extractPreco(a);
      if (sortBy === 'az') return extractNome(a).localeCompare(extractNome(b), 'pt-BR');
      const aFeat = a.dest || a.destaque ? 1 : 0;
      const bFeat = b.dest || b.destaque ? 1 : 0;
      if (aFeat !== bFeat) return bFeat - aFeat;
      return (a.ordem ?? 999) - (b.ordem ?? 999);
    });
    return list;
  }, [
    activeProducts,
    searchQuery,
    brandFilter,
    categoryFilter,
    maxPriceFilter,
    onlyPromo,
    onlyStock,
    onlyFeat,
    sortBy,
  ]);

  const clearFilters = () => {
    onSearchChange('');
    setBrandFilter('');
    setCategoryFilter('');
    setMaxPriceFilter(maxCatalogPrice);
    setOnlyPromo(false);
    setOnlyStock(false);
    setOnlyFeat(false);
    setVisibleCount(12);
  };

  const hasFilters =
    Boolean(searchQuery) ||
    Boolean(brandFilter) ||
    Boolean(categoryFilter) ||
    maxPriceFilter < maxCatalogPrice ||
    onlyPromo ||
    onlyStock ||
    onlyFeat;

  const displayed = filteredProducts.slice(0, visibleCount);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E6DFD5] pb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#9A7437] font-semibold">
            Catálogo Completo
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#1E1712] mt-1">
            Todas as Fragrâncias
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#7A6E65] tabular-nums">
          {filteredProducts.length}{' '}
          {filteredProducts.length === 1 ? 'perfume encontrado' : 'perfumes encontrados'}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E6DFD5] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search input synced with Header */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#8A7D6A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setVisibleCount(12);
              }}
              placeholder="Buscar por nome, marca ou nota..."
              className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-[#E0D9CF] text-xs text-[#1E1712] focus:outline-none focus:border-[#9A7437]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7D6A] hover:text-[#1E1712]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setVisibleCount(12);
            }}
            aria-label="Filtrar por categoria"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E0D9CF] bg-white text-xs text-[#1E1712] focus:outline-none focus:border-[#9A7437]"
          >
            <option value="">Todas as categorias</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>

          <select
            value={brandFilter}
            onChange={(e) => {
              setBrandFilter(e.target.value);
              setVisibleCount(12);
            }}
            aria-label="Filtrar por marca"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E0D9CF] bg-white text-xs text-[#1E1712] focus:outline-none focus:border-[#9A7437]"
          >
            <option value="">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Ordenar catálogo"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E0D9CF] bg-white text-xs text-[#1E1712] focus:outline-none focus:border-[#9A7437]"
          >
            <option value="destaques">Ordenar: Destaques</option>
            <option value="menor">Ordenar: Menor preço</option>
            <option value="maior">Ordenar: Maior preço</option>
            <option value="az">Ordenar: A - Z</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#F2EDE6]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyStock((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                onlyStock
                  ? 'bg-[#1E1712] text-white border-[#1E1712]'
                  : 'bg-[#FAF8F5] text-[#5C5147] border-[#E0D9CF] hover:border-[#9A7437]'
              }`}
            >
              Em estoque
            </button>
            <button
              type="button"
              onClick={() => setOnlyPromo((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                onlyPromo
                  ? 'bg-[#1E1712] text-white border-[#1E1712]'
                  : 'bg-[#FAF8F5] text-[#5C5147] border-[#E0D9CF] hover:border-[#9A7437]'
              }`}
            >
              Promoções
            </button>
            <button
              type="button"
              onClick={() => setOnlyFeat((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                onlyFeat
                  ? 'bg-[#1E1712] text-white border-[#1E1712]'
                  : 'bg-[#FAF8F5] text-[#5C5147] border-[#E0D9CF] hover:border-[#9A7437]'
              }`}
            >
              Destaques
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#A93226] hover:bg-[#FDECEA] transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 min-w-[220px]">
            <span className="text-xs text-[#6B5E53] whitespace-nowrap tabular-nums">
              Até <strong>R$ {formatBRL(maxPriceFilter)}</strong>
            </span>
            <input
              type="range"
              min={50}
              max={maxCatalogPrice}
              step={25}
              value={Math.min(Math.max(50, maxPriceFilter), maxCatalogPrice)}
              onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
              aria-label="Preço máximo"
              className="w-full accent-[#9A7437]"
            />
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {displayed.length === 0 ? (
        <div className="bg-white border border-[#E6DFD5] rounded-2xl p-12 text-center space-y-3">
          <p className="font-display text-2xl text-[#1E1712]">
            Nenhuma fragrância encontrada
          </p>
          <p className="text-sm text-[#7A6E65]">
            Tente ajustar os filtros ou buscar por parte do nome do perfume.
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-5 py-2.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] transition-colors"
            >
              Mostrar todos os perfumes
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
            {displayed.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                inCart={cartIds.includes(p.id)}
                inWishlist={wishlist.includes(p.id)}
                showPix={settings.mostraPix !== false}
                isAdmin={isAdmin}
                onOpen={onOpenProduct}
                onAddCart={onAddCart}
                onToggleWish={onToggleWish}
                onAdminEdit={onAdminEditProduct}
                onAdminDelete={onAdminDeleteProduct}
              />
            ))}
          </div>

          {filteredProducts.length > visibleCount && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + 12)}
                className="px-6 py-3 rounded-lg bg-white border border-[#1E1712] text-xs font-semibold text-[#1E1712] hover:bg-[#1E1712] hover:text-white transition-colors tabular-nums"
              >
                Carregar mais ({filteredProducts.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. CATEGORY VIEW (Feminino / Masculino / Unissex / Kits)
 * ========================================================================== */
interface CategoryViewProps {
  slug: 'fem' | 'masc' | 'uni' | 'kit';
  products: Product[];
  settings: StoreSettings;
  cartIds: string[];
  wishlist: string[];
  isAdmin: boolean;
  onOpenProduct: (id: string) => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  onAdminEditProduct: (id: string) => void;
  onAdminDeleteProduct: (id: string) => void;
  onAdminAddInCategory: () => void;
  onNavigateCatalog: () => void;
}

const CATEGORY_COPY: Record<
  CategoryViewProps['slug'],
  { title: string; subtitle: string; hero: string }
> = {
  fem: {
    title: 'Perfumes Femininos',
    subtitle:
      'Fragrâncias marcantes, florais sofisticados e orientais envolventes de alta fixação.',
    hero: BRAND_ASSETS.catFem,
  },
  masc: {
    title: 'Perfumes Masculinos',
    subtitle:
      'Notas amadeiradas, especiadas e frescas para presença elegante em qualquer ocasião.',
    hero: BRAND_ASSETS.catMasc,
  },
  uni: {
    title: 'Perfumes Unissex',
    subtitle:
      'Composições autorais compartilháveis com âmbar, oud, baunilha e cítricos nobres.',
    hero: BRAND_ASSETS.catUni,
  },
  kit: {
    title: 'Kits & Presentes',
    subtitle:
      'Conjuntos exclusivos em apresentação especial para presentear com requinte.',
    hero: BRAND_ASSETS.catKit,
  },
};

export const CategoryView: React.FC<CategoryViewProps> = ({
  slug,
  products,
  settings,
  cartIds,
  wishlist,
  isAdmin,
  onOpenProduct,
  onAddCart,
  onToggleWish,
  onAdminEditProduct,
  onAdminDeleteProduct,
  onAdminAddInCategory,
  onNavigateCatalog,
}) => {
  const [sortBy, setSortBy] = useState<'destaques' | 'menor' | 'maior' | 'az'>('destaques');
  const meta = CATEGORY_COPY[slug];

  const items = useMemo(() => {
    const filtered = products.filter(
      (p) => p.ativo !== false && matchesCategory(p, slug)
    );
    filtered.sort((a, b) => {
      if (sortBy === 'menor') return extractPreco(a) - extractPreco(b);
      if (sortBy === 'maior') return extractPreco(b) - extractPreco(a);
      if (sortBy === 'az') return extractNome(a).localeCompare(extractNome(b), 'pt-BR');
      return (a.ordem ?? 999) - (b.ordem ?? 999);
    });
    return filtered;
  }, [products, slug, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="relative rounded-2xl overflow-hidden bg-[#1E1712] text-white min-h-[180px] sm:min-h-[220px] flex items-end">
        <SmartImage
          src={meta.hero}
          alt={meta.title}
          fit="cover"
          priority
          containerClassName="absolute inset-0 w-full h-full"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#1E1712]/90 via-[#1E1712]/65 to-transparent"
          aria-hidden="true"
        />
        <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between w-full gap-4">
          <div className="max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF6E] font-semibold">
              Coleção BW Parfum
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-1">
              {meta.title}
            </h1>
            <p className="text-xs sm:text-sm text-[#E6DFD5] mt-1.5">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={onAdminAddInCategory}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#9A7437] text-white text-xs font-semibold hover:bg-[#82602B] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Produto
              </button>
            )}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Ordenar categoria"
              className="px-3 py-2 rounded-lg bg-white/95 text-[#1E1712] text-xs font-medium focus:outline-none"
            >
              <option value="destaques">Destaques</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="az">A - Z</option>
            </select>
          </div>
        </div>
      </div>

      <p className="text-xs text-[#7A6E65] tabular-nums">
        {items.length} {items.length === 1 ? 'fragrância disponível' : 'fragrâncias disponíveis'}
      </p>

      {items.length === 0 ? (
        <div className="bg-white border border-[#E6DFD5] rounded-2xl p-10 text-center space-y-3">
          <p className="font-display text-2xl text-[#1E1712]">
            Em breve novos lançamentos nesta coleção
          </p>
          <button
            type="button"
            onClick={onNavigateCatalog}
            className="px-5 py-2.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] transition-colors"
          >
            Ver catálogo completo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              inCart={cartIds.includes(p.id)}
              inWishlist={wishlist.includes(p.id)}
              showPix={settings.mostraPix !== false}
              isAdmin={isAdmin}
              onOpen={onOpenProduct}
              onAddCart={onAddCart}
              onToggleWish={onToggleWish}
              onAdminEdit={onAdminEditProduct}
              onAdminDelete={onAdminDeleteProduct}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. COMO COMPRAR VIEW (4 Steps + FAQ)
 * ========================================================================== */
const FAQ_ITEMS = [
  {
    q: 'Os perfumes são 100% originais?',
    a: 'Sim. Trabalhamos exclusivamente com perfumes importados originais, lacrados de fábrica e com procedência garantida.',
  },
  {
    q: 'Como funciona o pagamento após o pedido no site?',
    a: 'Ao finalizar sua sacola, o pedido é salvo com segurança no seu histórico e o resumo completo é aberto no WhatsApp da BW Parfum para envio da chave PIX ou link seguro de parcelamento no cartão.',
  },
  {
    q: 'Como acompanho o envio e código de rastreio?',
    a: 'Assim que o pedido é postado, nossa equipe atualiza o status e o código de rastreio diretamente na área "Minha Conta > Meus Pedidos" e também avisa pelo WhatsApp.',
  },
  {
    q: 'Posso tirar dúvidas sobre fragrâncias parecidas antes de comprar?',
    a: 'Com certeza. Nossa equipe faz consultoria olfativa pelo WhatsApp indicando opções de acordo com as notas que você mais gosta.',
  },
];

export const ComoComprarView: React.FC<{
  settings: StoreSettings;
  onNavigateCatalog: () => void;
}> = ({ settings, onNavigateCatalog }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const steps = [
    {
      num: '01',
      title: 'Explore o Catálogo',
      desc: 'Busque por nome, marca ou notas olfativas e confira preço no PIX, parcelamento e disponibilidade real.',
    },
    {
      num: '02',
      title: 'Adicione à Sacola',
      desc: 'Escolha suas fragrâncias favoritas e ajuste as quantidades diretamente no painel lateral da sacola.',
    },
    {
      num: '03',
      title: 'Preencha seu Endereço',
      desc: 'Digite seu CEP para preenchimento automático de rua, cidade e estado e escolha PIX ou cartão.',
    },
    {
      num: '04',
      title: 'Confirme no WhatsApp',
      desc: 'Seu pedido fica salvo na sua conta com código de acompanhamento e o WhatsApp abre pronto com o resumo.',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#9A7437] font-semibold">
          Passo a Passo Simples
        </p>
        <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[#1E1712] text-balance">
          Como Comprar na BW Parfum
        </h1>
        <p className="text-sm text-[#5C5147]">
          Transparência total em cada etapa, com pedido registrado e atendimento humano direto.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {steps.map((s) => (
          <div
            key={s.num}
            className="bg-white border border-[#E6DFD5] rounded-2xl p-6 space-y-2"
          >
            <span className="font-display text-2xl font-semibold text-[#9A7437] tabular-nums">
              {s.num}
            </span>
            <h2 className="text-base font-semibold text-[#1E1712]">{s.title}</h2>
            <p className="text-xs sm:text-sm text-[#5C5147] leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#1E1712] text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">
            Precisa de ajuda para escolher seu perfume?
          </h2>
          <p className="text-xs sm:text-sm text-[#D6CBB9]">
            Atendimento rápido pelo WhatsApp para recomendações, estoque e frete.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={onNavigateCatalog}
            className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
          >
            Ir ao Catálogo
          </button>
          <a
            href={buildWhatsappUrl(settings.wpp, 'Olá! Gostaria de ajuda para escolher um perfume.')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#1F6E43] hover:bg-[#175533] text-white text-xs font-semibold transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Falar no WhatsApp
          </a>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
          Perguntas Frequentes
        </h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={item.q}
                className="bg-white border border-[#E6DFD5] rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-semibold text-[#1E1712]"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#9A7437] shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs sm:text-sm text-[#5C5147] leading-relaxed border-t border-[#F2EDE6] pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. SOBRE VIEW
 * ========================================================================== */
export const SobreView: React.FC<{
  settings: StoreSettings;
  onNavigateCatalog: () => void;
}> = ({ settings, onNavigateCatalog }) => (
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
    <div className="bg-white border border-[#E6DFD5] rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
      <div className="relative min-h-[260px] bg-[#EFEAE2]">
        <SmartImage
          src={BRAND_ASSETS.heroMain}
          alt="BW Parfum Imports"
          fit="cover"
          priority
          containerClassName="absolute inset-0 w-full h-full"
        />
      </div>
      <div className="p-6 sm:p-10 flex flex-col justify-center space-y-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#9A7437] font-semibold">
          Nossa História & Propósito
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#1E1712] leading-tight">
          {settings.nome || 'BW Parfum Imports'}
        </h1>
        <p className="text-sm text-[#5C5147] leading-relaxed">
          Nascemos com a missão de aproximar você das grandes casas de perfumaria internacional com transparência, autenticidade comprovada e atendimento próximo — sem complicações.
        </p>
        <blockquote className="py-3 px-4 bg-[#FAF8F5] border-t border-b border-[#E6DFD5] font-display italic text-lg text-[#1E1712]">
          &ldquo;Uma fragrância original não é apenas um aroma; é a assinatura silenciosa da sua presença.&rdquo;
        </blockquote>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onNavigateCatalog}
            className="px-5 py-2.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] transition-colors"
          >
            Explorar Catálogo
          </button>
          <a
            href={buildWhatsappUrl(settings.wpp, 'Olá! Vim pelo site da BW Parfum.')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-[#1F6E43]" />
            Atendimento WhatsApp
          </a>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white border border-[#E6DFD5] rounded-2xl p-6 space-y-2">
        <ShieldCheck className="w-6 h-6 text-[#9A7437]" />
        <h2 className="text-base font-semibold text-[#1E1712]">Procedência Garantida</h2>
        <p className="text-xs text-[#5C5147] leading-relaxed">
          Apenas frascos originais lacrados e verificados para assegurar fixação e projeção fiéis.
        </p>
      </div>
      <div className="bg-white border border-[#E6DFD5] rounded-2xl p-6 space-y-2">
        <Truck className="w-6 h-6 text-[#9A7437]" />
        <h2 className="text-base font-semibold text-[#1E1712]">Logística Segura</h2>
        <p className="text-xs text-[#5C5147] leading-relaxed">
          Proteção reforçada para vidros e acompanhamento passo a passo com código de rastreio na sua conta.
        </p>
      </div>
      <div className="bg-white border border-[#E6DFD5] rounded-2xl p-6 space-y-2">
        <Sparkles className="w-6 h-6 text-[#9A7437]" />
        <h2 className="text-base font-semibold text-[#1E1712]">Curadoria Especializada</h2>
        <p className="text-xs text-[#5C5147] leading-relaxed">
          Seleção equilibrada de clássicos consagrados e lançamentos desejados masculinos, femininos e unissex.
        </p>
      </div>
    </div>
  </div>
);
