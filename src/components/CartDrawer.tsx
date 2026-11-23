import React from 'react';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import type { CartItem, Product, StoreSettings } from '../types';
import {
  extractEstoque,
  extractImg,
  extractMarca,
  extractNome,
  extractPreco,
  extractPrecoPix,
  formatBRL,
  matchesCategory,
} from '../lib/format';
import { SmartImage } from './SmartImage';

interface CartDrawerProps {
  open: boolean;
  cart: CartItem[];
  products: Product[];
  settings: StoreSettings;
  onClose: () => void;
  onChangeQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onOpenProduct: (id: string) => void;
  onProceedCheckout: () => void;
  onExploreCatalog: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  cart,
  products,
  settings,
  onClose,
  onChangeQty,
  onRemove,
  onOpenProduct,
  onProceedCheckout,
  onExploreCatalog,
}) => {
  if (!open) return null;

  const resolvedItems = cart
    .map((ci) => {
      const product = products.find((p) => p.id === ci.id);
      return product ? { ci, product } : null;
    })
    .filter((x): x is { ci: CartItem; product: Product } => x !== null);

  const subtotalCartao = resolvedItems.reduce(
    (sum, { ci, product }) => sum + extractPreco(product) * ci.qty,
    0
  );
  const subtotalPix = resolvedItems.reduce(
    (sum, { ci, product }) => sum + extractPrecoPix(product) * ci.qty,
    0
  );

  const cartCats = resolvedItems
    .map(({ product }) => product.cat || product.categoria || '')
    .filter(Boolean);

  const suggestions = products
    .filter(
      (p) =>
        p.ativo !== false &&
        extractEstoque(p) > 0 &&
        !cart.some((c) => c.id === p.id) &&
        (cartCats.length === 0 || cartCats.some((c) => matchesCategory(p, c)))
    )
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#1E1712]/45 backdrop-blur-xs"
        onClick={onClose}
      />

      <aside className="relative z-10 w-full max-w-md bg-white h-full flex flex-col border-l border-[#E6DFD5]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DFD5]">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#9A7437]" />
            <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
              Sua Sacola
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar sacola"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#5C5147] hover:bg-[#F2EDE6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#FAF8F5] p-4 space-y-3">
          {resolvedItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <ShoppingBag className="w-10 h-10 text-[#C9BFB2] mb-3" />
              <p className="text-base font-semibold text-[#1E1712] mb-1">
                Sua sacola está vazia
              </p>
              <p className="text-xs text-[#7A6E65] mb-5">
                Explore nossa seleção de fragrâncias importadas originais.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExploreCatalog();
                }}
                className="px-5 py-2.5 bg-[#1E1712] text-white text-xs font-semibold rounded-lg hover:bg-[#9A7437] transition-colors"
              >
                Explorar Catálogo
              </button>
            </div>
          ) : (
            resolvedItems.map(({ ci, product }) => {
              const nome = extractNome(product);
              const marca = extractMarca(product);
              const preco = extractPreco(product);
              const maxStock = extractEstoque(product);
              const atMax = maxStock > 0 && ci.qty >= maxStock;

              return (
                <div
                  key={product.id}
                  className="bg-white border border-[#E6DFD5] rounded-xl p-3 flex gap-3 items-center"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenProduct(product.id);
                    }}
                    className="relative w-16 h-16 rounded-lg bg-white border border-[#EFEAE2] shrink-0 overflow-hidden"
                  >
                    <SmartImage
                      src={extractImg(product)}
                      alt={nome}
                      fit="contain"
                      className="p-1.5"
                      containerClassName="w-full h-full bg-white"
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-[#8A7D6A] truncate">
                      {marca || 'Importado'}
                    </p>
                    <p className="text-sm font-semibold text-[#1E1712] truncate">
                      {nome}
                    </p>
                    <p className="text-xs font-bold text-[#9A7437] tabular-nums mt-0.5">
                      R$ {formatBRL(preco * ci.qty)}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => onChangeQty(product.id, -1)}
                        className="w-7 h-7 rounded-md border border-[#E0D9CF] flex items-center justify-center text-[#4A3F30] hover:bg-[#F2EDE6]"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-semibold tabular-nums min-w-[20px] text-center">
                        {ci.qty}
                      </span>
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        disabled={atMax}
                        onClick={() => onChangeQty(product.id, 1)}
                        className="w-7 h-7 rounded-md border border-[#E0D9CF] flex items-center justify-center text-[#4A3F30] hover:bg-[#F2EDE6] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      {atMax && (
                        <span className="text-[10px] text-[#9A7437]">Máx. estoque</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Remover item"
                    onClick={() => onRemove(product.id)}
                    className="p-2 text-[#9A8E82] hover:text-[#A93226] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {resolvedItems.length > 0 && suggestions.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E6DFD5] bg-white">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A6E65] font-semibold mb-2">
              Combine com
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProduct(p.id);
                  }}
                  className="w-24 shrink-0 text-left bg-[#FAF8F5] border border-[#EFEAE2] rounded-lg p-2 hover:border-[#9A7437] transition-colors"
                >
                  <SmartImage
                    src={extractImg(p)}
                    alt={extractNome(p)}
                    fit="contain"
                    className="p-1"
                    containerClassName="w-full h-12 rounded mb-1.5 bg-white border border-[#EFEAE2]"
                  />
                  <p className="text-[11px] font-medium text-[#1E1712] truncate">
                    {extractNome(p)}
                  </p>
                  <p className="text-[11px] font-semibold text-[#9A7437] tabular-nums">
                    R$ {formatBRL(extractPreco(p))}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {resolvedItems.length > 0 && (
          <div className="p-5 border-t border-[#E6DFD5] bg-white space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[#5C5147]">
                <span>Total (Cartão)</span>
                <span className="font-semibold text-[#1E1712] tabular-nums">
                  R$ {formatBRL(subtotalCartao)}
                </span>
              </div>
              {settings.mostraPix !== false && subtotalPix < subtotalCartao && (
                <div className="flex justify-between text-xs text-[#1F6E43]">
                  <span>Total com desconto no PIX</span>
                  <span className="font-bold tabular-nums">
                    R$ {formatBRL(subtotalPix)}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onProceedCheckout}
              className="w-full min-h-[46px] py-3 px-4 bg-[#1E1712] text-white text-sm font-semibold rounded-lg hover:bg-[#9A7437] transition-colors flex items-center justify-center gap-2"
            >
              Continuar para Finalização
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
