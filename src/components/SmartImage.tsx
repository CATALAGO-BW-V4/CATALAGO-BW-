import React, { useState } from 'react';
import { resolveSafeMediaUrl } from '../lib/assets';

interface SmartImageProps {
  src?: string | null;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fit?: 'contain' | 'cover';
  pos?: 'center' | 'top' | 'bottom';
  priority?: boolean;
  fallbackLabel?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  fallbackSrc = '',
  alt,
  className = '',
  containerClassName = '',
  fit = 'contain',
  pos = 'center',
  priority = false,
  fallbackLabel,
}) => {
  const resolved = resolveSafeMediaUrl(src, fallbackSrc);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    resolved ? 'loading' : 'error'
  );
  const [prevSrc, setPrevSrc] = useState(resolved);

  if (resolved !== prevSrc) {
    setPrevSrc(resolved);
    setStatus(resolved ? 'loading' : 'error');
  }

  const posClass =
    pos === 'top'
      ? 'object-top'
      : pos === 'bottom'
        ? 'object-bottom'
        : 'object-center';

  return (
    <div className={`relative overflow-hidden bg-white ${containerClassName}`}>
      {status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 skeleton-shimmer"
        />
      )}

      {status !== 'error' && resolved ? (
        <img
          src={resolved}
          alt={alt}
          referrerPolicy="no-referrer"
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`absolute inset-0 w-full h-full box-border transition-opacity duration-200 ${
            fit === 'contain' ? 'object-contain' : 'object-cover'
          } ${posClass} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${className}`}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-4 text-center bg-white">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9A7437"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-65 mb-2"
            aria-hidden="true"
          >
            <path d="M9 3h6v3H9z" />
            <path d="M10 6v2l-3 3v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-8l-3-3V6" />
            <path d="M9 14h6" />
          </svg>
          {fallbackLabel && (
            <span className="text-[11px] font-medium text-[#7A6E65] line-clamp-2 max-w-[140px]">
              {fallbackLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
