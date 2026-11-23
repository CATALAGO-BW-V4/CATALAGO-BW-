import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Tags,
  Image as ImageIcon,
  ShoppingCart,
  Users,
  Star,
  Settings as SettingsIcon,
  RefreshCw,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Download,
  MessageCircle,
  Upload,
  ShoppingBag,
  Wallet,
  History,
  BarChart3,
  Calculator,
  CheckCircle2,
  Minus,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { sendEmailVerification, type User as FirebaseUser } from 'firebase/auth';
import { db, storage } from '../lib/firebase';
import type {
  Banner,
  Category,
  ClientBw,
  ClientProfile,
  Order,
  OrderStatus,
  OrderTracking,
  Product,
  ProductCost,
  Review,
  SaleBw,
  SaleCartItem,
  SalePaymentMethod,
  StoreSettings,
} from '../types';
import {
  buildWhatsappUrl,
  cleanDigits,
  extractEstoque,
  extractImg,
  extractMarca,
  extractNome,
  extractPreco,
  extractPrecoPix,
  formatBRL,
  normalizeText,
  sanitizeDocId,
  sanitizeProductForFirestore,
} from '../lib/format';
import {
  BW_CONFIG,
  auditProductPrices,
  calculatePaymentNet,
  calculateProductPricing,
  formatCurrencyBRL,
  formatDateISOToBR,
  getMonthISO,
  getMonthRange,
  getTodayISO,
  roundCurrency,
} from '../lib/bwMath';
import { SmartImage } from './SmartImage';
import { ImageCropperModal } from './ImageCropperModal';
import { AdminPdvSection } from './AdminPdvSection';
import { AdminFiadosSection } from './AdminFiadosSection';
import { AdminHistoricoBwSection } from './AdminHistoricoBwSection';
import { AdminRelatoriosSection } from './AdminRelatoriosSection';

interface AdminViewProps {
  user: FirebaseUser;
  products: Product[];
  categories: Category[];
  banners: Banner[];
  settings: StoreSettings;
  initialEditProductId?: string | null;
  onClearInitialEdit?: () => void;
  onBackStore: () => void;
  onRefreshData: () => Promise<void>;
  onImportLegacyCatalog?: () => Promise<number>;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

type AdminSection =
  | 'dashboard'
  | 'vender'
  | 'fiados'
  | 'historico'
  | 'relatorios'
  | 'produtos'
  | 'categorias'
  | 'banners'
  | 'pedidos'
  | 'clientes'
  | 'reviews'
  | 'configs'
  | 'sync';

const ORDER_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em Preparo',
  enviado: 'Enviado',
  saiu_entrega: 'Saiu p/ Entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const NEXT_STATUS: Record<string, OrderStatus[]> = {
  pendente: ['confirmado', 'cancelado'],
  confirmado: ['em_preparo', 'cancelado'],
  em_preparo: ['enviado', 'cancelado'],
  enviado: ['saiu_entrega', 'entregue', 'cancelado'],
  saiu_entrega: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
};

