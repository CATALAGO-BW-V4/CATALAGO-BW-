import React from 'react';
import { Heart, Check, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Product } from '../types';
import {
  extractCategoriaLabel,
  extractEstoque,
  extractImg,
  extractMarca,
  extractNome,
  extractPreco,
  extractPrecoOld,
  extractPrecoPix,
  extractVol,
  formatBRL,
} from '../lib/format';
import { SmartImage } from './SmartImage';

interface ProductCardProps {
  product: Product;
  inCart: boolean;
  inWishlist: boolean;
  showPix?: boolean;
  isAdmin?: boolean;
  onOpen: (id: string) => void;
  onAddCart: (id: string) => void;
  onToggleWish: (id: string) => void;
  onAdminEdit?: (id: string) => void;
  onAdminDelete?: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  inCart,
  inWishlist,
  showPix = true,
  isAdmin = false,
  onOpen,
  onAddCart,
  onToggleWish,
  onAdminEdit,
  onAdminDelete,
}) => {
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

  const discountPct =
    precoOld > preco ? Math.round((1 - preco / precoOld) * 100) : 0;

  const statusTag = outOfStock
    ? 'Esgotado'
    : discountPct > 0
      ? `-${discountPct}%`
      : estoque > 0 && estoque <= 3
        ? `Restam ${estoque}`
        : null;

  const metaParts = [marca || categoria, vol].filter(Boolean);

  return (
    <article
      onClick={() => onOpen(product.id)}
      className="group bg-white border border-[#E6DFD5] rounded-xl overflow-hidden cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 flex flex-col"
    >
      {/* Image stage (65-75% visual focus) */}
      <div className="relative w-full aspect-square shrink-0 bg-white border-b border-[#F2EDE6] overflow-hidden">
        <SmartImage
          src={img}
          alt={nome}
          fallbackLabel={nome}
          fit="contain"
          className="p-4 sm:p-5 transition-transform duration-300 group-hover:scale-[1.03]"
          containerClassName="w-full h-full bg-white"
        />

        {statusTag && (
          <span
            className={`absolute top-2.5 left-2.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/95 border border-[#E6DFD5] ${
              outOfStock
                ? 'text-[#A93226]'
                : discountPct > 0
                  ? 'text-[#9A7437]'
                  : 'text-[#8C5A1E]'
            }`}
          >
            {statusTag}
          </span>
        )}

        <button
          type="button"
          aria-label={inWishlist ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWish(product.id);
          }}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
            inWishlist
              ? 'bg-[#1E1712] text-white border-[#1E1712]'
              : 'bg-white/90 text-[#6B5E53] border-[#E6DFD5] hover:text-[#1E1712]'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${inWishlist ? 'fill-current' : ''}`} />
        </button>

        {isAdmin && (onAdminEdit || onAdminDelete) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            {onAdminEdit && (
              <button
                type="button"
                aria-label="Editar produto"
                onClick={() => onAdminEdit(product.id)}
                className="w-8 h-8 rounded-lg bg-white/95 border border-[#E6DFD5] text-[#1E1712] hover:border-[#9A7437] flex items-center justify-center"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onAdminDelete && (
              <button
                type="button"
                aria-label="Excluir produto"
                onClick={() => onAdminDelete(product.id)}
                className="w-8 h-8 rounded-lg bg-white/95 border border-[#E6DFD5] text-[#A93226] hover:bg-[#A93226] hover:text-white flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product body — uniform field order */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A6E65] truncate mb-1">
            {metaParts.join(' · ') || 'Importado'}
          </p>
          <h3 className="text-sm sm:text-base font-semibold text-[#1E1712] leading-snug line-clamp-2 min-h-[2.4rem]">
            {nome}
          </h3>
        </div>

        <div className="flex items-end justify-between gap-2 pt-2 border-t border-[#F2EDE6]">
          <div className="min-w-0">
            {precoOld > preco && (
              <p className="text-[11px] text-[#9A8E82] line-through tabular-nums">
                R$ {formatBRL(precoOld)}
              </p>
            )}
            <p className="text-base sm:text-lg font-bold text-[#1E1712] tabular-nums leading-tight">
              R$ {formatBRL(preco)}
            </p>
            {showPix && precoPix < preco && (
              <p className="text-[11px] font-medium text-[#1F6E43] tabular-nums mt-0.5">
                R$ {formatBRL(precoPix)} no PIX
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={outOfStock}
            onClick={(e) => {
              e.stopPropagation();
              onAddCart(product.id);
            }}
            className={`shrink-0 min-h-[40px] px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              outOfStock
                ? 'bg-[#EFEAE2] text-[#9A8E82] cursor-not-allowed'
                : inCart
                  ? 'bg-[#1F6E43] text-white'
                  : 'bg-[#1E1712] text-white hover:bg-[#9A7437]'
            }`}
          >
            {outOfStock ? (
              'Esgotado'
            ) : inCart ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Na sacola
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
};
