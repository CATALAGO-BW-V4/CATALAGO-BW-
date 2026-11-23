import React, { useEffect, useState } from 'react';
import { ArrowUp, MessageCircle, ShieldCheck } from 'lucide-react';
import type { AppView, StoreSettings } from '../types';
import { BRAND_ASSETS } from '../lib/assets';
import { buildWhatsappUrl } from '../lib/format';
import { SmartImage } from './SmartImage';

interface FooterProps {
  settings: StoreSettings;
  onNavigate: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, onNavigate }) => {
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > 480);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const whatsappHref = buildWhatsappUrl(
    settings.wpp,
    'Olá! Gostaria de atendimento sobre um perfume da BW Parfum.'
  );

  return (
    <>
      <footer className="bg-[#1E1712] text-[#E6DFD5] border-t border-[#332820] mt-16 pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <SmartImage
                src={settings.logo || BRAND_ASSETS.logo}
                fallbackSrc={BRAND_ASSETS.logo}
                alt="BW Parfum"
                fit="cover"
                containerClassName="w-8 h-8 rounded-full border border-[#4A3F30]"
              />
              <span className="font-display text-xl font-semibold tracking-wider text-white">
                {settings.nome || 'BW PARFUM'}
              </span>
            </div>
            <p className="text-xs text-[#B5AAA0] leading-relaxed">
              {settings.slogan ||
                'Alta perfumaria importada com procedência garantida e atendimento personalizado.'}
            </p>
            <p className="inline-flex items-center gap-1.5 text-[11px] text-[#D4AF6E]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Fragrâncias originais lacradas
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs uppercase tracking-[0.16em] text-[#D4AF6E] font-semibold">
              Navegação
            </h3>
            <ul className="space-y-1.5 text-xs text-[#CFC5B8]">
              <li>
                <button type="button" onClick={() => onNavigate('home')} className="hover:text-white">
                  Início
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('catalogo')} className="hover:text-white">
                  Catálogo Completo
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('como')} className="hover:text-white">
                  Como Comprar
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('sobre')} className="hover:text-white">
                  Sobre Nós
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs uppercase tracking-[0.16em] text-[#D4AF6E] font-semibold">
              Categorias
            </h3>
            <ul className="space-y-1.5 text-xs text-[#CFC5B8]">
              <li>
                <button type="button" onClick={() => onNavigate('feminino')} className="hover:text-white">
                  Perfumes Femininos
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('masculino')} className="hover:text-white">
                  Perfumes Masculinos
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('unissex')} className="hover:text-white">
                  Perfumes Unissex
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('kits')} className="hover:text-white">
                  Kits & Presentes
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-[0.16em] text-[#D4AF6E] font-semibold">
              Atendimento
            </h3>
            <p className="text-xs text-[#CFC5B8]">
              Status: {settings.lojaAberta === false ? 'Recebendo pedidos sob consulta' : 'Loja ativa e enviando'}
            </p>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1F6E43] hover:bg-[#175533] text-white text-xs font-semibold transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Atendimento no WhatsApp
            </a>
          </div>
        </div>

        <div className="border-t border-[#332820] py-4 px-4 sm:px-6 text-center text-[11px] text-[#9A8E82]">
          © {new Date().getFullYear()} {settings.nome || 'BW Parfum Imports'}. Todos os direitos reservados.
        </div>
      </footer>

      {/* Floating WhatsApp & Back-to-Top actions */}
      <div className="fixed bottom-16 md:bottom-5 right-4 z-30 flex flex-col items-end gap-2">
        {showBackTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Voltar ao topo"
            className="w-10 h-10 rounded-full bg-white border border-[#E0D9CF] text-[#1E1712] shadow-md flex items-center justify-center hover:border-[#9A7437] transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="w-11 h-11 rounded-full bg-[#1F6E43] hover:bg-[#175533] text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105"
        >
          <MessageCircle className="w-5 h-5" />
        </a>
      </div>
    </>
  );
};
