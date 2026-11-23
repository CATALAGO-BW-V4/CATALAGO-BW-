import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { CartItem, Product, StoreSettings } from '../types';
import {
  buildWhatsappUrl,
  cleanDigits,
  extractNome,
  extractPreco,
  extractPrecoPix,
  formatBRL,
  formatCepMask,
  formatPhoneMask,
} from '../lib/format';

interface CheckoutModalProps {
  open: boolean;
  cart: CartItem[];
  products: Product[];
  settings: StoreSettings;
  user: FirebaseUser | null;
  onClose: () => void;
  onBackToCart: () => void;
  onOrderSuccess: () => void;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

const UF_LIST = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  open,
  cart,
  products,
  settings,
  user,
  onClose,
  onBackToCart,
  onOrderSuccess,
  onToast,
}) => {
  const [nome, setNome] = useState('');
  const [wpp, setWpp] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [complemento, setComplemento] = useState('');
  const [obs, setObs] = useState('');
  const [pagamento, setPagamento] = useState<'pix' | 'cartao'>('pix');
  const [parcelas, setParcelas] = useState<number>(1);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    id: string;
    whatsappUrl: string;
    total: number;
    pagLabel: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmedOrder(null);
      return;
    }
    setParcelas(1);

    if (!user) {
      setHasSavedProfile(false);
      return;
    }

    const loadSaved = async () => {
      try {
        const snap = await getDoc(doc(db, 'clients', user.uid));
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.nome) {
          setNome(d.nome);
          setHasSavedProfile(true);
        }
        if (d.wpp) setWpp(formatPhoneMask(String(d.wpp)));
        if (d.cep) setCep(formatCepMask(String(d.cep)));
        if (d.endereco) setEndereco(d.endereco);
        if (d.cidade) setCidade(d.cidade);
        if (d.estado) setEstado(d.estado);
        if (d.complemento) setComplemento(d.complemento);
      } catch {
        // optional profile prefill
      }
    };
    loadSaved();
  }, [open, user]);

  if (!open) return null;

  const resolvedItems = cart
    .map((ci) => {
      const p = products.find((x) => x.id === ci.id);
      return p ? { ci, p } : null;
    })
    .filter((x): x is { ci: CartItem; p: Product } => x !== null);

  const totalPix = resolvedItems.reduce(
    (sum, { ci, p }) => sum + extractPrecoPix(p) * ci.qty,
    0
  );
  const totalCartao = resolvedItems.reduce(
    (sum, { ci, p }) => sum + extractPreco(p) * ci.qty,
    0
  );
  const maxParcelas = Math.min(6, Math.max(1, Number(settings.parcelas) || 3));
  const activeTotal = pagamento === 'pix' ? totalPix : totalCartao;

  const handleCepChange = async (rawValue: string) => {
    const formatted = formatCepMask(rawValue);
    setCep(formatted);
    const digits = cleanDigits(formatted);
    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setEndereco(data.logradouro);
          if (data.localidade) setCidade(data.localidade);
          if (data.uf) setEstado(data.uf);
        }
      } catch {
        // ignore ViaCEP offline
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nome.trim();
    const cleanPhone = cleanDigits(wpp);

    if (!cleanName || cleanPhone.length < 10) {
      onToast('Informe seu nome completo e um WhatsApp válido com DDD.', 'er');
      return;
    }
    if (resolvedItems.length === 0) {
      onToast('Sua sacola está vazia.', 'er');
      return;
    }

    setSubmitting(true);
    try {
      const chosenParcelas = pagamento === 'cartao' ? parcelas : 1;
      const valorParcela =
        pagamento === 'cartao' && chosenParcelas > 1
          ? totalCartao / chosenParcelas
          : 0;

      const pagInfo =
        pagamento === 'cartao'
          ? chosenParcelas > 1
            ? `Cartão — ${chosenParcelas}× de R$ ${formatBRL(valorParcela)}`
            : 'Cartão — À vista'
          : 'PIX / Dinheiro';

      const itensPedido = resolvedItems.map(({ ci, p }) => ({
        id: p.id,
        nome: extractNome(p) || 'Produto',
        qty: ci.qty,
        preco: pagamento === 'pix' ? extractPrecoPix(p) : extractPreco(p),
      }));

      let msg = '';
      if (settings.msgPedido) {
        const itensTxt = itensPedido
          .map((i) => `• ${i.nome} × ${i.qty} = R$ ${formatBRL(i.preco * i.qty)}`)
          .join('\n');
        msg = settings.msgPedido
          .replace('{nome}', cleanName)
          .replace('{wpp}', wpp)
          .replace('{total}', `R$ ${formatBRL(activeTotal)}`)
          .replace('{pagamento}', pagInfo)
          .replace('{itens}', itensTxt)
          .replace('{endereco}', endereco || 'A combinar');
      } else {
        msg = `*NOVO PEDIDO — ${settings.nome || 'BW Parfum'}*\n\n`;
        msg += `Cliente: ${cleanName}\nWhatsApp: ${wpp}\n`;
        if (endereco) {
          msg += `Endereço: ${endereco}${cidade ? `, ${cidade}` : ''}${estado ? ` - ${estado}` : ''}\n`;
        }
        if (cep) msg += `CEP: ${cep}\n`;
        if (complemento) msg += `Complemento: ${complemento}\n`;
        msg += `\n*Itens do Pedido:*\n`;
        itensPedido.forEach((item) => {
          msg += `• ${item.nome} × ${item.qty} = R$ ${formatBRL(item.preco * item.qty)}\n`;
        });
        msg += `\nPagamento: ${pagInfo}\n`;
        msg += `Total: *R$ ${formatBRL(activeTotal)}*\n`;
        if (obs.trim()) msg += `\nObservações: ${obs.trim()}`;
      }

      const whatsappUrl = buildWhatsappUrl(settings.wpp, msg);

      const basePayload = {
        nome: cleanName.slice(0, 120),
        wpp: wpp.trim().slice(0, 25),
        endereco: endereco.trim().slice(0, 240),
        cidade: cidade.trim().slice(0, 100),
        estado: estado.trim().slice(0, 4),
        cep: cep.trim().slice(0, 12),
        complemento: complemento.trim().slice(0, 120),
        pagamento,
        parcelas: chosenParcelas,
        valorParcela,
        total: Number(activeTotal.toFixed(2)),
        subtotal: Number(activeTotal.toFixed(2)),
        desconto: 0,
        frete: 0,
        obs: obs.trim().slice(0, 500),
        observacoes: obs.trim().slice(0, 500),
        itens: itensPedido,
        resumo: itensPedido.map((i) => `${i.qty}x ${i.nome}`).join(', ').slice(0, 1000),
        status: 'pendente' as const,
        uid: user?.uid ?? null,
        rastreio: { tipo: '', transportadora: '', codigo: '', url: '', previsao: '' },
        historicoStatus: [
          {
            status: 'pendente',
            msg: 'Pedido recebido via loja',
            criadoEm: new Date().toISOString(),
            porUid: 'cliente',
          },
        ],
        criadoEm: serverTimestamp(),
        updAt: serverTimestamp(),
        entregueEm: null,
      };

      let savedOrderId = 'WPP-' + Date.now().toString().slice(-6);
      try {
        const ref = await addDoc(collection(db, 'pedidos'), basePayload);
        savedOrderId = ref.id;

        if (user) {
          await setDoc(doc(db, 'clients', user.uid, 'pedidos', savedOrderId), {
            ...basePayload,
            pedidoGlobalId: savedOrderId,
          }).catch(() => {});

          await updateDoc(doc(db, 'clients', user.uid), {
            nome: cleanName.slice(0, 120),
            wpp: cleanPhone.slice(0, 20),
            endereco: endereco.trim().slice(0, 240),
            cidade: cidade.trim().slice(0, 100),
            estado: estado.trim().slice(0, 4),
            cep: cleanDigits(cep).slice(0, 12),
            complemento: complemento.trim().slice(0, 120),
            updAt: serverTimestamp(),
          }).catch(() => {});
        }

        await addDoc(collection(db, 'analytics_events'), {
          type: 'pedido_wpp',
          prodId: null,
          uid: user?.uid ?? null,
          ts: serverTimestamp(),
        }).catch(() => {});
      } catch (err) {
        console.warn('Pedido salvo localmente/WhatsApp:', err);
      }

      onOrderSuccess();
      setConfirmedOrder({
        id: savedOrderId,
        whatsappUrl,
        total: activeTotal,
        pagLabel: pagInfo,
      });

      const win = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        onToast('Pedido registrado! Clique no botão abaixo para abrir o WhatsApp.', 'ts');
      } else {
        onToast('Pedido registrado e enviado ao WhatsApp.', 'ok');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1E1712]/55 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E6DFD5] w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl max-h-[94vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DFD5] bg-[#FAF8F5]">
          <h3 className="font-display text-2xl font-semibold text-[#1E1712]">
            {confirmedOrder ? 'Pedido Registrado' : 'Finalizar Pedido'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#5C5147] hover:bg-[#EFEAE2]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          {confirmedOrder ? (
            <div className="text-center py-4 space-y-5">
              <CheckCircle2 className="w-12 h-12 text-[#1F6E43] mx-auto" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#7A6E65] mb-1">
                  Código do Pedido · <span className="tabular-nums font-semibold">{confirmedOrder.id.slice(0, 10)}</span>
                </p>
                <h4 className="font-display text-2xl font-semibold text-[#1E1712] mb-2">
                  Tudo pronto para atendimento
                </h4>
                <p className="text-sm text-[#5C5147] max-w-md mx-auto leading-relaxed">
                  Seu pedido no valor de{' '}
                  <strong className="tabular-nums text-[#1E1712]">
                    R$ {formatBRL(confirmedOrder.total)}
                  </strong>{' '}
                  ({confirmedOrder.pagLabel}) foi salvo. Conclua o envio da mensagem no WhatsApp da loja.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 max-w-xs mx-auto">
                <a
                  href={confirmedOrder.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-lg bg-[#1F6E43] text-white text-sm font-semibold hover:bg-[#185735] transition-colors inline-flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp da Loja
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#5C5147] hover:bg-[#FAF8F5]"
                >
                  Continuar Navegando
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Order Summary */}
              <div className="bg-[#FAF8F5] border border-[#E6DFD5] rounded-xl p-4 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A6E65] font-semibold">
                  Resumo da Sacola
                </p>
                {resolvedItems.map(({ ci, p }) => (
                  <div
                    key={p.id}
                    className="flex justify-between text-xs text-[#4A3F30] py-1 border-b border-[#EFEAE2] last:border-b-0"
                  >
                    <span className="truncate pr-3">
                      {extractNome(p)} × {ci.qty}
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">
                      R$ {formatBRL((pagamento === 'pix' ? extractPrecoPix(p) : extractPreco(p)) * ci.qty)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-[#E0D9CF] text-sm font-bold text-[#1E1712]">
                  <span>Total</span>
                  <span className="tabular-nums text-[#9A7437]">R$ {formatBRL(activeTotal)}</span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs uppercase tracking-[0.12em] text-[#9A7437] font-semibold">
                    Seus Dados
                  </h4>
                  {hasSavedProfile && (
                    <span className="text-[11px] text-[#1F6E43] font-medium">
                      Dados carregados da conta
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome"
                      maxLength={120}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      value={wpp}
                      onChange={(e) => setWpp(formatPhoneMask(e.target.value))}
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-[0.12em] text-[#9A7437] font-semibold">
                  Endereço para Entrega
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      CEP
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      Rua e Número
                    </label>
                    <input
                      type="text"
                      value={endereco}
                      onChange={(e) => setEndereco(e.target.value)}
                      placeholder="Ex: Av. Paulista, 1000"
                      maxLength={240}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      maxLength={100}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      UF
                    </label>
                    <select
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    >
                      <option value="">UF</option>
                      {UF_LIST.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Apto, bloco..."
                      maxLength={120}
                      className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Payment + Integrated Installment Selector */}
              <div className="space-y-2.5">
                <h4 className="text-xs uppercase tracking-[0.12em] text-[#9A7437] font-semibold">
                  Forma de Pagamento
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPagamento('pix')}
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      pagamento === 'pix'
                        ? 'border-[#1F6E43] bg-[#1F6E43]/5'
                        : 'border-[#E0D9CF] bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1E1712]">PIX / Dinheiro</span>
                      <span className="text-sm font-bold text-[#1F6E43] tabular-nums">
                        R$ {formatBRL(totalPix)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B5E53] mt-0.5">Aprovação imediata</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPagamento('cartao')}
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      pagamento === 'cartao'
                        ? 'border-[#9A7437] bg-[#9A7437]/5'
                        : 'border-[#E0D9CF] bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1E1712]">Cartão</span>
                      <span className="text-sm font-bold text-[#1E1712] tabular-nums">
                        R$ {formatBRL(totalCartao)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B5E53] mt-0.5">
                      Até {maxParcelas}x sem juros
                    </p>
                  </button>
                </div>

                {pagamento === 'cartao' && (
                  <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E6DFD5] space-y-2">
                    <label className="block text-[11px] font-semibold text-[#5C5147]">
                      Escolha o parcelamento no cartão
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setParcelas(n)}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold tabular-nums transition-colors ${
                            parcelas === n
                              ? 'bg-[#1E1712] text-white border-[#1E1712]'
                              : 'bg-white text-[#4A3F30] border-[#E0D9CF] hover:border-[#9A7437]'
                          }`}
                        >
                          {n === 1 ? 'À vista' : `${n}× de R$ ${formatBRL(totalCartao / n)}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5C5147] mb-1">
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  maxLength={500}
                  placeholder="Ex: embrulhar para presente..."
                  className="w-full px-3.5 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] resize-none focus:border-[#9A7437] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-[#5C5147] bg-[#FAF8F5] p-3 rounded-lg border border-[#EFEAE2]">
                <ShieldCheck className="w-4 h-4 text-[#9A7437] shrink-0" />
                <span>
                  Nenhum dado de cartão é solicitado aqui. O pagamento é combinado com segurança direto no WhatsApp oficial da loja.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onBackToCart}
                  className="py-3 px-4 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147] hover:bg-[#FAF8F5] inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar à Sacola
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[46px] py-3 px-5 rounded-lg bg-[#1F6E43] text-white text-sm font-semibold hover:bg-[#185735] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <MessageCircle className="w-4 h-4" />
                  {submitting ? 'Registrando pedido...' : 'Confirmar e Enviar via WhatsApp'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
