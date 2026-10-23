import { useState, useMemo, useEffect, useCallback, useRef } from 'react';

/**
 * useScrollPagination - Lazy loads items in batches as the user scrolls down
 * Supports container scroll, window scroll, sentinel intersection, and auto-load when not overflowing.
 *
 * @param {Array} items - Full array of items to paginate
 * @param {number} pageSize - Items per page batch (default: 6)
 * @param {Array} resetTriggers - Dependencies that reset pagination back to page 1
 */
export function useScrollPagination(items = [], pageSize = 6, resetTriggers = []) {
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  // Reset to first batch whenever search, filters, or year context change
  useEffect(() => {
    setPage(1);
  }, resetTriggers); // eslint-disable-line react-hooks/exhaustive-deps

  const totalCount = Array.isArray(items) ? items.length : 0;
  const maxPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const visibleItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, page * pageSize);
  }, [items, page, pageSize]);

  const hasMore = visibleItems.length < totalCount;

  const loadMore = useCallback(() => {
    setPage(prev => Math.min(prev + 1, maxPages));
  }, [maxPages]);

  // Scroll event handler attached to table/list container
  const onScroll = useCallback((e) => {
    const target = e?.currentTarget || e?.target;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      if (hasMore) {
        loadMore();
      }
    }
  }, [hasMore, loadMore]);

  // 1. Intersection Observer on Sentinel element (auto-triggers when bottom is visible)
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { root: containerRef.current || null, rootMargin: '150px', threshold: 0.01 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visibleItems.length]);

  // 2. Global window scroll listener (handles page-level scrolling)
  useEffect(() => {
    if (!hasMore) return;
    const handleWindowScroll = () => {
      const el = sentinelRef.current || containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 150) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [hasMore, loadMore]);

  // 3. Auto-load check if container height does not overflow yet hasMore is true
  useEffect(() => {
    if (!hasMore || !containerRef.current) return;
    const el = containerRef.current;
    if (el.scrollHeight <= el.clientHeight + 10 && page < maxPages) {
      const timer = setTimeout(() => {
        loadMore();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hasMore, page, maxPages, visibleItems.length, loadMore]);

  const safeList = Array.isArray(visibleItems) ? visibleItems : [];

  return {
    visibleItems: safeList,
    displayedItems: safeList,
    hasMore,
    totalCount,
    displayedCount: safeList.length,
    loadMore,
    onScroll,
    handleScroll: onScroll,
    containerRef,
    sentinelRef,
    page,
    setPage,
  };
}
