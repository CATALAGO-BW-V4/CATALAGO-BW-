import brandEmblemImg from '../assets/images/brand_emblem_bw_1795432661007.jpg';
import heroSignatureImg from '../assets/images/hero_signature_fragrance_1795432661607.jpg';
import heroDuoImg from '../assets/images/hero_collection_duo_1795432662186.jpg';
import catFemImg from '../assets/images/cat_feminine_scent_1795432662011.jpg';
import catMascImg from '../assets/images/cat_masculine_scent_1795432661805.jpg';
import catUniImg from '../assets/images/cat_unisex_amber_1795432662021.jpg';
import catKitImg from '../assets/images/cat_gift_coffret_1795432661654.jpg';

export const BRAND_ASSETS = {
  logo: brandEmblemImg,
  heroMain: heroSignatureImg,
  heroSecondary: heroDuoImg,
  catFem: catFemImg,
  catMasc: catMascImg,
  catUni: catUniImg,
  catKit: catKitImg,
};

const LEGACY_ASSET_MAP: Record<string, string> = {
  'https://i.ibb.co/8DQfJ4Dk': brandEmblemImg,
  'https://i.ibb.co/wr671s2X': catFemImg,
  'https://i.ibb.co/dwsfRD66': catMascImg,
};

export function resolveSafeMediaUrl(url?: string | null, fallback = ''): string {
  const raw = (url || '').trim();
  if (!raw) return fallback;

  if (LEGACY_ASSET_MAP[raw]) {
    return LEGACY_ASSET_MAP[raw];
  }

  // Replace fragile third-party placeholder/stock hosts from legacy defaults
  if (
    raw.includes('images.unsplash.com') ||
    raw.includes('via.placeholder.com') ||
    raw.includes('picsum.photos')
  ) {
    return fallback;
  }

  if (raw.startsWith('/src/assets/') || raw.startsWith('data:image/') || raw.startsWith('blob:')) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Allow relative Vite bundled assets
    if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('assets/')) {
      return raw;
    }
  }

  return fallback;
}
