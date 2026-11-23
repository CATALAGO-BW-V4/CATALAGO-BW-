import React, { useEffect, useState } from 'react';
import {
  User,
  MapPin,
  Package,
  Heart,
  Lock,
  LogOut,
  MessageCircle,
  ExternalLink,
  Search,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Order, OrderTracking, Product, StoreSettings } from '../types';
import {
  buildWhatsappUrl,
  cleanDigits,
  formatBRL,
  formatCepMask,
  formatPhoneMask,
  safeExternalUrl,
} from '../lib/format';
import { ProductCard } from './ProductCard';

interface AccountViewProps {
  user: FirebaseUser;
  products: Product[];
  wishlist: string[];
  settings: StoreSettings;
  onBackStore: () => void;
  onOpenProduct: (id: string) => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  cartIds: string[];
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

const UF_LIST = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em Preparo',
  enviado: 'Enviado',
  saiu_entrega: 'Saiu p/ Entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const TIMELINE_STEPS = [
  { key: 'pendente', label: 'Recebido' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'em_preparo', label: 'Em Preparo' },
  { key: 'enviado', label: 'Enviado' },
  { key: 'saiu_entrega', label: 'Em Rota' },
  { key: 'entregue', label: 'Entregue' },
];

const STATUS_INDEX: Record<string, number> = {
  pendente: 0,
  confirmado: 1,
  em_preparo: 2,
  enviado: 3,
  saiu_entrega: 4,
  entregue: 5,
  cancelado: -1,
};

