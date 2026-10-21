import { useState, useMemo, useEffect, useCallback, useRef } from 'react';

/**
 * useScrollPagination - Lazy loads items in batches of 6 as the user scrolls down
 *
 * @param {Array} items - Full array of items to paginate
 * @param {number} pageSize - Items per page batch (default: 6)
 * @param {Array} resetTriggers - Dependencies that reset pagination back to page 1
 */
export function useScrollPagination(items = [], pageSize = 6, resetTriggers = []) {
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);

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
    if (hasMore) {
      setPage(prev => Math.min(prev + 1, maxPages));
    }
  }, [hasMore, maxPages]);

  // Scroll event handler attached to table/list container
  const onScroll = useCallback((e) => {
    const target = e?.currentTarget || e?.target;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    if (scrollTop + clientHeight >= scrollHeight - 40) {
      if (hasMore) {
        setPage(prev => Math.min(prev + 1, maxPages));
      }
    }
  }, [hasMore, maxPages]);

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
    page,
    setPage,
  };
}
