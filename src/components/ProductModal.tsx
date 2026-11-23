import React, { useEffect, useState } from 'react';
import {
  X,
  Share2,
  MessageCircle,
  ShieldCheck,
  Truck,
  RotateCcw,
  Star,
  Heart,
  Check,
} from 'lucide-react';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Product, Review, StoreSettings } from '../types';
import {
  buildWhatsappUrl,
  extractCategoriaLabel,
  extractDesc,
  extractEstoque,
  extractImg,
  extractMarca,
  extractNome,
  extractPreco,
  extractPrecoOld,
  extractPrecoPix,
  extractVol,
  formatBRL,
  parseOlfactoryNotes,
} from '../lib/format';
import { SmartImage } from './SmartImage';

interface ProductModalProps {
  product: Product | null;
  inCart: boolean;
  inWishlist: boolean;
  settings: StoreSettings;
  user: FirebaseUser | null;
  onClose: () => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  inCart,
  inWishlist,
  settings,
  user,
  onClose,
  onAddCart,
  onToggleWish,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'desc' | 'revs'>('info');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingRevs, setLoadingRevs] = useState(false);
  const [revNota, setRevNota] = useState(5);
  const [revAutor, setRevAutor] = useState('');
  const [revTexto, setRevTexto] = useState('');
  const [sendingRev, setSendingRev] = useState(false);

  useEffect(() => {
    if (!product) return;
    setActiveTab('info');
    setRevNota(5);
    setRevAutor(user?.displayName || '');
    setRevTexto('');

    let active = true;
    const loadRevs = async () => {
      setLoadingRevs(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'reviews'),
            where('prodId', '==', product.id),
            where('status', '==', 'approved')
          )
        );
        if (!active) return;
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Review)
          .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
        setReviews(list);
      } catch (err) {
        console.warn('Erro ao carregar avaliações:', err);
        if (active) setReviews([]);
      } finally {
        if (active) setLoadingRevs(false);
      }
    };
    loadRevs();
    return () => {
      active = false;
    };
  }, [product, user]);

  if (!product) return null;

  const nome = extractNome(product) || 'Perfume Importado';
  const marca = extractMarca(product);
  const vol = extractVol(product);
  const categoria = extractCategoriaLabel(product);
  const preco = extractPreco(product);
  const precoPix = extractPrecoPix(product);
  const precoOld = extractPrecoOld(product);
  const estoque = extractEstoque(product);
  const outOfStock = estoque === 0;
  const img = extractImg(product);
  const desc = extractDesc(product);
  const notes = parseOlfactoryNotes(product.notas);
  const maxParcelas = Math.max(1, Number(settings.parcelas) || 3);

  const shareUrl = `${window.location.origin}${window.location.pathname}?prod=${encodeURIComponent(
    product.id
  )}`;

  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: nome, text: `${nome} — BW Parfum Imports`, url: shareUrl });
        return;
      } catch {
        // user cancelled or unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast('Link copiado para a área de transferência.', 'ok');
    } catch {
      onToast('Não foi possível copiar o link.', 'er');
    }
  };

  const handleShareWhatsapp = () => {
    const msg = `Olá! Gostaria de saber mais sobre este perfume:\n*${nome}* (${marca || 'Importado'}) — R$ ${formatBRL(
      preco
    )}\n${shareUrl}`;
    window.open(buildWhatsappUrl(settings.wpp, msg), '_blank', 'noopener,noreferrer');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = revTexto.trim();
    const autor = (revAutor.trim() || 'Cliente').slice(0, 80);
    if (texto.length < 2) {
      onToast('Escreva sua avaliação com pelo menos 2 caracteres.', 'er');
      return;
    }

    setSendingRev(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        prodId: product.id,
        prodNome: nome.slice(0, 160),
        autor,
        nota: revNota,
        texto: texto.slice(0, 1000),
        status: 'pending',
        uid: user?.uid ?? null,
        criadoEm: serverTimestamp(),
      });
      setRevTexto('');
      setRevNota(5);
      onToast('Avaliação enviada para moderação.', 'ok');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'reviews');
      } catch {
        onToast('Não foi possível enviar sua avaliação agora.', 'er');
      }
    } finally {
      setSendingRev(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1E1712]/55 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E6DFD5] w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E6DFD5] bg-[#FAF8F5]">
          <p className="text-xs uppercase tracking-[0.15em] text-[#7A6E65] truncate">
            {[categoria, marca, vol].filter(Boolean).join(' · ') || 'Detalhes da Fragrância'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#5C5147] hover:bg-[#EFEAE2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start">
            {/* Gallery Left */}
            <div className="relative w-full bg-white rounded-xl aspect-square overflow-hidden border border-[#E6DFD5]">
              <SmartImage
                src={img}
                alt={nome}
                fallbackLabel={nome}
                fit="contain"
                priority
                className="p-6"
                containerClassName="w-full h-full bg-white"
              />
            </div>

            {/* Contiguous Purchase Module Right */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9A7437]">
                  {marca || 'BW Seleção'}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    outOfStock
                      ? 'text-[#A93226]'
                      : estoque <= 3
                        ? 'text-[#9A7437]'
                        : 'text-[#1F6E43]'
                  }`}
                >
                  {outOfStock
                    ? 'Indisponível'
                    : estoque <= 3
                      ? `Últimas ${estoque} unidades`
                      : `${estoque} disponíveis`}
                </span>
              </div>

              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#1E1712] leading-tight text-balance mb-4">
                {nome}
              </h2>

              <div className="pb-4 mb-4 border-b border-[#EFEAE2]">
                {precoOld > preco && (
                  <p className="text-sm text-[#9A8E82] line-through tabular-nums">
                    De R$ {formatBRL(precoOld)}
                  </p>
                )}
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl font-bold text-[#1E1712] tabular-nums">
                    R$ {formatBRL(preco)}
                  </span>
                  {settings.mostraPix !== false && precoPix < preco && (
                    <span className="text-sm font-semibold text-[#1F6E43] tabular-nums">
                      R$ {formatBRL(precoPix)} no PIX
                    </span>
                  )}
                </div>
                {preco > 0 && (
                  <p className="text-xs text-[#6B5E53] mt-1 tabular-nums">
                    Em até {maxParcelas}x de R$ {formatBRL(preco / maxParcelas)} sem juros no cartão
                  </p>
                )}
              </div>

              {/* Trust & Provenance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5 text-xs text-[#5C5147]">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                  <ShieldCheck className="w-4 h-4 text-[#9A7437] shrink-0" />
                  <span>100% Original</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                  <Truck className="w-4 h-4 text-[#9A7437] shrink-0" />
                  <span>Envio Nacional</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                  <RotateCcw className="w-4 h-4 text-[#9A7437] shrink-0" />
                  <span>Garantia 7 dias</span>
                </div>
              </div>

              {/* Primary CTA Row */}
              <div className="flex items-center gap-2.5 mb-4">
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    onAddCart(product.id);
                    onClose();
                  }}
                  className={`flex-1 min-h-[46px] px-5 py-3 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                    outOfStock
                      ? 'bg-[#EFEAE2] text-[#9A8E82] cursor-not-allowed'
                      : inCart
                        ? 'bg-[#1F6E43] text-white'
                        : 'bg-[#1E1712] text-white hover:bg-[#9A7437]'
                  }`}
                >
                  {outOfStock ? (
                    'Produto Esgotado'
                  ) : inCart ? (
                    <>
                      <Check className="w-4 h-4" />
                      Adicionar Mais
                    </>
                  ) : (
                    'Adicionar à Sacola'
                  )}
                </button>

                <button
                  type="button"
                  aria-label="Favoritar"
                  onClick={() => onToggleWish(product.id)}
                  className={`w-12 h-[46px] rounded-lg border flex items-center justify-center transition-colors ${
                    inWishlist
                      ? 'bg-[#1E1712] text-white border-[#1E1712]'
                      : 'border-[#E0D9CF] text-[#5C5147] hover:border-[#9A7437]'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={handleShareWhatsapp}
                  className="flex-1 py-2.5 px-3 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#1F6E43] hover:bg-[#FAF8F5] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Tirar dúvida no WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="py-2.5 px-3.5 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#5C5147] hover:bg-[#FAF8F5] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Compartilhar
                </button>
              </div>

              {/* Detail Tabs */}
              <div className="border-b border-[#E6DFD5] flex gap-5 mb-4">
                {[
                  { id: 'info' as const, label: 'Notas & Ficha' },
                  { id: 'desc' as const, label: 'Descrição' },
                  { id: 'revs' as const, label: `Avaliações (${reviews.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-[#9A7437] text-[#1E1712]'
                        : 'border-transparent text-[#8A7D6A] hover:text-[#1E1712]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'info' && (
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    {marca && (
                      <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                        <dt className="text-[#8A7D6A] uppercase tracking-wider text-[10px] mb-0.5">
                          Casa / Marca
                        </dt>
                        <dd className="font-semibold text-[#1E1712]">{marca}</dd>
                      </div>
                    )}
                    {vol && (
                      <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                        <dt className="text-[#8A7D6A] uppercase tracking-wider text-[10px] mb-0.5">
                          Volumetria
                        </dt>
                        <dd className="font-semibold text-[#1E1712]">{vol}</dd>
                      </div>
                    )}
                    {categoria && (
                      <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                        <dt className="text-[#8A7D6A] uppercase tracking-wider text-[10px] mb-0.5">
                          Família / Gênero
                        </dt>
                        <dd className="font-semibold text-[#1E1712]">{categoria}</dd>
                      </div>
                    )}
                    <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                      <dt className="text-[#8A7D6A] uppercase tracking-wider text-[10px] mb-0.5">
                        Procedência
                      </dt>
                      <dd className="font-semibold text-[#1E1712]">Importado Original</dd>
                    </div>
                  </dl>

                  {notes.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]">
                      <p className="text-[10px] uppercase tracking-wider text-[#8A7D6A] mb-1.5">
                        Acordes & Notas Olfativas
                      </p>
                      <p className="text-xs text-[#4A3F30] leading-relaxed">
                        {notes.join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'desc' && (
                <p className="text-sm text-[#5C5147] leading-relaxed whitespace-pre-line">
                  {desc ||
                    'Fragrância importada original selecionada pela curadoria BW Parfum Imports, com fixação prolongada e apresentação lacrada.'}
                </p>
              )}

              {activeTab === 'revs' && (
                <div className="space-y-4">
                  {loadingRevs ? (
                    <p className="text-xs text-[#7A6E65]">Carregando avaliações...</p>
                  ) : reviews.length === 0 ? (
                    <p className="text-xs text-[#7A6E65] py-2">
                      Nenhuma avaliação publicada ainda. Seja o primeiro a avaliar.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                      {reviews.map((r) => (
                        <div
                          key={r.id}
                          className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#EFEAE2]"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-semibold text-[#1E1712]">
                              {r.autor || r.nome || 'Cliente'}
                            </span>
                            <span className="text-xs text-[#9A7437]">
                              {'★'.repeat(Math.min(5, Math.max(1, r.nota || 5)))}
                            </span>
                          </div>
                          <p className="text-xs text-[#5C5147] leading-relaxed">
                            {r.texto || r.txt}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={handleSubmitReview}
                    className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E6DFD5] space-y-3"
                  >
                    <p className="text-xs font-semibold text-[#1E1712]">Deixar avaliação</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRevNota(star)}
                          aria-label={`${star} estrelas`}
                          className="p-1"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              star <= revNota
                                ? 'text-[#9A7437] fill-[#9A7437]'
                                : 'text-[#D6CBB9]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={revAutor}
                      onChange={(e) => setRevAutor(e.target.value)}
                      placeholder="Seu nome"
                      maxLength={80}
                      className="w-full px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs text-[#1E1712]"
                    />
                    <textarea
                      value={revTexto}
                      onChange={(e) => setRevTexto(e.target.value)}
                      placeholder="Conte sua experiência com a fragrância..."
                      rows={3}
                      maxLength={1000}
                      className="w-full px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs text-[#1E1712] resize-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingRev}
                      className="px-4 py-2 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] transition-colors disabled:opacity-60"
                    >
                      {sendingRev ? 'Enviando...' : 'Enviar Avaliação'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