export const AccountView: React.FC<AccountViewProps> = ({
  user,
  products,
  wishlist,
  settings,
  onBackStore,
  onOpenProduct,
  onAddCart,
  onToggleWish,
  cartIds,
  onToast,
}) => {
  const [tab, setTab] = useState<'perfil' | 'endereco' | 'pedidos' | 'favoritos' | 'senha'>('pedidos');
  const [nome, setNome] = useState(user.displayName || '');
  const [wpp, setWpp] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('SP');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConf, setSenhaConf] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'clients', user.uid));
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.nome) setNome(d.nome);
        if (d.wpp) setWpp(formatPhoneMask(String(d.wpp)));
        if (d.cep) setCep(formatCepMask(String(d.cep)));
        if (d.endereco) setEndereco(d.endereco);
        if (d.complemento) setComplemento(d.complemento);
        if (d.bairro) setBairro(d.bairro);
        if (d.cidade) setCidade(d.cidade);
        if (d.estado) setEstado(d.estado);
      } catch (err) {
        console.warn('Erro ao carregar perfil:', err);
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    setLoadingOrders(true);
    let unsubFallback: (() => void) | null = null;

    const qMain = query(collection(db, 'pedidos'), where('uid', '==', user.uid), limit(50));
    const unsubMain = onSnapshot(
      qMain,
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Order)
            .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
          setOrders(list);
          setLoadingOrders(false);
        } else {
          if (unsubFallback) unsubFallback();
          unsubFallback = onSnapshot(
            query(collection(db, 'clients', user.uid, 'pedidos'), limit(50)),
            (subSnap) => {
              const list = subSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }) as Order)
                .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
              setOrders(list);
              setLoadingOrders(false);
            },
            () => setLoadingOrders(false)
          );
        }
      },
      () => {
        setLoadingOrders(false);
      }
    );

    return () => {
      unsubMain();
      if (unsubFallback) unsubFallback();
    };
  }, [user.uid]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      onToast('Informe seu nome completo.', 'er');
      return;
    }
    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, 'clients', user.uid),
        {
          nome: nome.trim().slice(0, 120),
          wpp: cleanDigits(wpp).slice(0, 20),
          updAt: serverTimestamp(),
        },
        { merge: true }
      );
      onToast('Perfil atualizado com sucesso.', 'ok');
    } catch {
      onToast('Erro ao salvar perfil.', 'er');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCepLookup = async (rawCep?: string) => {
    const digits = cleanDigits(rawCep ?? cep);
    if (digits.length !== 8) {
      onToast('Digite um CEP válido com 8 dígitos.', 'er');
      return;
    }
    setLookingUpCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        onToast('CEP não encontrado.', 'er');
        return;
      }
      if (data.logradouro) setEndereco(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf);
      onToast('Endereço preenchido pelo CEP.', 'ok');
    } catch {
      onToast('Não foi possível consultar o CEP.', 'er');
    } finally {
      setLookingUpCep(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const digitsCep = cleanDigits(cep);
    if (!digitsCep || !endereco.trim() || !cidade.trim()) {
      onToast('Preencha CEP, endereço e cidade.', 'er');
      return;
    }
    setSavingAddress(true);
    try {
      await setDoc(
        doc(db, 'clients', user.uid),
        {
          cep: digitsCep.slice(0, 12),
          endereco: endereco.trim().slice(0, 240),
          complemento: complemento.trim().slice(0, 120),
          bairro: bairro.trim().slice(0, 100),
          cidade: cidade.trim().slice(0, 100),
          estado: estado.slice(0, 4),
          updAt: serverTimestamp(),
        },
        { merge: true }
      );
      onToast('Endereço salvo com sucesso.', 'ok');
    } catch {
      onToast('Erro ao salvar endereço.', 'er');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaAtual || !senhaNova || !senhaConf) {
      onToast('Preencha todos os campos de senha.', 'er');
      return;
    }
    if (senhaNova.length < 6) {
      onToast('A nova senha deve ter no mínimo 6 caracteres.', 'er');
      return;
    }
    if (senhaNova !== senhaConf) {
      onToast('A confirmação de senha não confere.', 'er');
      return;
    }
    if (!user.email) return;

    setSavingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, senhaAtual);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, senhaNova);
      setSenhaAtual('');
      setSenhaNova('');
      setSenhaConf('');
      onToast('Senha alterada com sucesso.', 'ok');
    } catch {
      onToast('Senha atual incorreta ou sessão expirada.', 'er');
    } finally {
      setSavingPass(false);
    }
  };

  const handleResetEmail = async () => {
    if (!user.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      onToast(`Link de redefinição enviado para ${user.email}.`, 'ok');
    } catch {
      onToast('Erro ao enviar e-mail de redefinição.', 'er');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    onToast('Você saiu da sua conta.', 'ts');
    onBackStore();
  };

  const favoriteProducts = products.filter(
    (p) => p.ativo !== false && wishlist.includes(p.id)
  );

  const initials = (nome || user.email || 'U')
    .split(' ')
    .map((w) => w[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-[#1E1712] text-white flex items-center justify-center font-semibold text-base shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1E1712]">
              Minha Conta
            </h1>
            <p className="text-xs text-[#7A6E65]">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackStore}
            className="px-4 py-2 rounded-lg border border-[#E0D9CF] bg-white text-xs font-medium text-[#4A3F30] hover:border-[#9A7437]"
          >
            ← Voltar à Loja
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3.5 py-2 rounded-lg border border-[#A93226]/25 bg-[#A93226]/5 text-xs font-medium text-[#A93226] hover:bg-[#A93226] hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#EFEAE2] rounded-xl overflow-x-auto mb-6">
        {[
          { id: 'pedidos' as const, label: 'Meus Pedidos', icon: Package },
          { id: 'perfil' as const, label: 'Perfil', icon: User },
          { id: 'endereco' as const, label: 'Endereço', icon: MapPin },
          { id: 'favoritos' as const, label: `Favoritos (${favoriteProducts.length})`, icon: Heart },
          { id: 'senha' as const, label: 'Segurança', icon: Lock },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 min-w-fit px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-white text-[#1E1712]'
                  : 'text-[#6B5E53] hover:text-[#1E1712]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Pedidos */}
      {tab === 'pedidos' && (
        <div className="space-y-4">
          {loadingOrders ? (
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center text-sm text-[#7A6E65]">
              Carregando histórico de pedidos...
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center space-y-3">
              <Package className="w-10 h-10 text-[#C9BFB2] mx-auto" />
              <p className="text-sm font-semibold text-[#1E1712]">Nenhum pedido registrado ainda</p>
              <p className="text-xs text-[#7A6E65]">
                Seus pedidos realizados pela loja aparecerão aqui com acompanhamento em tempo real.
              </p>
              <button
                type="button"
                onClick={onBackStore}
                className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437]"
              >
                Explorar Perfumes
              </button>
            </div>
          ) : (
            orders.map((order) => {
              const st = order.status || 'pendente';
              const stepIdx = STATUS_INDEX[st] ?? 0;
              const dateStr = order.criadoEm?.toDate
                ? order.criadoEm.toDate().toLocaleDateString('pt-BR')
                : order.data || '—';
              const itensText = Array.isArray(order.itens)
                ? order.itens.map((i) => `${i.qty || 1}× ${i.nome}`).join(', ')
                : order.resumo || '—';
              const rt = (typeof order.rastreio === 'object' ? order.rastreio : {}) as OrderTracking;
              const safeTrackingUrl = safeExternalUrl(rt.url || rt.urlRastreio);
              const trackingCode = rt.codigo || rt.codigoRastreio || '';
              const payMethod = order.pagamento || order.pag || 'pix';
              const parcels = order.parcelas || 1;
              const parcelVal = order.valorParcela || 0;

              return (
                <div
                  key={order.id}
                  className="bg-white border border-[#E6DFD5] rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F2EDE6]">
                    <div>
                      <p className="text-xs text-[#7A6E65]">
                        Pedido #{order.id.slice(0, 8)} · {dateStr}
                      </p>
                      <p className="text-sm font-semibold text-[#1E1712] mt-0.5">
                        {itensText}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-[#9A7437] block">
                        {STATUS_LABEL[st] || st}
                      </span>
                      <span className="text-base font-bold text-[#1E1712] tabular-nums">
                        R$ {formatBRL(order.total || order.subtotal || 0)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#5C5147]">
                    Pagamento: <span className="font-medium capitalize">{payMethod}</span>
                    {parcels > 1 && parcelVal > 0
                      ? ` (${parcels}× de R$ ${formatBRL(parcelVal)})`
                      : ''}
                  </p>

                  {st === 'cancelado' ? (
                    <p className="text-xs text-[#A93226] font-medium">
                      Pedido cancelado. Entre em contato pelo WhatsApp em caso de dúvidas.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                      {TIMELINE_STEPS.map((step, idx) => {
                        const done = idx <= stepIdx;
                        const current = idx === stepIdx;
                        return (
                          <div key={step.key} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                done ? 'bg-[#9A7437]' : 'bg-[#EFEAE2]'
                              }`}
                            />
                            <p
                              className={`text-[11px] truncate ${
                                current
                                  ? 'font-semibold text-[#1E1712]'
                                  : done
                                    ? 'text-[#6B5E53]'
                                    : 'text-[#A89F95]'
                              }`}
                            >
                              {step.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(trackingCode || safeTrackingUrl || rt.tipo) && (
                    <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#E6DFD5] text-xs space-y-1">
                      <p className="font-semibold text-[#1E1712]">Rastreamento de Entrega</p>
                      {rt.tipo && <p className="text-[#5C5147]">Modalidade: {rt.tipo}</p>}
                      {trackingCode && (
                        <p className="text-[#5C5147]">
                          Código: <strong className="text-[#1E1712]">{trackingCode}</strong>
                        </p>
                      )}
                      {rt.previsao && (
                        <p className="text-[#5C5147]">Previsão: {rt.previsao}</p>
                      )}
                      {safeTrackingUrl && (
                        <a
                          href={safeTrackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#9A7437] font-semibold hover:underline pt-1"
                        >
                          Acompanhar entrega <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  <div>
                    <a
                      href={buildWhatsappUrl(
                        settings.wpp,
                        `Olá! Gostaria de informações sobre meu pedido #${order.id.slice(
                          0,
                          8
                        )} (${dateStr}) no valor de R$ ${formatBRL(order.total || 0)}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#1F6E43]/30 text-xs font-semibold text-[#1F6E43] hover:bg-[#1F6E43]/5 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Falar sobre este pedido
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Perfil */}
      {tab === 'perfil' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
            Dados Pessoais
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Nome Completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={wpp}
                onChange={(e) => setWpp(formatPhoneMask(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5C5147] mb-1">E-mail</label>
            <input
              type="email"
              value={user.email || ''}
              readOnly
              className="w-full px-3.5 py-2.5 bg-[#EFEAE2] border border-[#E0D9CF] rounded-lg text-sm text-[#7A6E65] cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-6 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] transition-colors disabled:opacity-60"
          >
            {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </form>
      )}

      {/* Endereço */}
      {tab === 'endereco' && (
        <form
          onSubmit={handleSaveAddress}
          className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
            Endereço de Entrega
          </h2>
          <div className="flex gap-2 items-end max-w-xs">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#5C5147] mb-1">CEP</label>
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                onChange={(e) => {
                  const formatted = formatCepMask(e.target.value);
                  setCep(formatted);
                  if (cleanDigits(formatted).length === 8) {
                    handleCepLookup(formatted);
                  }
                }}
                placeholder="00000-000"
                maxLength={9}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <button
              type="button"
              disabled={lookingUpCep}
              onClick={() => handleCepLookup()}
              className="px-4 py-2.5 bg-[#EFEAE2] text-[#1E1712] text-xs font-semibold rounded-lg hover:bg-[#E6DFD5] inline-flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              {lookingUpCep ? '...' : 'Buscar'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5C5147] mb-1">
              Rua e Número
            </label>
            <input
              type="text"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              maxLength={240}
              className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Complemento
              </label>
              <input
                type="text"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                maxLength={120}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Bairro</label>
              <input
                type="text"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                maxLength={100}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Cidade</label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                maxLength={100}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              >
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingAddress}
            className="px-6 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] transition-colors disabled:opacity-60"
          >
            {savingAddress ? 'Salvando...' : 'Salvar Endereço'}
          </button>
        </form>
      )}

      {/* Favoritos */}
      {tab === 'favoritos' && (
        <div>
          {favoriteProducts.length === 0 ? (
            <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center space-y-3">
              <Heart className="w-10 h-10 text-[#C9BFB2] mx-auto" />
              <p className="text-sm font-semibold text-[#1E1712]">Nenhum favorito salvo</p>
              <p className="text-xs text-[#7A6E65]">
                Toque no ícone de coração nos perfumes para salvar suas fragrâncias preferidas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {favoriteProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={cartIds.includes(product.id)}
                  inWishlist={true}
                  showPix={settings.mostraPix !== false}
                  onOpen={onOpenProduct}
                  onAddCart={onAddCart}
                  onToggleWish={onToggleWish}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Senha */}
      {tab === 'senha' && (
        <div className="space-y-4">
          <form
            onSubmit={handleChangePassword}
            className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
                Alterar Senha
              </h2>
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="text-xs text-[#7A6E65] hover:text-[#1E1712] inline-flex items-center gap-1"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPasswords ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Senha Atual
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Nova Senha (mín. 6 caracteres)
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={senhaConf}
                  onChange={(e) => setSenhaConf(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPass}
              className="px-6 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] transition-colors disabled:opacity-60"
            >
              {savingPass ? 'Atualizando...' : 'Atualizar Senha'}
            </button>
          </form>

          <div className="bg-white border border-[#E6DFD5] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1E1712]">
                Redefinição por e-mail
              </h3>
              <p className="text-xs text-[#7A6E65] mt-0.5">
                Receba um link seguro em {user.email} para redefinir sua senha.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetEmail}
              className="px-4 py-2 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437]"
            >
              Enviar Link
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
