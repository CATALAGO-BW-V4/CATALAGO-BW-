import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  ShoppingBag,
  User,
  SlidersHorizontal,
  X,
  Home,
  LayoutGrid,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AppView, Product, StoreSettings } from '../types';
import { BRAND_ASSETS } from '../lib/assets';
import { extractImg, extractMarca, extractNome, extractPreco, formatBRL, normalizeText } from '../lib/format';
import { SmartImage } from './SmartImage';

interface HeaderProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: () => void;
  onOpenProduct: (prodId: string) => void;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  cartCount: number;
  products: Product[];
  settings: StoreSettings;
  user: FirebaseUser | null;
  isAdmin: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onNavigate,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onOpenProduct,
  onOpenCart,
  onOpenAuth,
  cartCount,
  products,
  settings,
  user,
  isAdmin,
}) => {
  const [showTopbar, setShowTopbar] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 60);
    }
  }, [mobileSearchOpen]);

  const qNorm = normalizeText(searchQuery);
  const instantResults = qNorm
    ? products
        .filter(
          (p) =>
            p.ativo !== false &&
            (normalizeText(extractNome(p)).includes(qNorm) ||
              normalizeText(extractMarca(p)).includes(qNorm) ||
              normalizeText(p.notas).includes(qNorm))
        )
        .slice(0, 6)
    : [];

  const handleUserAction = () => {
    if (user) {
      onNavigate(isAdmin ? 'admin' : 'conta');
    } else {
      onOpenAuth();
    }
  };

  const navItems: { id: AppView; label: string }[] = [
    { id: 'home', label: 'Início' },
    { id: 'catalogo', label: 'Catálogo' },
    { id: 'feminino', label: 'Feminino' },
    { id: 'masculino', label: 'Masculino' },
    { id: 'como', label: 'Como Comprar' },
  ];

  const userDisplay = user
    ? user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Conta'
    : 'Entrar';

  return (
    <>
      {showTopbar && (
        <div className="bg-[#1E1712] text-[#F5EFE6] h-8 px-4 flex items-center justify-center relative text-xs tracking-wide">
          <button
            type="button"
            onClick={() => onNavigate('catalogo')}
            className="truncate max-w-[85%] hover:text-[#D4AF6E] transition-colors"
          >
            {settings.topbar || 'Perfumes importados originais · Envio seguro para todo o Brasil'}
          </button>
          <button
            type="button"
            onClick={() => setShowTopbar(false)}
            aria-label="Fechar aviso"
            className="absolute right-3 p-1 text-[#A89F95] hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E6DFD5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-[#9A7437] rounded-md"
          >
            <SmartImage
              src={settings.logo || BRAND_ASSETS.logo}
              fallbackSrc={BRAND_ASSETS.logo}
              alt="BW Parfum"
              fit="cover"
              priority
              containerClassName="w-8 h-8 rounded-full border border-[#E6DFD5] shrink-0"
            />
            <span className="font-display text-xl md:text-2xl font-semibold tracking-wider text-[#1E1712]">
              BW PARFUM
            </span>
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Navegação principal"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#5C5147]"
          >
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'text-[#1E1712] border-[#9A7437] font-semibold'
                      : 'border-transparent hover:text-[#1E1712] hover:border-[#D6CBB9]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search & Primary Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div ref={searchWrapRef} className="relative hidden md:block w-56 xl:w-64">
              <div className="flex items-center bg-white border border-[#E0D9CF] rounded-lg px-3 py-1.5 focus-within:border-[#9A7437] transition-colors">
                <Search className="w-4 h-4 text-[#8A7D6A] shrink-0 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => {
                    onSearchChange(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setDropdownOpen(false);
                      onSubmitSearch();
                    }
                  }}
                  placeholder="Buscar perfume ou marca..."
                  className="w-full bg-transparent text-xs text-[#1E1712] placeholder-[#9A8E82] focus:outline-none"
                  aria-label="Buscar perfumes"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Limpar busca"
                    className="text-[#9A8E82] hover:text-[#1E1712] ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {dropdownOpen && qNorm.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#E6DFD5] rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
                  {instantResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#7A6E65]">
                      Nenhum perfume encontrado para &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    <>
                      {instantResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setDropdownOpen(false);
                            onOpenProduct(p.id);
                          }}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-[#FAF8F5] border-b border-[#F2EDE6] last:border-b-0 transition-colors"
                        >
                          <SmartImage
                            src={extractImg(p)}
                            alt={extractNome(p)}
                            className="p-1"
                            containerClassName="w-10 h-10 rounded-md shrink-0 bg-white border border-[#EFEAE2]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#1E1712] truncate">
                              {extractNome(p)}
                            </p>
                            <p className="text-[11px] text-[#7A6E65] truncate">
                              {extractMarca(p)} · R$ {formatBRL(extractPreco(p))}
                            </p>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownOpen(false);
                          onSubmitSearch();
                        }}
                        className="w-full py-2.5 text-center text-xs font-semibold text-[#9A7437] bg-[#FAF8F5] hover:bg-[#F2EDE6] transition-colors"
                      >
                        Ver todos os resultados no catálogo →
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Buscar"
              className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-[#4A3F30] hover:bg-[#F2EDE6] transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'admin'
                    ? 'bg-[#9A7437] text-white border-[#9A7437]'
                    : 'bg-white text-[#9A7437] border-[#E0D9CF] hover:border-[#9A7437]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Admin
              </button>
            )}

            <button
              type="button"
              onClick={handleUserAction}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#4A3F30] hover:bg-[#F2EDE6] transition-colors whitespace-nowrap shrink-0"
            >
              <User className="w-4 h-4" />
              <span className="max-w-[90px] truncate">{userDisplay}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Sacola com ${cartCount} itens`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#332820] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Sacola</span>
              <span className="tabular-nums bg-[#9A7437] text-white text-[11px] font-bold px-1.5 py-0.5 rounded min-w-[20px] text-center">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search Overlay */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col md:hidden">
          <div className="flex items-center gap-2 p-3 border-b border-[#E6DFD5] bg-white">
            <div className="flex-1 flex items-center bg-[#F2EDE6] rounded-lg px-3 py-2.5">
              <Search className="w-4 h-4 text-[#7A6E65] mr-2 shrink-0" />
              <input
                ref={mobileInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setMobileSearchOpen(false);
                    onSubmitSearch();
                  }
                }}
                placeholder="Buscar perfume, marca ou nota..."
                className="w-full bg-transparent text-sm text-[#1E1712] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="p-1 text-[#7A6E65]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="px-3 py-2 text-sm font-medium text-[#5C5147]"
            >
              Fechar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#EFEAE2]">
            {qNorm.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#7A6E65]">
                Digite parte do nome do perfume ou da marca para buscar.
              </div>
            ) : instantResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#7A6E65]">
                Nenhum perfume encontrado.
              </div>
            ) : (
              <>
                {instantResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setMobileSearchOpen(false);
                      onOpenProduct(p.id);
                    }}
                    className="w-full flex items-center gap-3 p-4 bg-white text-left"
                  >
                    <SmartImage
                      src={extractImg(p)}
                      alt={extractNome(p)}
                      className="p-1"
                      containerClassName="w-12 h-12 rounded-lg shrink-0 bg-white border border-[#EFEAE2]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1E1712] truncate">
                        {extractNome(p)}
                      </p>
                      <p className="text-xs text-[#7A6E65] truncate">
                        {extractMarca(p)} · R$ {formatBRL(extractPreco(p))}
                      </p>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileSearchOpen(false);
                    onSubmitSearch();
                  }}
                  className="w-full py-4 text-center text-sm font-semibold text-[#9A7437] bg-white"
                >
                  Ver todos os resultados no catálogo →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Compact Mobile Bottom Navigation (within 15% sticky viewport budget) */}
      <nav
        aria-label="Atalhos móveis"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6DFD5] px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-around h-14">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium ${
              activeView === 'home' ? 'text-[#9A7437]' : 'text-[#6B5E53]'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate('catalogo')}
            className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium ${
              activeView === 'catalogo' ? 'text-[#9A7437]' : 'text-[#6B5E53]'
            }`}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            className="flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium text-[#6B5E53]"
          >
            <Search className="w-5 h-5 mb-0.5" />
            Buscar
          </button>
          <button
            type="button"
            onClick={onOpenCart}
            className="relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium text-[#6B5E53]"
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            Sacola
            {cartCount > 0 && (
              <span className="absolute top-1 right-2.5 bg-[#9A7437] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center tabular-nums">
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleUserAction}
            className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium ${
              activeView === 'conta' || activeView === 'admin'
                ? 'text-[#9A7437]'
                : 'text-[#6B5E53]'
            }`}
          >
            <User className="w-5 h-5 mb-0.5" />
            {isAdmin ? 'Admin' : user ? 'Conta' : 'Entrar'}
          </button>
        </div>
      </nav>
    </>
  );
};