export const AdminView: React.FC<AdminViewProps> = ({
  user,
  products,
  categories,
  banners,
  settings,
  initialEditProductId,
  onClearInitialEdit,
  onBackStore,
  onRefreshData,
  onImportLegacyCatalog,
  onToast,
}) => {
  const [section, setSection] = useState<AdminSection>('dashboard');

  // Data collections managed inside admin
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [salesBw, setSalesBw] = useState<SaleBw[]>([]);
  const [clientsBw, setClientsBw] = useState<ClientBw[]>([]);
  const [productCosts, setProductCosts] = useState<Record<string, ProductCost>>({});
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingSalesBw, setLoadingSalesBw] = useState(false);
  const [loadingClientsBw, setLoadingClientsBw] = useState(false);

  // PDV prefill state (from Estoque or Clientes PDV shortcut)
  const [prefillPdvProductId, setPrefillPdvProductId] = useState<string | null>(null);
  const [prefillPdvClient, setPrefillPdvClient] = useState<ClientBw | null>(null);

  // Filters
  const [prodSearch, setProdSearch] = useState('');
  const [prodCatFilter, setProdCatFilter] = useState('');
  const [prodStatusFilter, setProdStatusFilter] = useState('');
  const [selectedProdIds, setSelectedProdIds] = useState<Set<string>>(new Set());
  const [orderFilter, setOrderFilter] = useState('todos');
  const [clientSearch, setClientSearch] = useState('');
  const [clientTab, setClientTab] = useState<'pdv' | 'online'>('pdv');
  const [reviewFilter, setReviewFilter] = useState('todos');

  // Clientes PDV form & confirmation state
  const [clientBwFormOpen, setClientBwFormOpen] = useState(false);
  const [clientBwEditId, setClientBwEditId] = useState('');
  const [cbNome, setCbNome] = useState('');
  const [cbContato, setCbContato] = useState('');
  const [cbEndereco, setCbEndereco] = useState('');
  const [savingClientBw, setSavingClientBw] = useState(false);
  const [confirmDeleteClientBwId, setConfirmDeleteClientBwId] = useState<string | null>(null);

  // Posting storefront order to Vendas BW caixa
  const [postingOrderId, setPostingOrderId] = useState<string | null>(null);

  // Product Form State
  const [prodFormOpen, setProdFormOpen] = useState(false);
  const [prodEditId, setProdEditId] = useState('');
  const [pNome, setPNome] = useState('');
  const [pMarca, setPMarca] = useState('');
  const [pPreco, setPPreco] = useState('');
  const [pPix, setPPix] = useState('');
  const [pOld, setPOld] = useState('');
  const [pEstq, setPEstq] = useState('10');
  const [pVol, setPVol] = useState('');
  const [pCat, setPCat] = useState('fem');
  const [pNotas, setPNotas] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pEstqAlert, setPEstqAlert] = useState('5');
  const [pOrdem, setPOrdem] = useState('0');
  const [pAtivo, setPAtivo] = useState(true);
  const [pDest, setPDest] = useState(false);
  const [pPromo, setPPromo] = useState(false);
  const [pImgUrl, setPImgUrl] = useState('');
  const [pPendingBlob, setPPendingBlob] = useState<{ blob: Blob; ext: string; mime: string } | null>(null);
  const [savingProd, setSavingProd] = useState(false);

  // Product Private Cost & Margin Calculator (stored only in custos_produtos)
  const [pCusto, setPCusto] = useState('');
  const [pFrete, setPFrete] = useState(String(BW_CONFIG.FRETE_PADRAO));
  const [pDesloc, setPDesloc] = useState(String(BW_CONFIG.DESLOC_PADRAO));
  const [pMargem, setPMargem] = useState(String(BW_CONFIG.MARGEM_PADRAO));
  const [pTaxaCartao, setPTaxaCartao] = useState(String(BW_CONFIG.TAXA_CARTAO * 100));
  const [autoSyncPricing, setAutoSyncPricing] = useState(true);

  // Category Form State
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catEditId, setCatEditId] = useState('');
  const [cNome, setCNome] = useState('');
  const [cSlug, setCSlug] = useState('');
  const [cIco, setCIco] = useState('');
  const [cImgUrl, setCImgUrl] = useState('');
  const [cVisivel, setCVisivel] = useState(true);
  const [cPendingBlob, setCPendingBlob] = useState<{ blob: Blob; ext: string; mime: string } | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Banner Form State
  const [banFormOpen, setBanFormOpen] = useState(false);
  const [banEditIdx, setBanEditIdx] = useState<number>(-1);
  const [bTitulo, setBTitulo] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bTag, setBTag] = useState('DESTAQUE');
  const [bBtnTxt, setBBtnTxt] = useState('Ver Coleção →');
  const [bLink, setBLink] = useState('catalogo');
  const [bFit, setBFit] = useState<'cover' | 'contain'>('cover');
  const [bPos, setBPos] = useState<'center' | 'top' | 'bottom'>('center');
  const [bSomenteImagem, setBSomenteImagem] = useState(false);
  const [bVisivel, setBVisivel] = useState(true);
  const [bImgUrl, setBImgUrl] = useState('');
  const [bPendingBlob, setBPendingBlob] = useState<{ blob: Blob; ext: string; mime: string } | null>(null);
  const [savingBan, setSavingBan] = useState(false);

  // Tracking inline drafts per order
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, OrderTracking>>({});
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [confirmClearCancelled, setConfirmClearCancelled] = useState(false);
  const [clearingCancelled, setClearingCancelled] = useState(false);

  // Settings form
  const [cfgForm, setCfgForm] = useState<StoreSettings>({});
  const [savingCfg, setSavingCfg] = useState(false);

  // Sync logs
  const [syncLogs, setSyncLogs] = useState<string>('Aguardando sincronização...');
  const [syncing, setSyncing] = useState(false);

  // Image cropper state
  const [cropConfig, setCropConfig] = useState<{
    target: 'prod' | 'cat' | 'ban';
    file: File;
    aspect: number;
    maxW: number;
    maxH: number;
  } | null>(null);

  useEffect(() => {
    setCfgForm({ ...settings });
  }, [settings]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const snap = await getDocs(query(collection(db, 'pedidos'), orderBy('criadoEm', 'desc'), limit(200)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
      setOrders(list);
      const drafts: Record<string, OrderTracking> = {};
      list.forEach((o) => {
        const rt = (typeof o.rastreio === 'object' ? o.rastreio : {}) as OrderTracking;
        drafts[o.id] = {
          tipo: rt.tipo || '',
          transportadora: rt.transportadora || '',
          codigo: rt.codigo || rt.codigoRastreio || '',
          url: rt.url || rt.urlRastreio || '',
          previsao: rt.previsao || '',
        };
      });
      setTrackingDrafts(drafts);
    } catch (err) {
      console.warn('Erro ao carregar pedidos:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const snap = await getDocs(collection(db, 'clients'));
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientProfile));
    } catch (err) {
      console.warn('Erro ao carregar clientes:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), orderBy('criadoEm', 'desc')));
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review));
    } catch (err) {
      console.warn('Erro ao carregar avaliações:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const loadSalesBw = async () => {
    setLoadingSalesBw(true);
    try {
      const snap = await getDocs(collection(db, 'vendas_bw'));
      setSalesBw(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleBw));
    } catch (err) {
      console.warn('Erro ao carregar vendas BW:', err);
    } finally {
      setLoadingSalesBw(false);
    }
  };

  const loadClientsBw = async () => {
    setLoadingClientsBw(true);
    try {
      const snap = await getDocs(collection(db, 'clientes_bw'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientBw);
      list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      setClientsBw(list);
    } catch (err) {
      console.warn('Erro ao carregar clientes BW:', err);
    } finally {
      setLoadingClientsBw(false);
    }
  };

  const loadProductCosts = async () => {
    try {
      const snap = await getDocs(collection(db, 'custos_produtos'));
      const map: Record<string, ProductCost> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() } as ProductCost;
      });
      setProductCosts(map);
    } catch (err) {
      console.warn('Erro ao carregar custos de produtos:', err);
    }
  };

  useEffect(() => {
    loadOrders();
    loadClients();
    loadReviews();
    loadSalesBw();
    loadClientsBw();
    loadProductCosts();
  }, []);

  useEffect(() => {
    if (!initialEditProductId) return;
    const p = products.find((x) => x.id === initialEditProductId);
    if (p) {
      setSection('produtos');
      openEditProduct(p);
      onClearInitialEdit?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditProductId, products]);

  const uploadOptimizedBlob = async (
    blobData: { blob: Blob; ext: string },
    folder: string,
    slugBase: string
  ): Promise<string> => {
    const safeName = (slugBase || 'imagem').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const r = storageRef(storage, `${folder}/${Date.now()}_${safeName}.${blobData.ext}`);
    await uploadBytes(r, blobData.blob);
    return getDownloadURL(r);
  };

  // ── PRODUCT CRUD & COSTS ──
  const openNewProduct = () => {
    setProdFormOpen(true);
    setProdEditId('');
    setPNome('');
    setPMarca('');
    setPPreco('');
    setPPix('');
    setPOld('');
    setPEstq('10');
    setPVol('');
    setPCat('fem');
    setPNotas('');
    setPDesc('');
    setPEstqAlert(String(settings.estoqueAlerta || 5));
    setPOrdem('0');
    setPAtivo(true);
    setPDest(false);
    setPPromo(false);
    setPImgUrl('');
    setPPendingBlob(null);
    setPCusto('');
    setPFrete(String(BW_CONFIG.FRETE_PADRAO));
    setPDesloc(String(BW_CONFIG.DESLOC_PADRAO));
    setPMargem(String(BW_CONFIG.MARGEM_PADRAO));
    setPTaxaCartao(String(BW_CONFIG.TAXA_CARTAO * 100));
    setAutoSyncPricing(true);
  };

  const openEditProduct = (p: Product) => {
    setProdFormOpen(true);
    setProdEditId(p.id);
    setPNome(extractNome(p));
    setPMarca(extractMarca(p));
    setPPreco(String(p.preco ?? p.price ?? p.precoCartao ?? ''));
    setPPix(String(p.precoPix ?? p.pix ?? ''));
    setPOld(String(p.precoOld ?? p.de ?? ''));
    setPEstq(String(p.estoqueQtd ?? p.estoque ?? p.stock ?? 0));
    setPVol(p.vol || p.ml || '');
    setPCat(p.cat || p.categoria || 'fem');
    setPNotas(p.notas || '');
    setPDesc(p.desc || p.descricao || '');
    setPEstqAlert(String(p.estoqueAlerta ?? settings.estoqueAlerta ?? 5));
    setPOrdem(String(p.ordem ?? 0));
    setPAtivo(p.ativo !== false);
    setPDest(Boolean(p.dest || p.destaque));
    setPPromo(Boolean(p.promo || p.promocao));
    setPImgUrl(extractImg(p));
    setPPendingBlob(null);

    const costRec = productCosts[p.id];
    if (costRec) {
      setPCusto(costRec.custo ? String(costRec.custo) : '');
      setPFrete(String(costRec.frete ?? BW_CONFIG.FRETE_PADRAO));
      setPDesloc(String(costRec.deslocamento ?? BW_CONFIG.DESLOC_PADRAO));
      setPMargem(String(costRec.margem ?? BW_CONFIG.MARGEM_PADRAO));
    } else {
      setPCusto('');
      setPFrete(String(BW_CONFIG.FRETE_PADRAO));
      setPDesloc(String(BW_CONFIG.DESLOC_PADRAO));
      setPMargem(String(BW_CONFIG.MARGEM_PADRAO));
    }
    setPTaxaCartao(String(BW_CONFIG.TAXA_CARTAO * 100));
    setAutoSyncPricing(false);
  };

  const calcPreview = calculateProductPricing(pCusto, pFrete, pDesloc, pMargem, pTaxaCartao);
  const priceAudit = auditProductPrices(
    calcPreview.totalCusto,
    parseFloat(pPreco) || 0,
    parseFloat(pPix) || 0,
    pTaxaCartao
  );

  const syncPricesIfEnabled = (
    nextCusto: string,
    nextFrete: string,
    nextDesloc: string,
    nextMargem: string,
    nextTaxa: string,
    force = false
  ) => {
    if (!force && !autoSyncPricing) return;
    if ((parseFloat(nextCusto) || 0) <= 0) return;
    const nextCalc = calculateProductPricing(nextCusto, nextFrete, nextDesloc, nextMargem, nextTaxa);
    setPPix(nextCalc.vPix.toFixed(2));
    setPPreco(nextCalc.vCartao.toFixed(2));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pNome.trim()) {
      onToast('Informe o nome do produto.', 'er');
      return;
    }
    setSavingProd(true);
    try {
      let finalImg = pImgUrl.trim();
      if (pPendingBlob) {
        finalImg = await uploadOptimizedBlob(pPendingBlob, 'produtos', pNome);
      }

      let finalCartao = Math.max(0, roundCurrency(parseFloat(pPreco) || 0));
      let finalPix = Math.max(0, roundCurrency(parseFloat(pPix) || 0));
      const custoNum = roundCurrency(Math.max(0, parseFloat(pCusto) || 0));
      const freteNum = roundCurrency(Math.max(0, parseFloat(pFrete) || 0));
      const deslocNum = roundCurrency(Math.max(0, parseFloat(pDesloc) || 0));
      const margemNum = Math.min(1000, Math.max(0, parseFloat(pMargem) || 0));
      const pricing = calculateProductPricing(custoNum, freteNum, deslocNum, margemNum, pTaxaCartao);

      if (finalCartao === 0 && finalPix === 0 && custoNum > 0) {
        finalCartao = pricing.vCartao;
        finalPix = pricing.vPix;
      } else if (finalCartao === 0 && finalPix > 0) {
        finalCartao = roundCurrency(finalPix * pricing.fatorAcrescimo);
      } else if (finalPix === 0 && finalCartao > 0) {
        finalPix = roundCurrency(finalCartao / pricing.fatorAcrescimo);
      }

      const payload: Record<string, unknown> = {
        nome: pNome.trim().slice(0, 160),
        marca: pMarca.trim().slice(0, 100),
        preco: finalCartao,
        precoPix: finalPix,
        precoOld: Math.max(0, parseFloat(pOld) || 0),
        estoqueQtd: Math.max(0, parseInt(pEstq, 10) || 0),
        vol: pVol.trim().slice(0, 40),
        cat: pCat.trim().slice(0, 40),
        notas: pNotas.trim().slice(0, 300),
        desc: pDesc.trim().slice(0, 3000),
        estoqueAlerta: Math.max(1, parseInt(pEstqAlert, 10) || 5),
        ordem: parseInt(pOrdem, 10) || 0,
        ativo: pAtivo,
        dest: pDest,
        promo: pPromo,
        imgUrl: finalImg,
        updAt: serverTimestamp(),
      };

      let savedProdId = prodEditId;
      if (prodEditId) {
        await updateDoc(doc(db, 'produtos', prodEditId), payload);
        onToast('Produto atualizado.', 'ok');
      } else {
        const created = await addDoc(collection(db, 'produtos'), {
          ...payload,
          views: 0,
          vendas: 0,
          criadoEm: serverTimestamp(),
        });
        savedProdId = created.id;
        onToast('Produto criado.', 'ok');
      }

      // Persist private cost metrics exclusively in custos_produtos (never on public produtos)
      if (savedProdId && (custoNum > 0 || productCosts[savedProdId])) {
        await setDoc(
          doc(db, 'custos_produtos', savedProdId),
          {
            custo: custoNum,
            frete: freteNum,
            deslocamento: deslocNum,
            margem: margemNum,
            custoBase: roundCurrency(custoNum + freteNum + deslocNum),
            custoUnitario: pricing.totalCusto,
            vendaPix: finalPix || pricing.vPix,
            vendaCartao: finalCartao || pricing.vCartao,
            atualizadoEm: new Date().toISOString(),
          },
          { merge: true }
        );
        await loadProductCosts();
      }

      setProdFormOpen(false);
      setPPendingBlob(null);
      await onRefreshData();
    } catch (err) {
      onToast(`Erro ao salvar produto: ${(err as Error).message}`, 'er');
    } finally {
      setSavingProd(false);
    }
  };

  const handleQuickAdjustStock = async (p: Product, delta: number) => {
    const atual = extractEstoque(p);
    const novo = Math.max(0, atual + delta);
    try {
      await updateDoc(doc(db, 'produtos', p.id), {
        estoqueQtd: novo,
        updAt: serverTimestamp(),
      });
      await onRefreshData();
      onToast(`Estoque de ${extractNome(p)} atualizado para ${novo} un.`, 'ok');
    } catch {
      onToast('Erro ao ajustar estoque.', 'er');
    }
  };

  const handleDuplicateProduct = async (p: Product) => {
    try {
      await addDoc(collection(db, 'produtos'), {
        nome: `${extractNome(p)} (cópia)`.slice(0, 160),
        marca: extractMarca(p),
        preco: extractPreco(p),
        precoPix: p.precoPix ?? 0,
        precoOld: p.precoOld ?? 0,
        estoqueQtd: extractEstoque(p),
        vol: p.vol || '',
        cat: p.cat || 'fem',
        notas: p.notas || '',
        desc: p.desc || '',
        imgUrl: extractImg(p),
        ativo: false,
        dest: false,
        promo: false,
        views: 0,
        vendas: 0,
        criadoEm: serverTimestamp(),
        updAt: serverTimestamp(),
      });
      onToast('Produto duplicado como inativo.', 'ok');
      await onRefreshData();
    } catch {
      onToast('Não foi possível duplicar o produto.', 'er');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'produtos', id));
      onToast('Produto excluído.', 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao excluir produto.', 'er');
    }
  };

  const handleBulkActive = async (ativo: boolean) => {
    if (selectedProdIds.size === 0) {
      onToast('Selecione ao menos um produto.', 'er');
      return;
    }
    try {
      const batch = writeBatch(db);
      selectedProdIds.forEach((id) => {
        batch.update(doc(db, 'produtos', id), { ativo, updAt: serverTimestamp() });
      });
      await batch.commit();
      setSelectedProdIds(new Set());
      onToast(`${selectedProdIds.size} produtos atualizados.`, 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao atualizar produtos selecionados.', 'er');
    }
  };

  // ── CATEGORY CRUD ──
  const openEditCat = (c?: Category) => {
    setCatFormOpen(true);
    setCatEditId(c?.id || '');
    setCNome(c?.nome || '');
    setCSlug(c?.slug || '');
    setCIco(c?.ico || c?.icon || '');
    setCImgUrl(c?.img || c?.imgUrl || '');
    setCVisivel(c ? c.hidden !== true && c.ativo !== false : true);
    setCPendingBlob(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = cSlug.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cNome.trim() || !cleanSlug) {
      onToast('Informe nome e slug válidos.', 'er');
      return;
    }
    setSavingCat(true);
    try {
      let finalImg = cImgUrl.trim();
      if (cPendingBlob) {
        finalImg = await uploadOptimizedBlob(cPendingBlob, 'categorias', cleanSlug);
      }
      const payload = {
        nome: cNome.trim().slice(0, 80),
        slug: cleanSlug.slice(0, 40),
        ico: cIco.trim().slice(0, 16),
        icon: cIco.trim().slice(0, 16),
        img: finalImg,
        hidden: !cVisivel,
        updAt: serverTimestamp(),
      };
      if (catEditId) {
        await updateDoc(doc(db, 'categories', catEditId), payload);
      } else {
        await addDoc(collection(db, 'categories'), {
          ...payload,
          criadoEm: serverTimestamp(),
        });
      }
      setCatFormOpen(false);
      onToast('Categoria salva.', 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao salvar categoria.', 'er');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
      onToast('Categoria removida.', 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao excluir categoria.', 'er');
    }
  };

  // ── BANNER CRUD ──
  const openEditBanner = (idx: number) => {
    const b = idx >= 0 ? banners[idx] : undefined;
    setBanFormOpen(true);
    setBanEditIdx(idx);
    setBTitulo(b?.titulo || '');
    setBDesc(b?.desc || b?.sub || '');
    setBTag(b?.tag || 'COLEÇÃO');
    setBBtnTxt(b?.btnTxt || 'Ver Coleção →');
    setBLink(b?.link || 'catalogo');
    setBFit(b?.fit || 'cover');
    setBPos(b?.pos || 'center');
    setBSomenteImagem(Boolean(b?.somenteImagem));
    setBVisivel(b ? b.visivel !== false : true);
    setBImgUrl(b?.img || '');
    setBPendingBlob(null);
  };

  const applySeasonalTemplate = (preset: 'natal' | 'black' | 'maes' | 'padrao') => {
    if (preset === 'natal') {
      setBTag('ESPECIAL DE NATAL');
      setBTitulo('Presenteie com Perfumaria de Luxo');
      setBDesc('Fragrâncias importadas e kits exclusivos para celebrar o Natal com sofisticação.');
      setBBtnTxt('Ver Presentes →');
      setBLink('kits');
    } else if (preset === 'black') {
      setBTag('BLACK FRIDAY BW');
      setBTitulo('Seleção Especial com Condições Únicas');
      setBDesc('Perfumes originais com condições exclusivas no PIX e parcelamento.');
      setBBtnTxt('Aproveitar Ofertas →');
      setBLink('catalogo');
    } else if (preset === 'maes') {
      setBTag('DIA DAS MÃES');
      setBTitulo('Fragrâncias Inesquecíveis para Ela');
      setBDesc('Perfumes femininos e kits presenteáveis com envio seguro para todo o Brasil.');
      setBBtnTxt('Ver Femininos →');
      setBLink('feminino');
    } else {
      setBTag('NOVA COLEÇÃO');
      setBTitulo('Alta Perfumaria Importada');
      setBDesc('Fragrâncias originais lacradas com atendimento consultivo pelo WhatsApp.');
      setBBtnTxt('Explorar Catálogo →');
      setBLink('catalogo');
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBan(true);
    try {
      let finalImg = bImgUrl.trim();
      if (bPendingBlob) {
        finalImg = await uploadOptimizedBlob(bPendingBlob, 'banners', 'banner');
      }
      const nextBanner: Banner = {
        titulo: bTitulo.trim(),
        desc: bDesc.trim(),
        sub: bDesc.trim(),
        tag: bTag.trim(),
        btnTxt: bBtnTxt.trim() || 'Ver Coleção →',
        link: bLink.trim() || 'catalogo',
        fit: bFit,
        pos: bPos,
        somenteImagem: bSomenteImagem,
        visivel: bVisivel,
        img: finalImg,
      };
      const updatedList = [...banners];
      if (banEditIdx >= 0) updatedList[banEditIdx] = nextBanner;
      else updatedList.push(nextBanner);

      await setDoc(doc(db, 'config', 'banners'), {
        list: updatedList,
        updAt: serverTimestamp(),
      });
      setBanFormOpen(false);
      onToast('Banner salvo com sucesso!', 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao salvar banner.', 'er');
    } finally {
      setSavingBan(false);
    }
  };

  const handleMakePrimaryBanner = async (idx: number) => {
    if (idx <= 0 || idx >= banners.length) return;
    const chosen = { ...banners[idx], visivel: true };
    const rest = banners.filter((_, i) => i !== idx);
    await setDoc(doc(db, 'config', 'banners'), {
      list: [chosen, ...rest],
      updAt: serverTimestamp(),
    });
    onToast('Banner movido para capa principal!', 'ok');
    await onRefreshData();
  };

  const handleToggleBanner = async (idx: number) => {
    const updatedList = banners.map((b, i) =>
      i === idx ? { ...b, visivel: b.visivel === false } : b
    );
    await setDoc(doc(db, 'config', 'banners'), { list: updatedList, updAt: serverTimestamp() });
    await onRefreshData();
  };

  const handleDeleteBanner = async (idx: number) => {
    const updatedList = banners.filter((_, i) => i !== idx);
    await setDoc(doc(db, 'config', 'banners'), { list: updatedList, updAt: serverTimestamp() });
    onToast('Banner excluído.', 'ok');
    await onRefreshData();
  };

  // ── ORDERS & TRACKING ──
  const handleUpdateOrderStatus = async (order: Order, nextStatus: OrderStatus) => {
    try {
      const hist = Array.isArray(order.historicoStatus) ? [...order.historicoStatus] : [];
      hist.push({
        status: nextStatus,
        msg: `Status atualizado para ${ORDER_STATUS_LABELS[nextStatus] || nextStatus}`,
        criadoEm: new Date().toISOString(),
        porUid: user.uid,
      });

      const updates: Record<string, unknown> = {
        status: nextStatus,
        historicoStatus: hist,
        updAt: serverTimestamp(),
        ...(nextStatus === 'entregue' ? { entregueEm: serverTimestamp() } : {}),
      };

      await updateDoc(doc(db, 'pedidos', order.id), updates);

      if (order.uid) {
        const directRef = doc(db, 'clients', order.uid, 'pedidos', order.id);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          await updateDoc(directRef, updates).catch(() => {});
        } else {
          const qs = await getDocs(
            query(collection(db, 'clients', order.uid, 'pedidos'), where('pedidoGlobalId', '==', order.id))
          );
          const batch = writeBatch(db);
          qs.forEach((d) => batch.update(d.ref, updates));
          await batch.commit().catch(() => {});
        }
      }

      onToast(`Pedido atualizado para ${ORDER_STATUS_LABELS[nextStatus]}.`, 'ok');
      await loadOrders();
    } catch {
      onToast('Erro ao atualizar status.', 'er');
    }
  };

  const handleSaveTracking = async (order: Order) => {
    const draft = trackingDrafts[order.id] || {};
    if (!draft.codigo && !draft.tipo) {
      onToast('Informe o tipo de entrega ou código de rastreio.', 'er');
      return;
    }
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        rastreio: draft,
        updAt: serverTimestamp(),
      });

      if (order.uid) {
        const directRef = doc(db, 'clients', order.uid, 'pedidos', order.id);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          await updateDoc(directRef, { rastreio: draft, updAt: serverTimestamp() }).catch(() => {});
        } else {
          const qs = await getDocs(
            query(collection(db, 'clients', order.uid, 'pedidos'), where('pedidoGlobalId', '==', order.id))
          );
          const batch = writeBatch(db);
          qs.forEach((d) => batch.update(d.ref, { rastreio: draft, updAt: serverTimestamp() }));
          await batch.commit().catch(() => {});
        }
      }

      onToast('Informações de entrega salvas.', 'ok');
    } catch {
      onToast('Erro ao salvar rastreio.', 'er');
    }
  };

  const deleteClientOrderMirrors = async (order: Order) => {
    if (!order.uid) return;
    const directRef = doc(db, 'clients', order.uid, 'pedidos', order.id);
    await deleteDoc(directRef).catch(() => {});
    const qs = await getDocs(
      query(collection(db, 'clients', order.uid, 'pedidos'), where('pedidoGlobalId', '==', order.id))
    ).catch(() => null);
    if (qs && !qs.empty) {
      const batch = writeBatch(db);
      qs.forEach((d) => batch.delete(d.ref));
      await batch.commit().catch(() => {});
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    setDeletingOrderId(order.id);
    try {
      await deleteDoc(doc(db, 'pedidos', order.id));
      await deleteClientOrderMirrors(order);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setConfirmDeleteOrderId(null);
      onToast('Pedido apagado do banco de dados.', 'ok');
    } catch (err) {
      console.error('Erro ao apagar pedido:', err);
      onToast('Erro ao apagar pedido. Verifique suas permissões de admin.', 'er');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleDeleteCancelledOrders = async () => {
    const cancelled = orders.filter((o) => o.status === 'cancelado');
    if (cancelled.length === 0) {
      setConfirmClearCancelled(false);
      return;
    }
    setClearingCancelled(true);
    try {
      for (let i = 0; i < cancelled.length; i += 400) {
        const chunk = cancelled.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((o) => {
          batch.delete(doc(db, 'pedidos', o.id));
        });
        await batch.commit();
      }
      await Promise.all(cancelled.map((o) => deleteClientOrderMirrors(o)));
      const cancelledIds = new Set(cancelled.map((o) => o.id));
      setOrders((prev) => prev.filter((o) => !cancelledIds.has(o.id)));
      setConfirmClearCancelled(false);
      onToast(`${cancelled.length} pedido(s) cancelado(s) apagado(s) do banco.`, 'ok');
    } catch (err) {
      console.error('Erro ao limpar pedidos cancelados:', err);
      onToast('Erro ao apagar pedidos cancelados.', 'er');
    } finally {
      setClearingCancelled(false);
    }
  };

  const handleExportCSV = () => {
    if (orders.length === 0) {
      onToast('Nenhum pedido para exportar.', 'er');
      return;
    }
    const header = ['Data', 'Cliente', 'WhatsApp', 'Endereço', 'Pagamento', 'Parcelas', 'Total', 'Status', 'Rastreio'];
    const rows = orders.map((o) => {
      const dt = o.criadoEm?.toDate ? o.criadoEm.toDate().toLocaleDateString('pt-BR') : '—';
      const rt = (typeof o.rastreio === 'object' ? o.rastreio : {}) as OrderTracking;
      return [
        dt,
        o.nome || '',
        o.wpp || '',
        o.endereco || '',
        o.pagamento || o.pag || 'pix',
        String(o.parcelas || 1),
        formatBRL(o.total || 0),
        o.status || 'pendente',
        rt.codigo || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedidos_bw_parfum.csv';
    a.click();
    URL.revokeObjectURL(url);
    onToast('CSV exportado.', 'ok');
  };

  // ── REVIEWS MODERATION ──
  const handleModerateReview = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'reviews', id), { status, updAt: serverTimestamp() });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      onToast(status === 'approved' ? 'Avaliação aprovada.' : 'Avaliação rejeitada.', 'ok');
    } catch {
      onToast('Erro ao moderar avaliação.', 'er');
    }
  };

  const handleDeleteReview = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reviews', id));
      setReviews((prev) => prev.filter((r) => r.id !== id));
      onToast('Avaliação excluída.', 'ok');
    } catch {
      onToast('Erro ao excluir avaliação.', 'er');
    }
  };

  // ── SETTINGS ──
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await setDoc(
        doc(db, 'config', 'settings'),
        {
          ...cfgForm,
          wpp: cleanDigits(cfgForm.wpp || ''),
          parcelas: Math.max(1, Number(cfgForm.parcelas) || 3),
          freteGratis: Math.max(0, Number(cfgForm.freteGratis) || 0),
          estoqueAlerta: Math.max(1, Number(cfgForm.estoqueAlerta) || 5),
          updAt: serverTimestamp(),
        },
        { merge: true }
      );
      onToast('Configurações salvas.', 'ok');
      await onRefreshData();
    } catch {
      onToast('Erro ao salvar configurações.', 'er');
    } finally {
      setSavingCfg(false);
    }
  };

  // ── LAUNCH STOREFRONT ORDER INTO VENDAS BW CAIXA + DECREMENT STOCK ──
  const handlePostOrderToCaixa = async (order: Order) => {
    if (order.status === 'cancelado' || order.lancadoCaixa) return;
    setPostingOrderId(order.id);
    try {
      const itemsOrder = Array.isArray(order.itens) ? order.itens : [];
      const cartItems: SaleCartItem[] = [];
      let custoTotal = 0;
      let freteTotal = 0;
      let deslocTotal = 0;

      for (const it of itemsOrder) {
        const matchedProd = products.find(
          (p) => p.id === it.id || normalizeText(extractNome(p)) === normalizeText(it.nome)
        );
        const qtd = Math.max(1, Number(it.qty || 1));
        const unitVal = roundCurrency(it.preco || (matchedProd ? extractPreco(matchedProd) : 0));
        cartItems.push({
          idProd: matchedProd?.id || it.id || '',
          nome: matchedProd ? extractNome(matchedProd) : it.nome || 'Perfume',
          qtd,
          valorUnit: unitVal,
          valorTotal: roundCurrency(unitVal * qtd),
        });
        if (matchedProd) {
          const costRec = productCosts[matchedProd.id];
          if (costRec) {
            custoTotal += Number(costRec.custo || 0) * qtd;
            freteTotal += Number(costRec.frete ?? BW_CONFIG.FRETE_PADRAO) * qtd;
            deslocTotal += Number(costRec.deslocamento ?? BW_CONFIG.DESLOC_PADRAO) * qtd;
          }
          const curEstq = extractEstoque(matchedProd);
          const nextEstq = Math.max(0, curEstq - qtd);
          await updateDoc(doc(db, 'produtos', matchedProd.id), {
            estoqueQtd: nextEstq,
            vendas: (matchedProd.vendas || 0) + qtd,
            updAt: serverTimestamp(),
          });
        }
      }

      const rawPag = normalizeText(order.pagamento || order.pag || 'pix');
      const pagamento: SalePaymentMethod = rawPag.includes('cart') ? 'Cartão' : 'PIX';
      const valorCliente = roundCurrency(order.total || 0);
      const { taxaPerc, taxaReais, valorLiquido } = calculatePaymentNet(valorCliente, pagamento);
      const rt = (typeof order.rastreio === 'object' ? order.rastreio : {}) as OrderTracking;
      const retirada = rt.tipo === 'retirada';
      const freteEfetivo = retirada ? 0 : roundCurrency(freteTotal);
      const lucroEstimado = roundCurrency(
        valorLiquido - roundCurrency(custoTotal) - freteEfetivo - roundCurrency(deslocTotal)
      );

      let dataISO = getTodayISO();
      if (order.criadoEm?.toDate) {
        const d = order.criadoEm.toDate();
        dataISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      const perfumeResumo =
        cartItems.length > 0
          ? cartItems.map((c) => `${c.qtd}× ${c.nome}`).join(' + ')
          : order.resumo || 'Pedido da Loja Online';

      await addDoc(collection(db, 'vendas_bw'), {
        data: dataISO,
        cliente: (order.nome || 'Cliente da Loja').trim().slice(0, 160),
        contato: (order.wpp || '').trim().slice(0, 40),
        endereco: [order.endereco, order.cidade].filter(Boolean).join(' – ').slice(0, 300),
        perfume: perfumeResumo.slice(0, 1000),
        itens: cartItems,
        valorCliente,
        valorLiquido,
        valor: valorLiquido,
        taxaCartaoPerc: taxaPerc,
        taxaCartaoReais: taxaReais,
        desconto: roundCurrency(order.desconto || 0),
        pagamento,
        status: 'Pago',
        retirada,
        custoTotal: roundCurrency(custoTotal),
        freteTotal: freteEfetivo,
        deslocTotal: roundCurrency(deslocTotal),
        lucroEstimado,
        origemPedidoId: order.id,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'pedidos', order.id), {
        lancadoCaixa: true,
        updAt: serverTimestamp(),
      });

      await Promise.all([loadOrders(), loadSalesBw(), onRefreshData()]);
      onToast('Pedido lançado no Caixa & Estoque baixado com sucesso!', 'ok');
    } catch (err) {
      onToast(`Erro ao lançar pedido no caixa: ${(err as Error).message}`, 'er');
    } finally {
      setPostingOrderId(null);
    }
  };

  // ── CLIENTES PDV (clientes_bw) CRUD ──
  const openEditClientBw = (c?: ClientBw) => {
    setClientBwFormOpen(true);
    setClientBwEditId(c?.id || '');
    setCbNome(c?.nome || '');
    setCbContato(c?.contato || '');
    setCbEndereco(c?.endereco || '');
  };

  const handleSaveClientBw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cbNome.trim()) {
      onToast('Informe o nome do cliente.', 'er');
      return;
    }
    setSavingClientBw(true);
    try {
      const payload = {
        nome: cbNome.trim().slice(0, 160),
        contato: cbContato.trim().slice(0, 40),
        endereco: cbEndereco.trim().slice(0, 300),
        atualizadoEm: new Date().toISOString(),
      };
      if (clientBwEditId) {
        await updateDoc(doc(db, 'clientes_bw', clientBwEditId), payload);
        onToast('Cliente atualizado.', 'ok');
      } else {
        await addDoc(collection(db, 'clientes_bw'), {
          ...payload,
          criadoEm: new Date().toISOString(),
        });
        onToast('Cliente cadastrado.', 'ok');
      }
      setClientBwFormOpen(false);
      await loadClientsBw();
    } catch (err) {
      onToast(`Erro ao salvar cliente: ${(err as Error).message}`, 'er');
    } finally {
      setSavingClientBw(false);
    }
  };

  const handleDeleteClientBw = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'clientes_bw', id));
      setConfirmDeleteClientBwId(null);
      onToast('Cliente removido.', 'ok');
      await loadClientsBw();
    } catch {
      onToast('Erro ao excluir cliente.', 'er');
    }
  };

  // ── SYNC BW (Recursive REST decoder + private costs extraction) ──
  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setSyncLogs((prev) => `${prev}\n[${time}] ${msg}`);
  };

  const decodeFirestoreValue = (v: Record<string, unknown>): unknown => {
    if (v.stringValue !== undefined) return String(v.stringValue);
    if (v.integerValue !== undefined) return parseInt(String(v.integerValue), 10);
    if (v.doubleValue !== undefined) return parseFloat(String(v.doubleValue));
    if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
    if (v.timestampValue !== undefined) return String(v.timestampValue);
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue && typeof v.arrayValue === 'object') {
      const vals = (v.arrayValue as { values?: Array<Record<string, unknown>> }).values || [];
      return vals.map((item) => decodeFirestoreValue(item));
    }
    if (v.mapValue && typeof v.mapValue === 'object') {
      const flds = (v.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields || {};
      const out: Record<string, unknown> = {};
      Object.entries(flds).forEach(([mk, mv]) => {
        out[mk] = decodeFirestoreValue(mv);
      });
      return out;
    }
    return undefined;
  };

  const syncCollection = async (remoteCol: string, localCol: string) => {
    const base = 'https://firestore.googleapis.com/v1/projects/bw-imports/databases/(default)/documents';
    appendLog(`Buscando ${remoteCol} em bw-imports...`);
    const res = await fetch(`${base}/${remoteCol}?pageSize=300`);
    if (!res.ok) {
      appendLog(`Erro HTTP ${res.status} em ${remoteCol}`);
      return;
    }
    const json = await res.json();
    const docs = (json.documents || []) as Array<{ name: string; fields?: Record<string, Record<string, unknown>> }>;
    appendLog(`${docs.length} registros encontrados em ${remoteCol}.`);

    const existingIds = new Set(products.map((p) => p.id));
    let saved = 0;

    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100);
      const batch = writeBatch(db);

      for (const d of chunk) {
        const rawId = String(d.name).split('/').pop() || '';
        if (!rawId) continue;
        const id = sanitizeDocId(rawId);
        const fields = d.fields || {};
        const data: Record<string, unknown> = {};
        Object.entries(fields).forEach(([k, v]) => {
          const decoded = decodeFirestoreValue(v);
          if (decoded !== undefined) data[k] = decoded;
        });

        if (localCol === 'produtos') {
          const sanitized = sanitizeProductForFirestore(data);
          if (existingIds.has(id)) {
            if (!sanitized.imgUrl) delete sanitized.imgUrl;
            if (!sanitized.desc) delete sanitized.desc;
            if (!sanitized.notas) delete sanitized.notas;
            if (!sanitized.marca) delete sanitized.marca;
            if (!sanitized.vol) delete sanitized.vol;
            if (!sanitized.cat) delete sanitized.cat;
          }
          batch.set(
            doc(db, 'produtos', id),
            { ...sanitized, updAt: serverTimestamp(), syncedAt: serverTimestamp() },
            { merge: true }
          );

          // Extract private cost metrics safely into custos_produtos (never on produtos!)
          const custoVal = roundCurrency(Math.max(0, Number(data.custo ?? 0) || 0));
          const freteVal = roundCurrency(Math.max(0, Number(data.frete ?? BW_CONFIG.FRETE_PADRAO) || 0));
          const deslocVal = roundCurrency(Math.max(0, Number(data.deslocamento ?? BW_CONFIG.DESLOC_PADRAO) || 0));
          const margemVal = Math.min(1000, Math.max(0, Number(data.margem ?? BW_CONFIG.MARGEM_PADRAO) || 0));
          const custoBaseVal = roundCurrency(
            Math.max(0, Number(data.custoBase ?? data.custoUnitario ?? custoVal + freteVal + deslocVal) || 0)
          );
          if (custoVal > 0 || custoBaseVal > 0) {
            batch.set(
              doc(db, 'custos_produtos', id),
              {
                custo: custoVal,
                frete: freteVal,
                deslocamento: deslocVal,
                margem: margemVal,
                custoBase: custoBaseVal,
                custoUnitario: roundCurrency(Number(data.custoUnitario ?? custoBaseVal) || custoBaseVal),
                vendaPix: roundCurrency(Math.max(0, Number(data.vendaPix ?? sanitized.precoPix ?? 0) || 0)),
                vendaCartao: roundCurrency(Math.max(0, Number(data.vendaCartao ?? sanitized.preco ?? 0) || 0)),
                atualizadoEm: new Date().toISOString(),
                syncedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        } else if (localCol === 'clientes_bw') {
          const nome = String(data.nome || 'Cliente').trim().slice(0, 160) || 'Cliente';
          batch.set(
            doc(db, 'clientes_bw', id),
            {
              nome,
              contato: String(data.contato || '').trim().slice(0, 40),
              endereco: String(data.endereco || '').trim().slice(0, 300),
              criadoEm: String(data.criadoEm || new Date().toISOString()).slice(0, 40),
              atualizadoEm: String(data.atualizadoEm || new Date().toISOString()).slice(0, 40),
              syncedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else if (localCol === 'vendas_bw') {
          const rawPag = normalizeText(String(data.pagamento || 'PIX'));
          let pagamento: SalePaymentMethod = 'PIX';
          if (rawPag.includes('cart')) pagamento = 'Cartão';
          else if (rawPag.includes('din')) pagamento = 'Dinheiro';
          else if (rawPag.includes('fiado')) pagamento = 'Fiado';

          const status: 'Pago' | 'Pendente' =
            normalizeText(String(data.status || 'Pago')) === 'pendente' ? 'Pendente' : 'Pago';
          const valorLiquido = roundCurrency(
            Math.max(
              0,
              Math.min(
                500000,
                Number(data.valorLiquido ?? data.valor ?? data.valorFinal ?? data.valorCliente ?? 0) || 0
              )
            )
          );
          const valorCliente = roundCurrency(
            Math.max(
              0,
              Number(data.valorCliente ?? data.valorFinal ?? data.valor ?? valorLiquido) || 0
            )
          );
          const lucroEstimado = roundCurrency(
            Number(data.lucroEstimado ?? data.lucro ?? 0) || 0
          );

          // Normalize legacy historicoParc entries that omitted valorPago when quitting Fiado
          let cleanHistorico: Array<{ parcela: number; dataPago: string; valorPago: number }> | undefined;
          if (Array.isArray(data.historicoParc)) {
            const rawHist = data.historicoParc.slice(0, 100) as Array<Record<string, unknown>>;
            const explicitSum = rawHist.reduce(
              (acc, h) =>
                h && h.valorPago !== undefined && h.valorPago !== null
                  ? acc + Math.max(0, Number(h.valorPago) || 0)
                  : acc,
              0
            );
            const missingIdxs = rawHist
              .map((h, idx) => (h && (h.valorPago === undefined || h.valorPago === null) ? idx : -1))
              .filter((idx) => idx >= 0);

            const totalPool =
              status === 'Pago'
                ? Math.max(0, roundCurrency(valorLiquido - explicitSum))
                : Math.max(
                    0,
                    roundCurrency(
                      (valorLiquido / Math.max(1, Number(data.parcelasTotais) || 1)) * missingIdxs.length
                    )
                  );
            const perMissing =
              missingIdxs.length > 0 ? roundCurrency(totalPool / missingIdxs.length) : 0;
            let allocatedMissing = 0;

            cleanHistorico = rawHist.map((h, idx) => {
              const hasExplicit = h && h.valorPago !== undefined && h.valorPago !== null;
              let vp = hasExplicit ? roundCurrency(Math.max(0, Number(h.valorPago) || 0)) : 0;
              if (!hasExplicit && missingIdxs.length > 0) {
                const isLastMissing = idx === missingIdxs[missingIdxs.length - 1];
                vp = isLastMissing
                  ? roundCurrency(Math.max(0, totalPool - allocatedMissing))
                  : perMissing;
                allocatedMissing = roundCurrency(allocatedMissing + vp);
              }
              return {
                parcela: Number(h?.parcela || idx + 1) || idx + 1,
                dataPago: String(h?.dataPago || data.data || getTodayISO()).slice(0, 24),
                valorPago: vp,
              };
            });
          }

          const cleanVenda: Record<string, unknown> = {
            data: String(data.data || getTodayISO()).slice(0, 24),
            cliente: String(data.cliente || 'Cliente (BW Imports)').trim().slice(0, 160) || 'Cliente (BW Imports)',
            contato: String(data.contato || '').trim().slice(0, 40),
            endereco: String(data.endereco || '').trim().slice(0, 300),
            perfume: String(data.perfume || '').trim().slice(0, 1000),
            valorCliente,
            valorLiquido,
            valor: roundCurrency(Math.max(0, Number(data.valor ?? valorLiquido) || 0)),
            taxaCartaoPerc: Number(data.taxaCartaoPerc || 0),
            taxaCartaoReais: roundCurrency(Number(data.taxaCartaoReais || 0)),
            desconto: roundCurrency(Number(data.desconto || 0)),
            pagamento,
            status,
            retirada: Boolean(data.retirada),
            custoTotal: roundCurrency(Number(data.custoTotal || 0)),
            freteTotal: roundCurrency(Number(data.freteTotal || 0)),
            deslocTotal: roundCurrency(Number(data.deslocTotal || 0)),
            lucroEstimado,
            syncedAt: serverTimestamp(),
          };
          if (Array.isArray(data.itens)) cleanVenda.itens = data.itens.slice(0, 50);
          if (Array.isArray(data.datasParcelas)) cleanVenda.datasParcelas = data.datasParcelas.slice(0, 36);
          if (cleanHistorico) cleanVenda.historicoParc = cleanHistorico;
          if (data.parcelasTotais !== undefined) cleanVenda.parcelasTotais = Number(data.parcelasTotais) || 1;
          if (data.parcelasPagas !== undefined) cleanVenda.parcelasPagas = Number(data.parcelasPagas) || 0;
          if (status === 'Pago') {
            cleanVenda.saldoRestante = 0;
          } else if (data.saldoRestante !== undefined) {
            cleanVenda.saldoRestante = roundCurrency(Math.max(0, Number(data.saldoRestante) || 0));
          }
          if (data.criadoEm) cleanVenda.criadoEm = String(data.criadoEm).slice(0, 40);
          if (data.atualizadoEm) cleanVenda.atualizadoEm = String(data.atualizadoEm).slice(0, 40);

          batch.set(doc(db, 'vendas_bw', id), cleanVenda, { merge: true });
        }
        saved++;
      }

      await batch.commit();
    }

    appendLog(`${saved} registros salvos em ${localCol}.`);
  };

  const handleSyncSingle = async (remoteCol: string, localCol: string) => {
    setSyncing(true);
    setSyncLogs(`Sincronizando ${remoteCol} -> ${localCol}...`);
    try {
      await syncCollection(remoteCol, localCol);
      if (localCol === 'produtos') {
        await Promise.all([onRefreshData(), loadProductCosts()]);
      } else if (localCol === 'clientes_bw') {
        await loadClientsBw();
      } else if (localCol === 'vendas_bw') {
        await loadSalesBw();
      }
      onToast(`Sincronização de ${remoteCol} concluída!`, 'ok');
    } catch (err) {
      appendLog(`Erro: ${(err as Error).message}`);
      onToast('Falha ao sincronizar.', 'er');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncLogs('Iniciando sincronização BW Imports...');
    try {
      await syncCollection('clientes', 'clientes_bw');
      await syncCollection('vendas', 'vendas_bw');
      await syncCollection('produtos', 'produtos');
      appendLog('Sincronização concluída com sucesso!');
      onToast('Sincronização BW Imports concluída!', 'ok');
      await Promise.all([onRefreshData(), loadProductCosts(), loadClientsBw(), loadSalesBw()]);
    } catch (err) {
      appendLog(`Erro: ${(err as Error).message}`);
      onToast('Falha durante a sincronização.', 'er');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportLegacy = async () => {
    if (!onImportLegacyCatalog) return;
    setSyncing(true);
    setSyncLogs('Importando catálogo completo do banco principal (catalogo-bw)...');
    try {
      const count = await onImportLegacyCatalog();
      appendLog(`${count} perfumes, categorias, banners e configurações importados.`);
      onToast(`${count} perfumes importados com sucesso!`, 'ok');
    } catch (err) {
      appendLog(`Erro na importação: ${(err as Error).message}`);
      onToast('Não foi possível importar do catálogo legado.', 'er');
    } finally {
      setSyncing(false);
    }
  };

  // Dashboard stats (Vendas BW + Storefront without double-counting or cancelled orders)
  const todayISO = getTodayISO();
  const currentMonthISO = getMonthISO();
  const { startISO: monthStartISO, endISO: monthEndISO, label: monthLabel } = getMonthRange(currentMonthISO);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const activeOrders = orders.filter((o) => o.status !== 'cancelado');
  const unpostedActiveOrders = activeOrders.filter((o) => !o.lancadoCaixa);
  const cancelledOrders = orders.filter((o) => o.status === 'cancelado');
  const todayAllOrders = orders.filter((o) => o.criadoEm?.toDate && o.criadoEm.toDate() >= startOfDay);
  const todayActiveOrders = todayAllOrders.filter((o) => o.status !== 'cancelado');
  const todayUnpostedOrders = todayActiveOrders.filter((o) => !o.lancadoCaixa);
  const todayCancelledCount = todayAllOrders.length - todayActiveOrders.length;

  const todayBwSales = salesBw.filter((s) => (s.data || '').slice(0, 10) === todayISO);
  const todayBwTotal = roundCurrency(
    todayBwSales.reduce((sum, s) => sum + Number(s.valorLiquido ?? s.valor ?? 0), 0)
  );
  const todayOnlineTotal = roundCurrency(
    todayUnpostedOrders.reduce((s, o) => s + (o.total || 0), 0)
  );
  const todayTotal = roundCurrency(todayBwTotal + todayOnlineTotal);

  const monthBwSales = salesBw.filter((s) => {
    const d = (s.data || '').slice(0, 10);
    return d >= monthStartISO && d <= monthEndISO;
  });
  const monthBwTotal = roundCurrency(
    monthBwSales.reduce((sum, s) => sum + Number(s.valorLiquido ?? s.valor ?? 0), 0)
  );
  const monthBwLucro = roundCurrency(
    monthBwSales.reduce((sum, s) => sum + Number(s.lucroEstimado || 0), 0)
  );

  const pendingFiados = salesBw.filter((s) => s.status === 'Pendente');
  const pendingFiadosTotal = roundCurrency(
    pendingFiados.reduce((sum, s) => sum + Number(s.saldoRestante ?? s.valorLiquido ?? s.valor ?? 0), 0)
  );

  const pendingOrdersCount = orders.filter((o) => !o.status || o.status === 'pendente').length;
  const pendingReviewsCount = reviews.filter((r) => (r.status || 'pending') === 'pending').length;
  const stockThreshold = Number(settings.estoqueAlerta) || 5;
  const lowStockProducts = products.filter(
    (p) => p.ativo !== false && extractEstoque(p) < stockThreshold
  );
  const criticalStockProducts = products.filter(
    (p) => p.ativo !== false && extractEstoque(p) <= BW_CONFIG.ESTOQUE_CRITICO
  );

  // 7-day chart data (combines Vendas BW + unposted active Storefront orders, no cancelled)
  const chartDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${day}`;
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    const bwDayTotal = salesBw
      .filter((s) => (s.data || '').slice(0, 10) === iso)
      .reduce((sum, s) => sum + Number(s.valorLiquido ?? s.valor ?? 0), 0);

    const onlineDayTotal = unpostedActiveOrders
      .filter(
        (o) =>
          o.criadoEm?.toDate &&
          o.criadoEm.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) === label
      )
      .reduce((s, o) => s + (o.total || 0), 0);

    return { label, total: roundCurrency(bwDayTotal + onlineDayTotal) };
  });
  const maxChartVal = Math.max(...chartDays.map((d) => d.total), 1);

  const filteredProducts = products.filter((p) => {
    const q = normalizeText(prodSearch);
    const matchText = !q || normalizeText(extractNome(p)).includes(q) || normalizeText(extractMarca(p)).includes(q);
    const matchCat = !prodCatFilter || (p.cat || p.categoria || '') === prodCatFilter;
    const matchSt =
      !prodStatusFilter ||
      (prodStatusFilter === 'ativo' && p.ativo !== false) ||
      (prodStatusFilter === 'inativo' && p.ativo === false) ||
      (prodStatusFilter === 'estq' && extractEstoque(p) < stockThreshold);
    return matchText && matchCat && matchSt;
  });

  const filteredOrders = orders.filter(
    (o) => orderFilter === 'todos' || (o.status || 'pendente') === orderFilter
  );

  const filteredClients = clients.filter((c) => {
    const q = normalizeText(clientSearch);
    return (
      !q ||
      normalizeText(c.nome).includes(q) ||
      normalizeText(c.email).includes(q) ||
      (c.wpp || '').includes(q)
    );
  });

  const filteredClientsBw = clientsBw.filter((c) => {
    const q = normalizeText(clientSearch);
    return (
      !q ||
      normalizeText(c.nome).includes(q) ||
      normalizeText(c.contato).includes(q) ||
      normalizeText(c.endereco).includes(q)
    );
  });

  const filteredReviews = reviews.filter(
    (r) => reviewFilter === 'todos' || (r.status || 'pending') === reviewFilter
  );

  const navItems: { id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Resumo', icon: LayoutDashboard },
    { id: 'vender', label: 'Vender (PDV)', icon: ShoppingBag },
    { id: 'fiados', label: `Fiados (${pendingFiados.length})`, icon: Wallet },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'relatorios', label: 'Financeiro', icon: BarChart3 },
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'pedidos', label: `Pedidos (${pendingOrdersCount})`, icon: ShoppingCart },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'categorias', label: 'Categorias', icon: Tags },
    { id: 'banners', label: 'Banners', icon: ImageIcon },
    { id: 'reviews', label: `Avaliações (${pendingReviewsCount})`, icon: Star },
    { id: 'configs', label: 'Configs', icon: SettingsIcon },
    { id: 'sync', label: 'Sync BW', icon: RefreshCw },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3.5">
          <img
            src="/assets/aistudio/logo.png_17aa6614.jpeg"
            alt="BW Parfum Imports"
            className="w-12 h-12 rounded-full object-cover border border-[#9A7437]/40 shrink-0"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-[#9A7437] font-semibold">
              BW Parfum · Gestão Integrada
            </p>
            <h1 className="font-display text-3xl font-semibold text-[#1E1712]">
              Painel Administrativo &amp; PDV
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={onBackStore}
          className="px-4 py-2 rounded-lg border border-[#E0D9CF] bg-white text-xs font-semibold text-[#1E1712] hover:border-[#9A7437]"
        >
          ← Voltar à Vitrine
        </button>
      </div>

      {!user.emailVerified && (
        <div className="mb-6 bg-white border border-[#9A7437]/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 max-w-2xl">
            <p className="text-xs font-semibold text-[#9A7437]">
              Verificação de e-mail necessária para gravar alterações
            </p>
            <p className="text-xs text-[#5C5147]">
              Sua conta ({user.email}) ainda não está com o e-mail verificado no Firebase Auth. Clique em enviar link, confirme na sua caixa de entrada e clique em &ldquo;Já verifiquei&rdquo;.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await sendEmailVerification(user);
                  onToast(`Link de verificação enviado para ${user.email}.`, 'ok');
                } catch {
                  onToast('Aguarde alguns segundos antes de reenviar o link.', 'er');
                }
              }}
              className="px-3.5 py-2 rounded-lg bg-[#9A7437] text-white text-xs font-semibold hover:bg-[#82602B]"
            >
              Enviar Link de Verificação
            </button>
            <button
              type="button"
              onClick={async () => {
                await user.reload();
                window.location.reload();
              }}
              className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] text-xs font-semibold text-[#1E1712]"
            >
              Já verifiquei (Atualizar)
            </button>
          </div>
        </div>
      )}

      {/* Section Nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-6 border-b border-[#E6DFD5]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#1E1712] text-white'
                  : 'bg-white border border-[#E6DFD5] text-[#5C5147] hover:border-[#9A7437]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* One-click Import Callout if Vendas BW has not been synced to this DB yet */}
      {!loadingSalesBw && salesBw.length === 0 && (
        <div className="mb-6 bg-[#1E1712] text-white rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border border-[#9A7437]/40">
          <div className="space-y-1 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.14em] text-[#D4AF6E] font-semibold">
              Importação Pendente do App Vendas BW
            </p>
            <p className="text-sm font-medium text-white">
              Suas vendas antigas, fiados em aberto, clientes e custos de produtos ainda estão no banco anterior (bw-imports).
            </p>
            <p className="text-xs text-[#D6CEC2]">
              Clique no botão ao lado para trazer tudo agora para este painel unificado (sem apagar seus dados do app anterior).
            </p>
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={handleSyncAll}
            className="px-4 py-2.5 rounded-lg bg-[#9A7437] text-white text-xs font-semibold hover:bg-[#B28945] disabled:opacity-60 inline-flex items-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Importando tudo...' : 'Importar Vendas, Fiados & Clientes Agora'}
          </button>
        </div>
      )}

      {/* DASHBOARD */}
      {section === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSection('vender')}
              className="px-4 py-2.5 rounded-xl bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] inline-flex items-center gap-1.5"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Nova Venda (PDV)
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('produtos');
                openNewProduct();
              }}
              className="px-4 py-2.5 rounded-xl border border-[#E0D9CF] bg-white text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar Perfume
            </button>
            <button
              type="button"
              onClick={() => setSection('fiados')}
              className="px-4 py-2.5 rounded-xl border border-[#E0D9CF] bg-white text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] inline-flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5 text-[#9A7437]" />
              Monitorar Fiados ({pendingFiados.length})
            </button>
            <button
              type="button"
              onClick={() => setSection('relatorios')}
              className="px-4 py-2.5 rounded-xl border border-[#E0D9CF] bg-white text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] inline-flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#1F6E43]" />
              Financeiro Mês a Mês
            </button>
          </div>

          {/* Primary Unified KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
              <p className="text-xs text-[#7A6E65] uppercase tracking-wider">Vendas Hoje</p>
              <p className="text-2xl font-bold text-[#1E1712] tabular-nums mt-1">
                {formatCurrencyBRL(todayTotal)}
              </p>
              <p className="text-xs text-[#7A6E65] mt-1 tabular-nums">
                PDV {formatCurrencyBRL(todayBwTotal)} · Online {formatCurrencyBRL(todayOnlineTotal)}
              </p>
              {todayCancelledCount > 0 && (
                <p className="text-[11px] text-[#A93226] mt-0.5 tabular-nums">
                  {todayCancelledCount} cancelado(s) excluído(s)
                </p>
              )}
            </div>

            <div className="bg-white border border-[#1F6E43]/30 rounded-xl p-5">
              <p className="text-xs text-[#1F6E43] uppercase tracking-wider font-semibold">
                Vendido em {monthLabel}
              </p>
              <p className="text-2xl font-bold text-[#1E1712] tabular-nums mt-1">
                {formatCurrencyBRL(monthBwTotal)}
              </p>
              <p className="text-xs text-[#1F6E43] font-medium mt-1 tabular-nums">
                Lucro est.: {formatCurrencyBRL(monthBwLucro)} ({monthBwSales.length} vendas)
              </p>
            </div>

            <div className="bg-white border border-[#A93226]/30 rounded-xl p-5">
              <p className="text-xs text-[#A93226] uppercase tracking-wider font-semibold">
                Fiados em Aberto
              </p>
              <p className="text-2xl font-bold text-[#A93226] tabular-nums mt-1">
                {formatCurrencyBRL(pendingFiadosTotal)}
              </p>
              <p className="text-xs text-[#7A6E65] mt-1">
                {pendingFiados.length} cliente(s) pendente(s)
              </p>
            </div>

            <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
              <p className="text-xs text-[#7A6E65] uppercase tracking-wider">Estoque &amp; Pedidos</p>
              <p className="text-2xl font-bold text-[#1E1712] tabular-nums mt-1">
                {products.length} <span className="text-sm font-normal text-[#7A6E65]">perfumes</span>
              </p>
              <p className="text-xs text-[#7A6E65] mt-1">
                {criticalStockProducts.length} crítico(s) · {pendingOrdersCount} pedido(s) loja
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
            <h2 className="text-xs uppercase tracking-[0.14em] text-[#7A6E65] font-semibold mb-4">
              Faturamento dos Últimos 7 Dias (PDV + Loja)
            </h2>
            <div className="flex items-end gap-2 h-36">
              {chartDays.map((d) => {
                const hPct = Math.max(6, Math.round((d.total / maxChartVal) * 100));
                return (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-semibold text-[#9A7437] tabular-nums">
                      {d.total > 0 ? `R$${Math.round(d.total)}` : ''}
                    </span>
                    <div
                      style={{ height: `${hPct}%` }}
                      className="w-full max-w-[44px] bg-[#1E1712] rounded-t-md transition-all"
                    />
                    <span className="text-[11px] text-[#7A6E65] tabular-nums">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vendas de Hoje (Pedidos da Loja Online) - gestão rápida com exclusão definitiva */}
          <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1E1712]">Pedidos da Loja Online Hoje</h2>
                <p className="text-[11px] text-[#7A6E65]">
                  Pedidos cancelados não entram no faturamento. Você pode apagar registros para liberar espaço no banco.
                </p>
              </div>
              {cancelledOrders.length > 0 && (
                confirmClearCancelled ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#A93226] font-medium">
                      Apagar {cancelledOrders.length} cancelado(s)?
                    </span>
                    <button
                      type="button"
                      disabled={clearingCancelled}
                      onClick={handleDeleteCancelledOrders}
                      className="px-2.5 py-1 rounded bg-[#A93226] text-white text-[11px] font-semibold disabled:opacity-50"
                    >
                      {clearingCancelled ? 'Apagando...' : 'Sim, apagar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearCancelled(false)}
                      className="px-2.5 py-1 rounded border border-[#E0D9CF] text-[11px] text-[#5C5147]"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearCancelled(true)}
                    className="px-3 py-1.5 rounded-lg border border-[#A93226]/30 text-xs font-semibold text-[#A93226] hover:bg-[#A93226]/5 inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar cancelados ({cancelledOrders.length})
                  </button>
                )
              )}
            </div>

            {todayAllOrders.length === 0 ? (
              <p className="text-xs text-[#7A6E65]">Nenhum pedido online registrado hoje.</p>
            ) : (
              <div className="divide-y divide-[#F2EDE6]">
                {todayAllOrders.map((o) => {
                  const isCancelled = o.status === 'cancelado';
                  const hora = o.criadoEm?.toDate
                    ? o.criadoEm.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const isConfirming = confirmDeleteOrderId === o.id;
                  const isDeleting = deletingOrderId === o.id;
                  return (
                    <div
                      key={o.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#1E1712] truncate">
                            {o.nome || 'Cliente'}
                          </span>
                          <span className="text-[11px] text-[#7A6E65] tabular-nums">{hora}</span>
                          <span
                            className={`text-[11px] font-semibold ${
                              isCancelled ? 'text-[#A93226]' : 'text-[#9A7437]'
                            }`}
                          >
                            {ORDER_STATUS_LABELS[o.status || 'pendente']}
                          </span>
                          {o.lancadoCaixa && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1F6E43]/10 text-[#1F6E43] font-semibold">
                              No Caixa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#7A6E65] truncate mt-0.5">
                          {Array.isArray(o.itens)
                            ? o.itens.map((i) => `${i.qty || 1}× ${i.nome}`).join(', ')
                            : o.resumo || '—'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`font-bold tabular-nums ${
                            isCancelled ? 'line-through text-[#A93226]/70' : 'text-[#1E1712]'
                          }`}
                        >
                          R$ {formatBRL(o.total || 0)}
                        </span>

                        {!isCancelled && !o.lancadoCaixa && (
                          <button
                            type="button"
                            disabled={postingOrderId === o.id}
                            onClick={() => handlePostOrderToCaixa(o)}
                            className="px-2.5 py-1 rounded-lg bg-[#1F6E43] text-white text-[11px] font-semibold disabled:opacity-50"
                          >
                            {postingOrderId === o.id ? 'Lançando...' : 'Lançar Caixa'}
                          </button>
                        )}

                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteOrder(o)}
                              className="px-2.5 py-1 rounded bg-[#A93226] text-white text-[11px] font-semibold disabled:opacity-50"
                            >
                              {isDeleting ? 'Apagando...' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOrderId(null)}
                              className="px-2 py-1 rounded border border-[#E0D9CF] text-[11px] text-[#5C5147]"
                            >
                              Voltar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOrderId(o.id)}
                            title="Apagar pedido do banco de dados"
                            className="px-2.5 py-1 rounded-lg border border-[#A93226]/30 text-[#A93226] hover:bg-[#A93226]/5 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Apagar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#1E1712]">Últimas Vendas do Caixa (PDV)</h2>
                <button
                  type="button"
                  onClick={() => setSection('historico')}
                  className="text-xs font-semibold text-[#9A7437]"
                >
                  Ver histórico →
                </button>
              </div>
              {salesBw.length === 0 ? (
                <p className="text-xs text-[#7A6E65]">Nenhuma venda registrada no caixa ainda.</p>
              ) : (
                <div className="divide-y divide-[#F2EDE6]">
                  {[...salesBw]
                    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
                    .slice(0, 6)
                    .map((s) => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-[#1E1712] truncate">{s.cliente}</p>
                          <p className="text-[11px] text-[#7A6E65] truncate">
                            {formatDateISOToBR(s.data)} · {s.perfume}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-[#1E1712] tabular-nums">
                            {formatCurrencyBRL(s.valorLiquido ?? s.valor ?? 0)}
                          </p>
                          <p
                            className={`text-[11px] font-semibold ${
                              s.status === 'Pendente' ? 'text-[#A93226]' : 'text-[#1F6E43]'
                            }`}
                          >
                            {s.pagamento} · {s.status}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#1E1712] mb-4">Alerta de Estoque Baixo</h2>
              {lowStockProducts.length === 0 ? (
                <p className="text-xs text-[#1F6E43]">Todos os produtos ativos com estoque adequado.</p>
              ) : (
                <div className="divide-y divide-[#F2EDE6]">
                  {lowStockProducts.slice(0, 6).map((p) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-[#1E1712] truncate">{extractNome(p)}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[#A93226] font-semibold tabular-nums">
                          {extractEstoque(p)} un
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustStock(p, 1)}
                          className="px-2 py-0.5 rounded bg-[#1F6E43]/10 text-[#1F6E43] font-semibold"
                          title="Repor +1 unidade"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSection('produtos');
                            openEditProduct(p);
                          }}
                          className="text-[#9A7437] font-semibold"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VENDER (PDV MANUAL) */}
      {section === 'vender' && (
        <AdminPdvSection
          products={products}
          productCosts={productCosts}
          clientsBw={clientsBw}
          prefillProductId={prefillPdvProductId}
          prefillClient={prefillPdvClient}
          onClearPrefill={() => {
            setPrefillPdvProductId(null);
            setPrefillPdvClient(null);
          }}
          onRefreshStore={onRefreshData}
          onRefreshSales={loadSalesBw}
          onRefreshClientsBw={loadClientsBw}
          onToast={onToast}
        />
      )}

      {/* FIADOS */}
      {section === 'fiados' && (
        <AdminFiadosSection
          sales={salesBw}
          loading={loadingSalesBw}
          onRefreshSales={loadSalesBw}
          onToast={onToast}
        />
      )}

      {/* HISTÓRICO DE VENDAS */}
      {section === 'historico' && (
        <AdminHistoricoBwSection
          sales={salesBw}
          loading={loadingSalesBw}
          onRefreshSales={loadSalesBw}
          onToast={onToast}
        />
      )}

      {/* FINANCEIRO / RELATÓRIOS MÊS A MÊS */}
      {section === 'relatorios' && (
        <AdminRelatoriosSection
          sales={salesBw}
          orders={orders}
          products={products}
          productCosts={productCosts}
          onNavigateTab={(tab) => setSection(tab)}
        />
      )}

      {/* PRODUTOS */}
      {section === 'produtos' && (
        <div className="space-y-5">
          {criticalStockProducts.length > 0 && (
            <div className="bg-[#A93226]/5 border border-[#A93226]/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-[#A93226] font-semibold">
                Atenção: {criticalStockProducts.length} perfume(s) com estoque crítico (&le;{' '}
                {BW_CONFIG.ESTOQUE_CRITICO} un.):{' '}
                <span className="font-normal text-[#4A3F30]">
                  {criticalStockProducts
                    .slice(0, 4)
                    .map((p) => `${extractNome(p)} (${extractEstoque(p)})`)
                    .join(', ')}
                  {criticalStockProducts.length > 4 ? '...' : ''}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setProdStatusFilter(prodStatusFilter === 'estq' ? '' : 'estq')}
                className="px-3 py-1 rounded-lg bg-white border border-[#A93226]/30 text-[#A93226] font-semibold"
              >
                {prodStatusFilter === 'estq' ? 'Mostrar todos' : 'Filtrar estoque baixo'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="text"
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                placeholder="Buscar produto ou marca..."
                className="px-3.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs min-w-[200px]"
              />
              <select
                value={prodCatFilter}
                onChange={(e) => setProdCatFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
              >
                <option value="">Todas categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <select
                value={prodStatusFilter}
                onChange={(e) => setProdStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
              >
                <option value="">Todos status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
                <option value="estq">Estoque baixo</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedProdIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkActive(true)}
                    className="px-3 py-2 rounded-lg border border-[#1F6E43]/30 text-xs font-semibold text-[#1F6E43] bg-white"
                  >
                    Ativar ({selectedProdIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkActive(false)}
                    className="px-3 py-2 rounded-lg border border-[#A93226]/30 text-xs font-semibold text-[#A93226] bg-white"
                  >
                    Desativar ({selectedProdIds.size})
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={openNewProduct}
                className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Produto
              </button>
            </div>
          </div>

          {prodFormOpen && (
            <form
              onSubmit={handleSaveProduct}
              className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-semibold text-[#1E1712]">
                  {prodEditId ? 'Editar Produto' : 'Novo Produto'}
                </h3>
                <button
                  type="button"
                  onClick={() => setProdFormOpen(false)}
                  className="text-xs text-[#7A6E65] hover:text-[#1E1712]"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#5C5147]">
                    Foto do Perfume (otimização WebP automática)
                  </label>
                  <div className="relative w-full aspect-square rounded-xl border border-dashed border-[#D0C8BC] bg-white overflow-hidden flex items-center justify-center">
                    {pImgUrl ? (
                      <SmartImage
                        src={pImgUrl}
                        alt="Prévia"
                        fit="contain"
                        className="p-3"
                        containerClassName="w-full h-full"
                      />
                    ) : (
                      <span className="text-xs text-[#7A6E65]">Sem imagem selecionada</span>
                    )}
                  </div>
                  <label className="w-full py-2 px-3 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] cursor-pointer flex items-center justify-center gap-1.5 bg-[#FAF8F5]">
                    <Upload className="w-3.5 h-3.5" />
                    Enviar / Recortar Imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCropConfig({ target: 'prod', file, aspect: 1, maxW: 900, maxH: 900 });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    type="url"
                    value={pImgUrl}
                    onChange={(e) => setPImgUrl(e.target.value)}
                    placeholder="Ou cole uma URL https://..."
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
                  />
                </div>

                <div className="md:col-span-2 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">Nome *</label>
                      <input
                        type="text"
                        required
                        value={pNome}
                        onChange={(e) => setPNome(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">Marca</label>
                      <input
                        type="text"
                        value={pMarca}
                        onChange={(e) => setPMarca(e.target.value)}
                        placeholder="Ex: Dior, Chanel"
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">
                        Cartão (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={pPreco}
                        onChange={(e) => {
                          setPPreco(e.target.value);
                          setAutoSyncPricing(false);
                        }}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
                        {(parseFloat(pPreco) || 0) > 0 && (
                          <span className="text-[10px] text-[#7A6E65] tabular-nums">
                            Até {Math.max(1, settings.parcelas || 3)}x de R${' '}
                            {formatBRL((parseFloat(pPreco) || 0) / Math.max(1, settings.parcelas || 3))}
                          </span>
                        )}
                        {(parseFloat(pPix) || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPPreco(priceAudit.cartaoIdealParaPix.toFixed(2));
                              setAutoSyncPricing(false);
                            }}
                            className="text-[10px] font-semibold text-[#9A7437] hover:underline"
                          >
                            Calcular pelo PIX (+{calcPreview.taxaCartaoPerc}%)
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">
                        PIX (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={pPix}
                        onChange={(e) => {
                          setPPix(e.target.value);
                          setAutoSyncPricing(false);
                        }}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                      {(parseFloat(pPreco) || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextPix = roundCurrency((parseFloat(pPreco) || 0) / calcPreview.fatorAcrescimo);
                            setPPix(nextPix.toFixed(2));
                            setAutoSyncPricing(false);
                          }}
                          className="text-[10px] font-semibold text-[#1F6E43] hover:underline mt-1"
                        >
                          Calcular pelo Cartão (sem +{calcPreview.taxaCartaoPerc}% juros)
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">
                        Preço De (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={pOld}
                        onChange={(e) => setPOld(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                      <span className="block text-[10px] text-[#7A6E65] mt-1">
                        Opcional (preço riscado na promoção)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">Estoque</label>
                      <input
                        type="number"
                        value={pEstq}
                        onChange={(e) => setPEstq(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">Volume</label>
                      <input
                        type="text"
                        value={pVol}
                        onChange={(e) => setPVol(e.target.value)}
                        placeholder="100ml"
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C5147] mb-1">
                        Categoria
                      </label>
                      <select
                        value={pCat}
                        onChange={(e) => setPCat(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                      >
                        <option value="fem">Feminino</option>
                        <option value="masc">Masculino</option>
                        <option value="uni">Unissex</option>
                        <option value="kit">Kits</option>
                        {categories
                          .filter((c) => !['fem', 'masc', 'uni', 'kit'].includes(c.slug))
                          .map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.nome}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5C5147] mb-1">
                      Notas Olfativas (separe por vírgula)
                    </label>
                    <input
                      type="text"
                      value={pNotas}
                      onChange={(e) => setPNotas(e.target.value)}
                      placeholder="Ex: Bergamota, Jasmim, Baunilha de Madagascar"
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5C5147] mb-1">
                      Descrição
                    </label>
                    <textarea
                      rows={3}
                      value={pDesc}
                      onChange={(e) => setPDesc(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm resize-none"
                    />
                  </div>

                  {/* Calculadora Privada de Custos & Preços (salva somente para o Admin em custos_produtos) */}
                  <div className="bg-[#FAF8F5] border border-[#E6DFD5] rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Calculator className="w-4 h-4 text-[#9A7437]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#1E1712]">
                          Calculadora de Custos &amp; Lucro (Privado)
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-[#5C5147] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSyncPricing}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAutoSyncPricing(checked);
                            if (checked) {
                              syncPricesIfEnabled(pCusto, pFrete, pDesloc, pMargem, pTaxaCartao, true);
                            }
                          }}
                          className="accent-[#9A7437]"
                        />
                        Atualizar Cartão e PIX automaticamente
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                          Custo Produto (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={pCusto}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPCusto(val);
                            syncPricesIfEnabled(val, pFrete, pDesloc, pMargem, pTaxaCartao);
                          }}
                          placeholder="0,00"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                          Frete (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={pFrete}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPFrete(val);
                            syncPricesIfEnabled(pCusto, val, pDesloc, pMargem, pTaxaCartao);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                          Deslocamento (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={pDesloc}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPDesloc(val);
                            syncPricesIfEnabled(pCusto, pFrete, val, pMargem, pTaxaCartao);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                          Margem (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={pMargem}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPMargem(val);
                            syncPricesIfEnabled(pCusto, pFrete, pDesloc, val, pTaxaCartao);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                          Juros Cartão (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="200"
                          value={pTaxaCartao}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPTaxaCartao(val);
                            syncPricesIfEnabled(pCusto, pFrete, pDesloc, pMargem, val);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-[#E6DFD5]">
                      <div className="space-y-0.5 tabular-nums">
                        <p className="text-[#4A3F30]">
                          Custo Total: <strong>{formatCurrencyBRL(calcPreview.totalCusto)}</strong> ·{' '}
                          PIX sugerido: <strong className="text-[#1F6E43]">{formatCurrencyBRL(calcPreview.vPix)}</strong> ·{' '}
                          Cartão (+{calcPreview.taxaCartaoPerc}%):{' '}
                          <strong>{formatCurrencyBRL(calcPreview.vCartao)}</strong>{' '}
                          <span className="text-[#7A6E65]">(+{formatCurrencyBRL(calcPreview.taxaCartaoReais)})</span> ·{' '}
                          Lucro: <strong className="text-[#9A7437]">{formatCurrencyBRL(calcPreview.lucro)}</strong>
                        </p>
                        {calcPreview.totalCusto > 0 && (
                          <p className="text-[11px] text-[#7A6E65]">
                            Dica lucro R$ 100,00: margem {calcPreview.margemR100.toFixed(0)}% → PIX{' '}
                            {formatCurrencyBRL(calcPreview.precoR100Pix)} · Cartão (+{calcPreview.taxaCartaoPerc}%){' '}
                            {formatCurrencyBRL(calcPreview.precoR100Cartao)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPPix(calcPreview.vPix.toFixed(2));
                            setPPreco(calcPreview.vCartao.toFixed(2));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#1E1712] text-white text-[11px] font-semibold hover:bg-[#9A7437]"
                        >
                          Aplicar Preços
                        </button>
                        {calcPreview.totalCusto > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPMargem(calcPreview.margemR100.toFixed(1));
                              setPPix(calcPreview.precoR100Pix.toFixed(2));
                              setPPreco(calcPreview.precoR100Cartao.toFixed(2));
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#9A7437]/40 text-[#9A7437] text-[11px] font-semibold hover:bg-[#9A7437]/5"
                          >
                            Dica R$ 100
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Conferência real dos preços digitados nos campos Cartão (R$) e PIX (R$) */}
                    {((parseFloat(pPreco) || 0) > 0 || (parseFloat(pPix) || 0) > 0) && (
                      <div className="bg-white border border-[#E6DFD5] rounded-lg p-3 space-y-2 text-[11px] tabular-nums">
                        <p className="font-semibold uppercase tracking-wider text-[#5C5147] text-[10px]">
                          Conferência dos Preços Finais (Loja &amp; PDV)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="rounded-md bg-[#FAF8F5] px-2.5 py-2 border border-[#EFEAE2]">
                            <p className="text-[#7A6E65]">No PIX ({formatCurrencyBRL(parseFloat(pPix) || 0)})</p>
                            {calcPreview.totalCusto > 0 ? (
                              <p className={priceAudit.prejuizoPix ? 'font-bold text-[#A93226]' : 'font-semibold text-[#1F6E43]'}>
                                Lucro: {formatCurrencyBRL(priceAudit.lucroPix)} ({priceAudit.margemPixPerc.toFixed(1)}%)
                              </p>
                            ) : (
                              <p className="text-[#7A6E65]">Recebe {formatCurrencyBRL(parseFloat(pPix) || 0)} integral</p>
                            )}
                          </div>
                          <div className="rounded-md bg-[#FAF8F5] px-2.5 py-2 border border-[#EFEAE2]">
                            <p className="text-[#7A6E65]">
                              No Cartão ({formatCurrencyBRL(parseFloat(pPreco) || 0)} · líq. aprox.{' '}
                              <strong className="text-[#1E1712]">{formatCurrencyBRL(priceAudit.liquidoCartao)}</strong> se descontar {priceAudit.taxaPerc}%)
                            </p>
                            {calcPreview.totalCusto > 0 ? (
                              <p className={priceAudit.prejuizoCartao ? 'font-bold text-[#A93226]' : 'font-semibold text-[#1F6E43]'}>
                                Lucro líquido aprox.: {formatCurrencyBRL(priceAudit.lucroCartao)} ({priceAudit.margemCartaoPerc.toFixed(1)}%)
                              </p>
                            ) : (
                              <p className="text-[#7A6E65]">
                                Acréscimo sobre o PIX: +{formatCurrencyBRL(Math.max(0, (parseFloat(pPreco) || 0) - (parseFloat(pPix) || 0)))}
                              </p>
                            )}
                          </div>
                        </div>

                        {(priceAudit.prejuizoPix || priceAudit.prejuizoCartao) && (
                          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-[#FDF2F2] border border-[#A93226]/30 text-[#A93226] font-semibold">
                            <span>
                              Atenção: o valor líquido está menor que o Custo Total ({formatCurrencyBRL(calcPreview.totalCusto)}) — risco de prejuízo!
                            </span>
                          </div>
                        )}

                        {priceAudit.cartaoAbaixoDoMinimo && (
                          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-[#FFF8EB] border border-[#9A7437]/40 text-[#8C5A1E]">
                            <span>
                              Com +{priceAudit.taxaPerc}% sobre o PIX ({formatCurrencyBRL(parseFloat(pPix) || 0)}), o valor no Cartão fica{' '}
                              <strong>{formatCurrencyBRL(priceAudit.cartaoIdealParaPix)}</strong>.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPPreco(priceAudit.cartaoIdealParaPix.toFixed(2));
                                setAutoSyncPricing(false);
                              }}
                              className="px-2 py-1 rounded bg-[#9A7437] text-white font-semibold text-[10px] hover:bg-[#1E1712]"
                            >
                              Ajustar Cartão p/ {formatCurrencyBRL(priceAudit.cartaoIdealParaPix)}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-5 pt-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pAtivo}
                        onChange={(e) => setPAtivo(e.target.checked)}
                        className="accent-[#9A7437]"
                      />
                      Ativo na loja
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pDest}
                        onChange={(e) => setPDest(e.target.checked)}
                        className="accent-[#9A7437]"
                      />
                      Destaque
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pPromo}
                        onChange={(e) => setPPromo(e.target.checked)}
                        className="accent-[#9A7437]"
                      />
                      Promoção
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingProd}
                      className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] disabled:opacity-60"
                    >
                      {savingProd ? 'Salvando...' : 'Salvar Produto'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProdFormOpen(false)}
                      className="px-4 py-2.5 border border-[#E0D9CF] text-xs font-medium rounded-lg text-[#5C5147]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((p) => {
              const checked = selectedProdIds.has(p.id);
              const estq = extractEstoque(p);
              const pixVal = extractPrecoPix(p);
              const cardVal = extractPreco(p);
              const costRec = productCosts[p.id];
              const isCritical = estq <= BW_CONFIG.ESTOQUE_CRITICO;
              return (
                <div
                  key={p.id}
                  className="bg-white border border-[#E6DFD5] rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="relative w-full aspect-square shrink-0 overflow-hidden bg-white border-b border-[#F2EDE6]">
                    <SmartImage
                      src={extractImg(p)}
                      alt={extractNome(p)}
                      fit="contain"
                      className="p-3"
                      containerClassName="w-full h-full bg-white"
                    />
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selectedProdIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedProdIds(next);
                      }}
                      className="absolute top-2.5 left-2.5 w-4 h-4 accent-[#9A7437]"
                    />
                    <span
                      className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                        estq <= 0
                          ? 'bg-[#A93226] text-white'
                          : isCritical
                          ? 'bg-[#A93226]/15 text-[#A93226]'
                          : 'bg-[#FAF8F5] text-[#1E1712] border border-[#E6DFD5]'
                      }`}
                    >
                      {estq} un
                    </span>
                  </div>
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-[#7A6E65] truncate">
                        {extractMarca(p) || 'Importado'} · {p.ativo === false ? 'Inativo' : 'Ativo'}
                      </p>
                      <p className="text-sm font-semibold text-[#1E1712] truncate">
                        {extractNome(p)}
                      </p>
                      <p className="text-xs font-bold text-[#1F6E43] tabular-nums mt-0.5">
                        PIX R$ {formatBRL(pixVal)} <span className="font-normal text-[#7A6E65]">· Cartão R$ {formatBRL(cardVal)}</span>
                      </p>
                      {costRec && (
                        <p className="text-[11px] text-[#9A7437] tabular-nums mt-0.5">
                          Custo base {formatCurrencyBRL(costRec.custoBase || costRec.custo)} · Margem {costRec.margem}%
                        </p>
                      )}
                    </div>

                    {/* Quick Stock + Vender Controls */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-[#F2EDE6]">
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustStock(p, -1)}
                        title="Baixar -1 estoque"
                        className="px-2 py-1 rounded border border-[#E0D9CF] text-xs font-semibold text-[#5C5147] hover:border-[#A93226] hover:text-[#A93226]"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustStock(p, 1)}
                        title="Adicionar +1 estoque"
                        className="px-2 py-1 rounded border border-[#E0D9CF] text-xs font-semibold text-[#1F6E43] hover:border-[#1F6E43]"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrefillPdvProductId(p.id);
                          setSection('vender');
                        }}
                        className="flex-1 py-1 rounded bg-[#1E1712] text-white text-[11px] font-semibold hover:bg-[#9A7437]"
                      >
                        Vender
                      </button>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openEditProduct(p)}
                        title="Editar"
                        className="flex-1 py-1.5 rounded border border-[#E0D9CF] text-xs font-medium text-[#1E1712] hover:border-[#9A7437] flex items-center justify-center"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateProduct(p)}
                        title="Duplicar"
                        className="flex-1 py-1.5 rounded border border-[#E0D9CF] text-xs font-medium text-[#1E1712] hover:border-[#9A7437] flex items-center justify-center"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        title="Excluir"
                        className="flex-1 py-1.5 rounded border border-[#A93226]/25 text-xs font-medium text-[#A93226] hover:bg-[#A93226] hover:text-white flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CATEGORIAS */}
      {section === 'categorias' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => openEditCat()}
              className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Categoria
            </button>
          </div>

          {catFormOpen && (
            <form
              onSubmit={handleSaveCategory}
              className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-4"
            >
              <h3 className="font-display text-2xl font-semibold text-[#1E1712]">
                {catEditId ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={cNome}
                    onChange={(e) => setCNome(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Slug *</label>
                  <input
                    type="text"
                    required
                    value={cSlug}
                    onChange={(e) => setCSlug(e.target.value)}
                    placeholder="fem, masc, uni..."
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Imagem</label>
                  <label className="w-full py-2 px-3 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] cursor-pointer flex items-center justify-center gap-1.5 bg-[#FAF8F5]">
                    <Upload className="w-3.5 h-3.5" />
                    Escolher Foto (4:3)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCropConfig({ target: 'cat', file, aspect: 4 / 3, maxW: 800, maxH: 600 });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={cVisivel}
                  onChange={(e) => setCVisivel(e.target.checked)}
                  className="accent-[#9A7437]"
                />
                Visível na vitrine
              </label>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437]"
                >
                  {savingCat ? 'Salvando...' : 'Salvar Categoria'}
                </button>
                <button
                  type="button"
                  onClick={() => setCatFormOpen(false)}
                  className="px-4 py-2.5 border border-[#E0D9CF] text-xs rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {categories.map((c) => (
              <div key={c.id} className="bg-white border border-[#E6DFD5] rounded-xl overflow-hidden">
                <SmartImage
                  src={c.img || c.imgUrl}
                  alt={c.nome}
                  fit="cover"
                  containerClassName="aspect-[4/3] w-full"
                />
                <div className="p-3.5">
                  <p className="text-sm font-semibold text-[#1E1712]">{c.nome}</p>
                  <p className="text-xs text-[#7A6E65] mb-3">
                    {c.slug} · {c.hidden ? 'Oculta' : 'Visível'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditCat(c)}
                      className="flex-1 py-1.5 rounded border border-[#E0D9CF] text-xs font-medium"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id)}
                      className="py-1.5 px-2.5 rounded border border-[#A93226]/25 text-xs text-[#A93226]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BANNERS */}
      {section === 'banners' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
                Capas & Campanhas Sazonais
              </h2>
              <p className="text-xs text-[#7A6E65]">
                Crie banners para datas como Natal, Dia das Mães ou Black Friday, recorte e ajuste o encaixe na tela.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openEditBanner(-1)}
              className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Banner Sazonal
            </button>
          </div>

          {banFormOpen && (
            <form
              onSubmit={handleSaveBanner}
              className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-2xl font-semibold text-[#1E1712]">
                  {banEditIdx >= 0 ? 'Editar Capa / Banner' : 'Novo Banner Sazonal'}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[#7A6E65] mr-1">Modelos rápidos:</span>
                  {[
                    { id: 'natal', label: 'Natal' },
                    { id: 'black', label: 'Black Friday' },
                    { id: 'maes', label: 'Dia das Mães' },
                    { id: 'padrao', label: 'Padrão' },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applySeasonalTemplate(tpl.id as 'natal' | 'black' | 'maes' | 'padrao')}
                      className="px-2.5 py-1 rounded border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437] text-[11px] font-medium text-[#1E1712]"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Visual Preview */}
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-[#7A6E65] font-semibold">
                  Pré-visualização na vitrine
                </p>
                <div className="relative rounded-xl overflow-hidden bg-[#1E1712] text-white aspect-[21/9] min-h-[160px] flex items-center border border-[#E6DFD5]">
                  {bImgUrl ? (
                    <SmartImage
                      src={bImgUrl}
                      alt={bTitulo || 'Prévia'}
                      fit={bFit}
                      pos={bPos}
                      containerClassName="absolute inset-0 w-full h-full bg-[#1E1712]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A89F95]">
                      Envie uma foto ou informe uma URL abaixo
                    </div>
                  )}
                  {!bSomenteImagem && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-r from-[#1E1712]/90 via-[#1E1712]/60 to-transparent" />
                      <div className="relative z-10 p-5 sm:p-8 max-w-md space-y-1.5">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF6E] font-semibold">
                          {bTag || 'COLEÇÃO'}
                        </p>
                        <p className="font-display text-xl sm:text-2xl font-semibold leading-tight">
                          {bTitulo || 'Título da Campanha'}
                        </p>
                        <p className="text-[11px] sm:text-xs text-[#E6DFD5] line-clamp-2">
                          {bDesc || 'Descrição promocional exibida na capa.'}
                        </p>
                        <span className="inline-block mt-1 px-3 py-1 rounded bg-[#9A7437] text-[11px] font-semibold">
                          {bBtnTxt || 'Ver Coleção →'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Título</label>
                  <input
                    type="text"
                    value={bTitulo}
                    onChange={(e) => setBTitulo(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    Rótulo (Tag Sazonal)
                  </label>
                  <input
                    type="text"
                    value={bTag}
                    onChange={(e) => setBTag(e.target.value)}
                    placeholder="Ex: ESPECIAL DE NATAL"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">Descrição</label>
                <input
                  type="text"
                  value={bDesc}
                  onChange={(e) => setBDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    Texto do Botão
                  </label>
                  <input
                    type="text"
                    value={bBtnTxt}
                    onChange={(e) => setBBtnTxt(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    Destino do Clique
                  </label>
                  <select
                    value={bLink}
                    onChange={(e) => setBLink(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  >
                    <option value="catalogo">Catálogo Completo</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="unissex">Unissex</option>
                    <option value="kits">Kits</option>
                    <option value="como">Como Comprar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    Encaixe da Imagem
                  </label>
                  <select
                    value={bFit}
                    onChange={(e) => setBFit(e.target.value as 'cover' | 'contain')}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  >
                    <option value="cover">Preencher espaço (Cover)</option>
                    <option value="contain">Imagem inteira sem cortar (Contain)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    Posição / Enquadramento
                  </label>
                  <select
                    value={bPos}
                    onChange={(e) => setBPos(e.target.value as 'center' | 'top' | 'bottom')}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  >
                    <option value="center">Centralizado</option>
                    <option value="top">Alinhar ao Topo</option>
                    <option value="bottom">Alinhar à Base</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">
                    URL da Imagem (opcional se enviar arquivo ao lado)
                  </label>
                  <input
                    type="url"
                    value={bImgUrl}
                    onChange={(e) => {
                      setBImgUrl(e.target.value);
                      setBPendingBlob(null);
                    }}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="w-full py-2.5 px-3 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] cursor-pointer flex items-center justify-center gap-1.5 bg-[#FAF8F5]">
                    <Upload className="w-3.5 h-3.5" />
                    Enviar & Ajustar Imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCropConfig({ target: 'ban', file, aspect: 21 / 9, maxW: 1680, maxH: 720 });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bVisivel}
                    onChange={(e) => setBVisivel(e.target.checked)}
                    className="accent-[#9A7437]"
                  />
                  Visível na vitrine
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bSomenteImagem}
                    onChange={(e) => setBSomenteImagem(e.target.checked)}
                    className="accent-[#9A7437]"
                  />
                  Arte pronta (exibir somente a imagem, sem texto por cima)
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingBan}
                  className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437]"
                >
                  {savingBan ? 'Salvando...' : 'Salvar Banner'}
                </button>
                <button
                  type="button"
                  onClick={() => setBanFormOpen(false)}
                  className="px-4 py-2.5 border border-[#E0D9CF] text-xs rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {banners.map((b, idx) => (
              <div
                key={idx}
                className="bg-white border border-[#E6DFD5] rounded-xl p-4 flex flex-wrap items-center gap-4"
              >
                <SmartImage
                  src={b.img}
                  alt={b.titulo || 'Banner'}
                  fit={b.fit || 'cover'}
                  pos={b.pos || 'center'}
                  containerClassName="w-36 h-20 rounded-lg shrink-0 bg-[#1E1712]"
                />
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold text-[#1E1712]">
                    {idx === 0 ? 'Capa Principal · ' : ''}
                    {b.titulo || 'Sem título'}
                  </p>
                  <p className="text-xs text-[#7A6E65] truncate">{b.desc || b.sub}</p>
                  <p className="text-[11px] text-[#9A7437] mt-0.5">
                    {b.visivel === false ? 'Oculto' : 'Visível'} · {b.fit === 'contain' ? 'Sem cortes' : 'Preenchido'}
                    {b.somenteImagem ? ' · Arte pronta' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMakePrimaryBanner(idx)}
                      className="px-3 py-1.5 rounded border border-[#9A7437]/40 text-xs font-semibold text-[#9A7437]"
                    >
                      Definir como 1ª
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditBanner(idx)}
                    className="px-3 py-1.5 rounded border border-[#E0D9CF] text-xs font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleBanner(idx)}
                    className="px-3 py-1.5 rounded border border-[#E0D9CF] text-xs font-medium"
                  >
                    {b.visivel === false ? 'Mostrar' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBanner(idx)}
                    className="px-3 py-1.5 rounded border border-[#A93226]/25 text-xs text-[#A93226]"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PEDIDOS */}
      {section === 'pedidos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['todos', 'pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado'].map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOrderFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      orderFilter === st
                        ? 'bg-[#1E1712] text-white border-[#1E1712]'
                        : 'bg-white text-[#5C5147] border-[#E0D9CF]'
                    }`}
                  >
                    {st === 'todos' ? 'Todos' : ORDER_STATUS_LABELS[st]}
                  </button>
                )
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {cancelledOrders.length > 0 && (
                confirmClearCancelled ? (
                  <div className="flex items-center gap-1.5 bg-white border border-[#A93226]/30 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-[#A93226] font-semibold">
                      Apagar {cancelledOrders.length} cancelado(s)?
                    </span>
                    <button
                      type="button"
                      disabled={clearingCancelled}
                      onClick={handleDeleteCancelledOrders}
                      className="px-2.5 py-1 rounded bg-[#A93226] text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {clearingCancelled ? 'Apagando...' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearCancelled(false)}
                      className="px-2 py-1 rounded border border-[#E0D9CF] text-xs text-[#5C5147]"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearCancelled(true)}
                    className="px-3.5 py-2 rounded-lg border border-[#A93226]/30 bg-white text-xs font-semibold text-[#A93226] hover:bg-[#A93226]/5 inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar Cancelados ({cancelledOrders.length})
                  </button>
                )
              )}
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={loadOrders}
                className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
            </div>
          </div>

          {loadingOrders ? (
            <p className="text-xs text-[#7A6E65]">Carregando pedidos...</p>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center text-xs text-[#7A6E65]">
              Nenhum pedido neste filtro.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((o) => {
                const st = o.status || 'pendente';
                const dt = o.criadoEm?.toDate
                  ? o.criadoEm.toDate().toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';
                const itensTxt = Array.isArray(o.itens)
                  ? o.itens.map((i) => `${i.qty || 1}× ${i.nome}`).join(', ')
                  : o.resumo || '—';
                const draft = trackingDrafts[o.id] || {};
                const nextOptions = NEXT_STATUS[st] || [];

                return (
                  <div
                    key={o.id}
                    className="bg-white border border-[#E6DFD5] rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F2EDE6]">
                      <div>
                        <p className="text-sm font-semibold text-[#1E1712]">
                          {o.nome || 'Cliente'} ·{' '}
                          <span className="text-xs font-normal text-[#7A6E65]">{dt}</span>
                        </p>
                        <p className="text-xs text-[#5C5147] mt-0.5">{itensTxt}</p>
                        <p className="text-xs text-[#7A6E65] mt-1">
                          WhatsApp: {o.wpp || '—'} · Pagamento: {(o.pagamento || o.pag || 'pix').toUpperCase()}
                          {o.parcelas && o.parcelas > 1 ? ` (${o.parcelas}×)` : ''}
                        </p>
                        {o.endereco && (
                          <p className="text-xs text-[#7A6E65]">
                            Endereço: {o.endereco} {o.cidade ? `– ${o.cidade}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-[#9A7437] block">
                          {ORDER_STATUS_LABELS[st] || st}
                        </span>
                        <span className="text-lg font-bold text-[#1E1712] tabular-nums">
                          R$ {formatBRL(o.total || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Tracking Editor */}
                    <div className="bg-[#FAF8F5] border border-[#EFEAE2] rounded-lg p-3.5 space-y-2.5">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#7A6E65]">
                        Entrega e Rastreamento
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <select
                          value={draft.tipo || ''}
                          onChange={(e) =>
                            setTrackingDrafts((prev) => ({
                              ...prev,
                              [o.id]: { ...prev[o.id], tipo: e.target.value },
                            }))
                          }
                          className="px-2.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        >
                          <option value="">Modalidade</option>
                          <option value="retirada">Retirada</option>
                          <option value="uber">Motoboy / App</option>
                          <option value="correios">Correios</option>
                          <option value="transportadora">Transportadora</option>
                        </select>
                        <input
                          type="text"
                          value={draft.codigo || ''}
                          onChange={(e) =>
                            setTrackingDrafts((prev) => ({
                              ...prev,
                              [o.id]: { ...prev[o.id], codigo: e.target.value },
                            }))
                          }
                          placeholder="Código de rastreio"
                          className="px-2.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                        <input
                          type="url"
                          value={draft.url || ''}
                          onChange={(e) =>
                            setTrackingDrafts((prev) => ({
                              ...prev,
                              [o.id]: { ...prev[o.id], url: e.target.value },
                            }))
                          }
                          placeholder="Link de rastreio"
                          className="px-2.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTracking(o)}
                          className="px-3 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437]"
                        >
                          Salvar Rastreio
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {st !== 'cancelado' && (
                        o.lancadoCaixa ? (
                          <span className="px-3 py-1.5 rounded-lg bg-[#1F6E43]/10 text-[#1F6E43] text-xs font-semibold inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Lançado no Caixa
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={postingOrderId === o.id}
                            onClick={() => handlePostOrderToCaixa(o)}
                            className="px-3 py-1.5 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                          >
                            {postingOrderId === o.id ? 'Lançando...' : 'Lançar no Caixa & Baixar Estoque'}
                          </button>
                        )
                      )}

                      {nextOptions.map((ns) => (
                        <button
                          key={ns}
                          type="button"
                          onClick={() => handleUpdateOrderStatus(o, ns)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            ns === 'cancelado'
                              ? 'border-[#A93226]/30 text-[#A93226]'
                              : 'border-[#1F6E43]/30 text-[#1F6E43] bg-[#1F6E43]/5'
                          }`}
                        >
                          Marcar: {ORDER_STATUS_LABELS[ns]}
                        </button>
                      ))}

                      {confirmDeleteOrderId === o.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingOrderId === o.id}
                            onClick={() => handleDeleteOrder(o)}
                            className="px-3 py-1.5 rounded-lg bg-[#A93226] text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {deletingOrderId === o.id ? 'Apagando...' : 'Confirmar exclusão'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOrderId(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E0D9CF] text-xs text-[#5C5147]"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteOrderId(o.id)}
                          className="px-3 py-1.5 rounded-lg border border-[#A93226]/30 text-[#A93226] hover:bg-[#A93226]/5 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Apagar Pedido
                        </button>
                      )}

                      {o.wpp && (
                        <a
                          href={buildWhatsappUrl(
                            o.wpp,
                            `Olá ${o.nome || ''}! Atualização do seu pedido na BW Parfum: *${
                              ORDER_STATUS_LABELS[st] || st
                            }*.${draft.codigo ? ` Código de rastreio: ${draft.codigo}` : ''}`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto px-3 py-1.5 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Notificar Cliente
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CLIENTES (PDV + LOJA ONLINE) */}
      {section === 'clientes' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setClientTab('pdv')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border ${
                  clientTab === 'pdv'
                    ? 'bg-[#1E1712] text-white border-[#1E1712]'
                    : 'bg-white text-[#5C5147] border-[#E0D9CF]'
                }`}
              >
                Clientes PDV ({clientsBw.length})
              </button>
              <button
                type="button"
                onClick={() => setClientTab('online')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border ${
                  clientTab === 'online'
                    ? 'bg-[#1E1712] text-white border-[#1E1712]'
                    : 'bg-white text-[#5C5147] border-[#E0D9CF]'
                }`}
              >
                Clientes da Loja Online ({clients.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar cliente por nome, contato ou endereço..."
                className="w-64 px-3.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs"
              />
              {clientTab === 'pdv' && (
                <button
                  type="button"
                  onClick={() => openEditClientBw()}
                  className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Cliente PDV
                </button>
              )}
            </div>
          </div>

          {clientTab === 'pdv' && clientBwFormOpen && (
            <form
              onSubmit={handleSaveClientBw}
              className="bg-white border border-[#E6DFD5] rounded-xl p-5 space-y-4"
            >
              <h3 className="font-display text-xl font-semibold text-[#1E1712]">
                {clientBwEditId ? 'Editar Cliente PDV' : 'Novo Cliente PDV'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={cbNome}
                    onChange={(e) => setCbNome(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">WhatsApp / Contato</label>
                  <input
                    type="text"
                    value={cbContato}
                    onChange={(e) => setCbContato(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5147] mb-1">Endereço</label>
                  <input
                    type="text"
                    value={cbEndereco}
                    onChange={(e) => setCbEndereco(e.target.value)}
                    placeholder="Rua, número, bairro"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingClientBw}
                  className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] disabled:opacity-50"
                >
                  {savingClientBw ? 'Salvando...' : 'Salvar Cliente'}
                </button>
                <button
                  type="button"
                  onClick={() => setClientBwFormOpen(false)}
                  className="px-4 py-2 border border-[#E0D9CF] text-xs rounded-lg text-[#5C5147]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {clientTab === 'pdv' ? (
            loadingClientsBw ? (
              <p className="text-xs text-[#7A6E65]">Carregando clientes PDV...</p>
            ) : filteredClientsBw.length === 0 ? (
              <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center text-xs text-[#7A6E65]">
                Nenhum cliente PDV encontrado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredClientsBw.map((c) => {
                  const isConfirmDel = confirmDeleteClientBwId === c.id;
                  return (
                    <div
                      key={c.id}
                      className="bg-white border border-[#E6DFD5] rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1E1712] truncate">{c.nome}</p>
                          <p className="text-xs text-[#7A6E65] truncate">{c.contato || 'Sem contato'}</p>
                          {c.endereco && (
                            <p className="text-xs text-[#5C5147] mt-0.5 truncate">{c.endereco}</p>
                          )}
                        </div>
                        {c.contato && (
                          <a
                            href={buildWhatsappUrl(c.contato)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg border border-[#1F6E43]/30 text-[11px] font-semibold text-[#1F6E43] shrink-0"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F2EDE6]">
                        <button
                          type="button"
                          onClick={() => {
                            setPrefillPdvClient(c);
                            setSection('vender');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437]"
                        >
                          Nova Venda
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditClientBw(c)}
                          className="px-3 py-1.5 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#1E1712]"
                        >
                          Editar
                        </button>
                        {isConfirmDel ? (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <button
                              type="button"
                              onClick={() => handleDeleteClientBw(c.id)}
                              className="px-2.5 py-1 rounded bg-[#A93226] text-white text-xs font-semibold"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClientBwId(null)}
                              className="px-2 py-1 rounded border border-[#E0D9CF] text-xs"
                            >
                              Voltar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteClientBwId(c.id)}
                            className="ml-auto px-2.5 py-1.5 rounded-lg border border-[#A93226]/25 text-xs text-[#A93226]"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : loadingClients ? (
            <p className="text-xs text-[#7A6E65]">Carregando clientes online...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredClients.map((c) => (
                <div
                  key={c.id}
                  className="bg-white border border-[#E6DFD5] rounded-xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1E1712] truncate">
                      {c.nome || 'Cliente'}
                    </p>
                    <p className="text-xs text-[#7A6E65] truncate">{c.email || '—'}</p>
                    <p className="text-xs text-[#5C5147] mt-1">
                      {[c.wpp, c.cidade && `${c.cidade}${c.estado ? `/${c.estado}` : ''}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {c.wpp && (
                    <a
                      href={buildWhatsappUrl(c.wpp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-lg border border-[#1F6E43]/30 text-xs font-semibold text-[#1F6E43] shrink-0"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AVALIAÇÕES */}
      {section === 'reviews' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'todos', label: 'Todas' },
              { id: 'pending', label: 'Pendentes' },
              { id: 'approved', label: 'Aprovadas' },
              { id: 'rejected', label: 'Rejeitadas' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setReviewFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  reviewFilter === f.id
                    ? 'bg-[#1E1712] text-white border-[#1E1712]'
                    : 'bg-white text-[#5C5147] border-[#E0D9CF]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loadingReviews ? (
            <p className="text-xs text-[#7A6E65]">Carregando avaliações...</p>
          ) : filteredReviews.length === 0 ? (
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center text-xs text-[#7A6E65]">
              Nenhuma avaliação neste filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((r) => {
                const prodObj = products.find((p) => p.id === (r.prodId || r.produtoId));
                const prodTitle = r.prodNome || (prodObj ? extractNome(prodObj) : r.prodId);
                const authorName = r.autor || r.nome || 'Cliente';
                const st = r.status || 'pending';

                return (
                  <div
                    key={r.id}
                    className="bg-white border border-[#E6DFD5] rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-[#1E1712]">{authorName}</span>
                        <span className="text-xs text-[#7A6E65] ml-2">· {prodTitle}</span>
                      </div>
                      <span className="text-xs text-[#9A7437]">
                        {'★'.repeat(Math.min(5, Math.max(1, r.nota || 5)))} ·{' '}
                        {st === 'approved' ? 'Aprovada' : st === 'rejected' ? 'Rejeitada' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-xs text-[#4A3F30] leading-relaxed">{r.texto || r.txt}</p>
                    <div className="flex gap-2">
                      {st !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleModerateReview(r.id, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold"
                        >
                          Aprovar
                        </button>
                      )}
                      {st !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleModerateReview(r.id, 'rejected')}
                          className="px-3 py-1.5 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#5C5147]"
                        >
                          Rejeitar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteReview(r.id)}
                        className="px-3 py-1.5 rounded-lg border border-[#A93226]/25 text-xs text-[#A93226]"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONFIGS */}
      {section === 'configs' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
              Configurações da Loja
            </h2>
            <button
              type="submit"
              disabled={savingCfg}
              className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437]"
            >
              {savingCfg ? 'Salvando...' : 'Salvar Tudo'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Nome da Loja</label>
              <input
                type="text"
                value={cfgForm.nome || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, nome: e.target.value })}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                WhatsApp de Atendimento (DDI+DDD+Número)
              </label>
              <input
                type="text"
                value={cfgForm.wpp || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, wpp: e.target.value })}
                placeholder="5511999999999"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Slogan</label>
              <input
                type="text"
                value={cfgForm.slogan || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, slogan: e.target.value })}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Faixa Superior (Topbar)
              </label>
              <input
                type="text"
                value={cfgForm.topbar || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, topbar: e.target.value })}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Parcelas sem juros no Cartão
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={cfgForm.parcelas ?? 3}
                onChange={(e) =>
                  setCfgForm({ ...cfgForm, parcelas: parseInt(e.target.value, 10) || 3 })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Alerta de Estoque Baixo (unidades)
              </label>
              <input
                type="number"
                min={1}
                value={cfgForm.estoqueAlerta ?? 5}
                onChange={(e) =>
                  setCfgForm({ ...cfgForm, estoqueAlerta: parseInt(e.target.value, 10) || 5 })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Modelo Mensagem Pedido WhatsApp
              </label>
              <textarea
                rows={3}
                value={cfgForm.msgPedido || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, msgPedido: e.target.value })}
                placeholder="Variáveis: {nome}, {wpp}, {total}, {pagamento}, {itens}, {endereco}"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Mensagem Boas-Vindas Novo Cadastro
              </label>
              <textarea
                rows={3}
                value={cfgForm.msgBoasVindas || ''}
                onChange={(e) => setCfgForm({ ...cfgForm, msgBoasVindas: e.target.value })}
                placeholder="Use {nome}"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfgForm.mostraPix !== false}
                onChange={(e) => setCfgForm({ ...cfgForm, mostraPix: e.target.checked })}
                className="accent-[#9A7437]"
              />
              Exibir desconto PIX nos produtos
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfgForm.lojaAberta !== false}
                onChange={(e) => setCfgForm({ ...cfgForm, lojaAberta: e.target.checked })}
                className="accent-[#9A7437]"
              />
              Loja aberta para pedidos
            </label>
          </div>
        </form>
      )}

      {/* SYNC BW */}
      {section === 'sync' && (
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
                Sincronização BW Imports & Catálogo
              </h2>
              <p className="text-xs text-[#7A6E65] mt-0.5">
                Atualiza preços (PIX/Cartão) e estoque diretamente do app BW Imports preservando fotos e descrições do catálogo.
              </p>
            </div>
            <button
              type="button"
              disabled={syncing}
              onClick={handleSyncAll}
              className="px-4 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Tudo (BW Imports)'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={() => handleSyncSingle('produtos', 'produtos')}
              className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437] text-xs font-semibold text-[#1E1712] disabled:opacity-60"
            >
              Sincronizar Produtos & Estoque
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => handleSyncSingle('clientes', 'clientes_bw')}
              className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437] text-xs font-semibold text-[#1E1712] disabled:opacity-60"
            >
              Sincronizar Clientes BW
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => handleSyncSingle('vendas', 'vendas_bw')}
              className="px-3.5 py-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437] text-xs font-semibold text-[#1E1712] disabled:opacity-60"
            >
              Sincronizar Vendas BW
            </button>
            {onImportLegacyCatalog && (
              <button
                type="button"
                disabled={syncing}
                onClick={handleImportLegacy}
                className="px-3.5 py-2 rounded-lg border border-[#9A7437]/40 bg-[#9A7437]/10 hover:bg-[#9A7437]/20 text-xs font-semibold text-[#9A7437] disabled:opacity-60"
              >
                Importar do Banco Anterior (catalogo-bw)
              </button>
            )}
          </div>

          <pre className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E6DFD5] text-xs text-[#4A3F30] whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
            {syncLogs}
          </pre>
        </div>
      )}

      {cropConfig && (
        <ImageCropperModal
          file={cropConfig.file}
          aspectRatio={cropConfig.aspect}
          maxWidth={cropConfig.maxW}
          maxHeight={cropConfig.maxH}
          onCancel={() => setCropConfig(null)}
          onConfirm={({ blob, previewUrl, ext, mime }) => {
            if (cropConfig.target === 'prod') {
              setPImgUrl(previewUrl);
              setPPendingBlob({ blob, ext, mime });
            } else if (cropConfig.target === 'cat') {
              setCImgUrl(previewUrl);
              setCPendingBlob({ blob, ext, mime });
            } else {
              setBImgUrl(previewUrl);
              setBPendingBlob({ blob, ext, mime });
            }
            setCropConfig(null);
            onToast('Imagem recortada e otimizada em WebP.', 'ok');
          }}
        />
      )}
    </section>
  );
};
