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

export function SafeCompanyLogo({
  src,
  alt = 'Company Logo',
  name = '',
  className = 'w-8 h-8 rounded-lg',
  imgClassName = 'w-full h-full object-contain',
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

  const initials = (name || 'Co').trim().slice(0, 2).toUpperCase();

  const handleError = () => {
    if (src) brokenImageUrls.add(src);
    setHasError(true);
  };

  const validSrc = src && !hasError && !brokenImageUrls.has(src);

  return (
    <div className={`overflow-hidden shrink-0 flex items-center justify-center bg-muted/40 border border-border/40 ${className}`}>
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
        <span className="text-[11px] font-bold text-muted-foreground uppercase">{initials}</span>
      )}
    </div>
  );
}

export default SafeAvatar;
