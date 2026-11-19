import { useCallback, useEffect, useMemo, useState } from 'react';

/** Waits until typing pauses, so a search box does not fire a request per key. */
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * One list-fetching hook for every admin table: page, debounced search and
 * filters, with loading/error state and a `reload()` to call after a save.
 *
 * Loading is derived, not stored: a response is tagged with the request key it
 * answered, so "loading" simply means "the newest response has not arrived yet".
 * That avoids setting state at the start of an effect.
 *
 * `fetcher` must be stable (the adminApi functions are module-level).
 */
export function useList(fetcher, { limit = 10, initialFilters = {} } = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [version, setVersion] = useState(0);

  const [result, setResult] = useState({
    items: [],
    pagination: { page: 1, limit, total: 0, totalPages: 1 },
    key: null,
  });
  const [failure, setFailure] = useState(null);

  const debouncedSearch = useDebouncedValue(search);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const requestKey = `${page}|${limit}|${debouncedSearch.trim()}|${filterKey}|${version}`;

  useEffect(() => {
    let alive = true;

    fetcher({
      page,
      limit,
      search: debouncedSearch.trim() || undefined,
      ...JSON.parse(filterKey),
    })
      .then((response) => {
        if (alive) setResult({ ...response.data, key: requestKey });
      })
      .catch((problem) => {
        if (alive) setFailure({ key: requestKey, message: problem.message });
      });

    return () => {
      alive = false;
    };
  }, [fetcher, page, limit, debouncedSearch, filterKey, version, requestKey]);

  const setSearch = useCallback((value) => {
    setPage(1);
    setSearchValue(value);
  }, []);

  const setFilter = useCallback((key, value) => {
    setPage(1);
    setFilters((current) => {
      const next = { ...current };
      if (value === '' || value === undefined || value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return {
    items: result.items,
    pagination: result.pagination,
    loading: result.key !== requestKey,
    error: failure?.key === requestKey ? failure.message : null,
    page,
    setPage,
    search,
    setSearch,
    filters,
    setFilter,
    reload,
  };
}
