import React, { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn } from 'lucide-react';
import { optimizeImageBlob } from '../lib/imageOptimizer';

interface ImageCropperModalProps {
  file: File | null;
  aspectRatio: number;
  maxWidth: number;
  maxHeight: number;
  title?: string;
  onConfirm: (result: { blob: Blob; previewUrl: string; ext: string; mime: string }) => void;
  onCancel: () => void;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  file,
  aspectRatio,
  maxWidth,
  maxHeight,
  title = 'Ajustar Imagem',
  onConfirm,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<number>(aspectRatio);
  const [zoom, setZoom] = useState<number>(1);
  const [processing, setProcessing] = useState(false);

  const stateRef = useRef({
    natW: 0,
    natH: 0,
    scale: 1,
    minScale: 1,
    posX: 0,
    posY: 0,
    dragging: false,
    lx: 0,
    ly: 0,
    pinching: false,
    lastDist: 0,
  });

  useEffect(() => {
    setRatio(aspectRatio);
  }, [aspectRatio]);

  const getCropRect = (canvas: HTMLCanvasElement, activeRatio: number) => {
    const wW = canvas.width;
    const wH = canvas.height;
    let cW: number;
    let cH: number;
    if (activeRatio === 0) {
      cW = wW * 0.84;
      cH = wH * 0.84;
    } else if (activeRatio >= 1) {
      cW = Math.min(wW * 0.84, wH * 0.84 * activeRatio);
      cH = cW / activeRatio;
    } else {
      cH = Math.min(wH * 0.84, wW * 0.84 / activeRatio);
      cW = cH * activeRatio;
    }
    return { x: (wW - cW) / 2, y: (wH - cH) / 2, w: cW, h: cH };
  };

  const drawCanvas = (activeRatio = ratio) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { posX, posY, natW, natH, scale } = stateRef.current;
    const wW = canvas.width;
    const wH = canvas.height;

    ctx.clearRect(0, 0, wW, wH);
    ctx.drawImage(img, posX, posY, natW * scale, natH * scale);

    ctx.save();
    ctx.fillStyle = 'rgba(20, 15, 10, 0.58)';
    ctx.fillRect(0, 0, wW, wH);
    ctx.restore();

    const cr = getCropRect(canvas, activeRatio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cr.x, cr.y, cr.w, cr.h);
    ctx.clip();
    ctx.drawImage(img, posX, posY, natW * scale, natH * scale);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#C9A84C';
    ctx.lineWidth = 2;
    ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
    ctx.restore();
  };

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 520;
        canvas.height = 340;
        const sw = canvas.width / img.naturalWidth;
        const sh = canvas.height / img.naturalHeight;
        const minScale = Math.min(sw, sh) * 0.95;
        stateRef.current = {
          natW: img.naturalWidth,
          natH: img.naturalHeight,
          scale: minScale,
          minScale,
          posX: (canvas.width - img.naturalWidth * minScale) / 2,
          posY: (canvas.height - img.naturalHeight * minScale) / 2,
          dragging: false,
          lx: 0,
          ly: 0,
          pinching: false,
          lastDist: 0,
        };
        setZoom(1);
        drawCanvas(ratio);
      };
      img.src = String(e.target?.result || '');
    };
    reader.readAsDataURL(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    drawCanvas(ratio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  if (!file) return null;

  const handleZoomChange = (nextZoom: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setZoom(nextZoom);
    const st = stateRef.current;
    const ns = Math.max(st.minScale * 0.6, st.minScale * nextZoom);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    st.posX = cx - (cx - st.posX) * (ns / st.scale);
    st.posY = cy - (cy - st.posY) * (ns / st.scale);
    st.scale = ns;
    drawCanvas(ratio);
  };

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    setProcessing(true);
    try {
      const cr = getCropRect(canvas, ratio);
      const st = stateRef.current;
      const srcX = (cr.x - st.posX) / st.scale;
      const srcY = (cr.y - st.posY) / st.scale;
      const srcW = cr.w / st.scale;
      const srcH = cr.h / st.scale;

      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(cr.w * 2));
      out.height = Math.max(1, Math.round(cr.h * 2));
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Erro ao gerar recorte');

      ctx.fillStyle = ratio > 1.5 ? '#1E1712' : '#FFFFFF';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

      const rawBlob = await new Promise<Blob | null>((res) =>
        out.toBlob((b) => res(b), 'image/png')
      );
      if (!rawBlob) throw new Error('Falha ao exportar imagem');

      const optimized = await optimizeImageBlob(rawBlob, {
        maxWidth,
        maxHeight,
        quality: 0.86,
      });

      const previewUrl = URL.createObjectURL(optimized.blob);
      onConfirm({ ...optimized, previewUrl });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[900] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-[#E6DFD5] rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DFD5]">
          <h3 className="font-display text-xl font-semibold text-[#1E1712]">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#6B5E53] hover:bg-[#F2EDE6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#181410] flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-[300px] sm:h-[340px] cursor-grab active:cursor-grabbing touch-none"
            onMouseDown={(e) => {
              stateRef.current.dragging = true;
              stateRef.current.lx = e.clientX;
              stateRef.current.ly = e.clientY;
            }}
            onMouseMove={(e) => {
              if (!stateRef.current.dragging) return;
              stateRef.current.posX += e.clientX - stateRef.current.lx;
              stateRef.current.posY += e.clientY - stateRef.current.ly;
              stateRef.current.lx = e.clientX;
              stateRef.current.ly = e.clientY;
              drawCanvas(ratio);
            }}
            onMouseUp={() => {
              stateRef.current.dragging = false;
            }}
            onMouseLeave={() => {
              stateRef.current.dragging = false;
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                stateRef.current.dragging = true;
                stateRef.current.lx = e.touches[0].clientX;
                stateRef.current.ly = e.touches[0].clientY;
              }
            }}
            onTouchMove={(e) => {
              if (!stateRef.current.dragging || e.touches.length !== 1) return;
              stateRef.current.posX += e.touches[0].clientX - stateRef.current.lx;
              stateRef.current.posY += e.touches[0].clientY - stateRef.current.ly;
              stateRef.current.lx = e.touches[0].clientX;
              stateRef.current.ly = e.touches[0].clientY;
              drawCanvas(ratio);
            }}
            onTouchEnd={() => {
              stateRef.current.dragging = false;
            }}
          />
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { label: '1:1', value: 1 },
              { label: '4:3', value: 4 / 3 },
              { label: '16:9', value: 16 / 9 },
              { label: '21:9 Capa', value: 21 / 9 },
              { label: '3:4', value: 0.75 },
              { label: 'Livre', value: 0 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setRatio(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  Math.abs(ratio - opt.value) < 0.01
                    ? 'bg-[#1E1712] text-white border-[#1E1712]'
                    : 'bg-[#FAF8F5] text-[#6B5E53] border-[#E6DFD5] hover:border-[#9A7437]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-[#6B5E53] shrink-0" />
            <input
              type="range"
              min="0.65"
              max="3.5"
              step="0.05"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full accent-[#9A7437]"
              aria-label="Zoom da imagem"
            />
          </div>

          <p className="text-[11px] text-[#7A6E65] text-center">
            Arraste para enquadrar. O arquivo é otimizado automaticamente em WebP para carregamento rápido.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 rounded-lg border border-[#E6DFD5] text-sm font-medium text-[#6B5E53] hover:bg-[#F2EDE6] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={handleConfirm}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#1E1712] text-white text-sm font-semibold hover:bg-[#332820] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {processing ? 'Otimizando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
