import type { Category, Product } from '../types';
import { BRAND_ASSETS, resolveSafeMediaUrl } from './assets';

export function formatBRL(value: number | string | undefined | null): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  if (!Number.isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

export function normalizeText(str?: string | null): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function extractNome(p: Partial<Product>): string {
  return (p.nome || p.name || p.titulo || '').trim();
}

export function extractMarca(p: Partial<Product>): string {
  return (p.marca || p.brand || '').trim();
}

export function extractPreco(p: Partial<Product>): number {
  const v = Number(p.preco ?? p.price ?? p.precoCartao ?? p.vendaCartao ?? p.vendaPix ?? 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function extractPrecoPix(p: Partial<Product>): number {
  const pix = Number(p.precoPix ?? p.pix ?? p.vendaPix ?? 0);
  return Number.isFinite(pix) && pix > 0 ? pix : extractPreco(p);
}

export function extractPrecoOld(p: Partial<Product>): number {
  const old = Number(p.precoOld ?? p.de ?? 0);
  return Number.isFinite(old) && old > 0 ? old : 0;
}

export function extractEstoque(p: Partial<Product>): number {
  const est = Number(p.estoqueQtd ?? p.estoque ?? p.stock ?? 0);
  return Number.isFinite(est) && est >= 0 ? Math.floor(est) : 0;
}

export function extractVol(p: Partial<Product>): string {
  return (p.vol || p.ml || p.tamanho || '').trim();
}

export function extractDesc(p: Partial<Product>): string {
  return (p.desc || p.descricao || p.description || '').trim();
}

export function extractImg(p: Partial<Product>): string {
  const raw = (p.imgUrl || p.imgPath || p.img || p.image || '').trim();
  return resolveSafeMediaUrl(raw, '');
}

export function extractCategoriaLabel(p: Partial<Product>): string {
  const raw = (p.cat || p.categoria || p.category || '').trim().toLowerCase();
  const map: Record<string, string> = {
    fem: 'Feminino',
    feminino: 'Feminino',
    masc: 'Masculino',
    masculino: 'Masculino',
    uni: 'Unissex',
    unissex: 'Unissex',
    kit: 'Kits',
    kits: 'Kits',
  };
  if (map[raw]) return map[raw];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

export function matchesCategory(p: Partial<Product>, targetSlug: string): boolean {
  const raw = normalizeText(p.cat || p.categoria || p.category || '');
  const mapped = normalizeText(extractCategoriaLabel(p));
  const target = normalizeText(targetSlug);
  if (!target) return true;
  return raw === target || raw.startsWith(target) || mapped.includes(target);
}

export function isProductNew(p: Partial<Product>): boolean {
  const sec = p.criadoEm?.seconds;
  if (!sec) return false;
  const days = (Date.now() / 1000 - sec) / 86400;
  return days <= 7;
}

export function parseOlfactoryNotes(notas?: string): string[] {
  if (!notas) return [];
  return notas
    .split(/[,;|•]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function safeExternalUrl(url?: string | null): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function formatPhoneMask(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length >= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length >= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d;
}

export function formatCepMask(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

export function cleanDigits(input?: string | null): string {
  return (input || '').replace(/\D/g, '');
}

export function buildWhatsappUrl(phone: string | undefined, message?: string): string {
  const clean = cleanDigits(phone) || '5511999999999';
  const base = `https://wa.me/${clean}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function getCategoryFallbackImage(slug: string): string {
  const s = normalizeText(slug);
  if (s.startsWith('fem')) return BRAND_ASSETS.catFem;
  if (s.startsWith('masc')) return BRAND_ASSETS.catMasc;
  if (s.startsWith('uni')) return BRAND_ASSETS.catUni;
  if (s.startsWith('kit')) return BRAND_ASSETS.catKit;
  return BRAND_ASSETS.catFem;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-fem', nome: 'Feminino', slug: 'fem', ico: '🌸', img: BRAND_ASSETS.catFem, hidden: false },
  { id: 'cat-masc', nome: 'Masculino', slug: 'masc', ico: '🔷', img: BRAND_ASSETS.catMasc, hidden: false },
  { id: 'cat-uni', nome: 'Unissex', slug: 'uni', ico: '✨', img: BRAND_ASSETS.catUni, hidden: false },
  { id: 'cat-kit', nome: 'Kits', slug: 'kit', ico: '🎁', img: BRAND_ASSETS.catKit, hidden: false },
];

export function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `doc_${Date.now()}`;
}

export function sanitizeProductForFirestore(raw: Record<string, unknown>): Record<string, unknown> {
  const nomeRaw = String(raw.nome ?? raw.name ?? raw.titulo ?? 'Perfume Importado').trim();
  const nome = (nomeRaw || 'Perfume Importado').slice(0, 160);

  const precoRaw = Number(raw.preco ?? raw.price ?? raw.precoCartao ?? raw.vendaCartao ?? raw.vendaPix ?? 0);
  const preco = Number.isFinite(precoRaw) ? Math.min(100000, Math.max(0, precoRaw)) : 0;

  const precoPixRaw = Number(raw.precoPix ?? raw.pix ?? raw.vendaPix ?? 0);
  const precoPix = Number.isFinite(precoPixRaw) ? Math.min(100000, Math.max(0, precoPixRaw)) : 0;

  const precoOldRaw = Number(raw.precoOld ?? raw.de ?? 0);
  const precoOld = Number.isFinite(precoOldRaw) ? Math.min(100000, Math.max(0, precoOldRaw)) : 0;

  const estoqueRaw = Number(raw.estoqueQtd ?? raw.estoque ?? raw.stock ?? 0);
  const estoqueQtd = Number.isFinite(estoqueRaw) ? Math.min(100000, Math.max(0, Math.floor(estoqueRaw))) : 0;

  const rawImg = String(raw.imgUrl ?? raw.imgPath ?? raw.img ?? raw.image ?? '').trim();
  const imgUrl =
    rawImg.length <= 1000 && (rawImg.startsWith('https://') || rawImg.startsWith('http://') || rawImg.startsWith('/src/assets/'))
      ? rawImg
      : '';

  const payload: Record<string, unknown> = {
    nome,
    preco,
    precoPix,
    precoOld,
    estoqueQtd,
    marca: String(raw.marca ?? raw.brand ?? '').trim().slice(0, 100),
    vol: String(raw.vol ?? raw.ml ?? raw.tamanho ?? '').trim().slice(0, 40),
    cat: String(raw.cat ?? raw.categoria ?? raw.category ?? '').trim().slice(0, 40),
    notas: String(raw.notas ?? '').trim().slice(0, 300),
    desc: String(raw.desc ?? raw.descricao ?? raw.description ?? '').trim().slice(0, 3000),
    imgUrl,
    ativo: raw.ativo !== false,
    dest: Boolean(raw.dest ?? raw.destaque),
    promo: Boolean(raw.promo ?? raw.promocao),
  };

  if (typeof raw.ordem === 'number' && Number.isFinite(raw.ordem)) {
    payload.ordem = raw.ordem;
  }
  if (typeof raw.estoqueAlerta === 'number' && Number.isFinite(raw.estoqueAlerta)) {
    payload.estoqueAlerta = Math.max(1, Math.floor(raw.estoqueAlerta));
  }
  if (typeof raw.est === 'string' && raw.est.trim()) {
    payload.est = raw.est.trim().slice(0, 20);
  }
  if (typeof raw.views === 'number' && Number.isFinite(raw.views)) {
    payload.views = Math.max(0, Math.floor(raw.views));
  }
  if (typeof raw.vendas === 'number' && Number.isFinite(raw.vendas)) {
    payload.vendas = Math.max(0, Math.floor(raw.vendas));
  }

  return payload;
}

export function sanitizeCategoryForFirestore(raw: Record<string, unknown>, fallbackSlug: string): Record<string, unknown> {
  const nome = String(raw.nome ?? raw.name ?? 'Categoria').trim().slice(0, 80) || 'Categoria';
  const slugRaw = String(raw.slug ?? fallbackSlug).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const slug = slugRaw || 'cat';
  const rawImg = String(raw.img ?? raw.imgUrl ?? '').trim();
  const img =
    rawImg.length <= 1000 && (rawImg.startsWith('https://') || rawImg.startsWith('http://') || rawImg.startsWith('/src/assets/'))
      ? rawImg
      : '';
  const ico = String(raw.ico ?? raw.icon ?? '').trim().slice(0, 16);

  return {
    nome,
    slug,
    ico,
    icon: ico,
    img,
    hidden: Boolean(raw.hidden),
  };
}

const ADMIN_EMAIL_HASHES = [
  '01bf4b790d68294153906c9a077e7f49cf9cb37f48945948057aef3ab4babe15',
  'edc554602d866e97043cff302f0fab64661ac0d21e3cd37c0f6e1333c00a0125',
];

export async function isAdminEmail(email?: string | null): Promise<boolean> {
  if (!email || typeof crypto === 'undefined' || !crypto.subtle) return false;
  const normalized = email.trim().toLowerCase();
  const buf = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return ADMIN_EMAIL_HASHES.includes(hex);
}


