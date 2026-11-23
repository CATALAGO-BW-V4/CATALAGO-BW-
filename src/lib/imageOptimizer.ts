export interface OptimizeImageOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
}

/**
 * Compresses and resizes an image blob/file in the browser before uploading to Firebase Storage.
 * Prefers WebP for significantly smaller payloads and faster mobile loading, falling back to JPEG.
 */
export async function optimizeImageBlob(
  source: Blob,
  options: OptimizeImageOptions
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const { maxWidth, maxHeight, quality = 0.86 } = options;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(source);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao processar a imagem.'));
    };
    el.src = objectUrl;
  });

  const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
  const targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
  const targetH = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto gráfico indisponível.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const webpBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', quality)
  );

  if (webpBlob && webpBlob.type === 'image/webp' && webpBlob.size > 0) {
    return { blob: webpBlob, ext: 'webp', mime: 'image/webp' };
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  );

  if (!jpegBlob) throw new Error('Não foi possível comprimir a imagem.');
  return { blob: jpegBlob, ext: 'jpg', mime: 'image/jpeg' };
}
