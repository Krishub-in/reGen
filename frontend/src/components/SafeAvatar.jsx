import React, { useState, useEffect } from 'react';

// Global memory cache of broken URLs so they are never retried within the session
const brokenImageUrls = new Set();

export function SafeAvatar({
  src,
  alt = 'Avatar',
  name = '',
  username = '',
  gender = '',
  className = 'w-8 h-8 rounded-full',
  imgClassName = 'w-full h-full object-cover',
  fallbackIcon = null
}) {
  const isBroken = src ? brokenImageUrls.has(src) : true;
  const [hasError, setHasError] = useState(isBroken);

  useEffect(() => {
    if (src && !brokenImageUrls.has(src)) {
      setHasError(false);
    } else {
      setHasError(true);
    }
  }, [src]);

  const initials = (name || username || 'U').trim().slice(0, 2).toUpperCase();

  const getGenderFallback = () => {
    const safeSeed = encodeURIComponent(String(username || name || 'user').slice(0, 30));
    const g = String(gender || '').toLowerCase();
    if (g === 'male') {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=male`;
    }
    if (g === 'female') {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=female`;
    }
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}`;
  };

  const handleError = () => {
    if (src) brokenImageUrls.add(src);
    setHasError(true);
  };

  const validSrc = src && !hasError && !brokenImageUrls.has(src);

  return (
    <div className={`overflow-hidden shrink-0 flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
      {validSrc ? (
        <img
          src={src}
          alt={alt}
          className={imgClassName}
          onError={handleError}
          loading="lazy"
        />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : (
        <img
          src={getGenderFallback()}
          alt={alt}
          className={imgClassName}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </div>
  );
}

export function getCompanyInitials(name) {
  if (!name || typeof name !== 'string') return 'KR';
  const clean = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  if (!clean) return 'KR';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 1) {
    if (words[0].length >= 2) {
      return words[0].slice(0, 2).toUpperCase();
    }
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
  }
  return clean.slice(0, 2).toUpperCase();
}

export function SafeCompanyLogo({
  src,
  alt = 'Company Logo',
  name = '',
  className = 'w-7 h-7 rounded-lg',
  imgClassName = 'w-full h-full object-contain',
  fallbackIcon = null
}) {
  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const isBroken = cleanSrc ? brokenImageUrls.has(cleanSrc) : true;
  const [hasError, setHasError] = useState(isBroken);

  useEffect(() => {
    if (cleanSrc && cleanSrc !== 'null' && cleanSrc !== 'undefined' && !brokenImageUrls.has(cleanSrc)) {
      setHasError(false);
    } else {
      setHasError(true);
    }
  }, [cleanSrc]);

  const initials = getCompanyInitials(name);

  const handleError = () => {
    if (cleanSrc) brokenImageUrls.add(cleanSrc);
    setHasError(true);
  };

  const validSrc = Boolean(cleanSrc && cleanSrc !== 'null' && cleanSrc !== 'undefined' && !hasError && !brokenImageUrls.has(cleanSrc));

  return (
    <div
      className={`overflow-hidden shrink-0 flex items-center justify-center font-bold tracking-wider select-none ${
        validSrc 
          ? "bg-muted/40 border border-border/40" 
          : "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30 shadow-2xs"
      } ${className}`}
    >
      {validSrc ? (
        <img
          src={cleanSrc}
          alt={alt}
          className={imgClassName}
          onError={handleError}
          loading="lazy"
        />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : (
        <span className="text-[10px] sm:text-[11px] font-extrabold uppercase leading-none">{initials}</span>
      )}
    </div>
  );
}

export default SafeAvatar;
