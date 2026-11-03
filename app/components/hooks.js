'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/clientApi';

/**
 * Fetch JSON from `url` and optionally poll it. Polling pauses while the tab
 * is hidden and resumes (with an immediate refresh) when it becomes visible.
 * Passing url=null disables fetching. With keepPrevious, data from the
 * previous URL stays visible while the next one loads (e.g. pagination).
 */
export function useApi(url, { interval = 0, select, keepPrevious = false } = {}) {
  const [result, setResult] = useState({ url: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  const controllerRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!url) return null;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (silent) setRefreshing(true);
    try {
      const json = await api.get(url, { signal: controller.signal });
      const value = selectRef.current ? selectRef.current(json) : json;
      setResult({ url, data: value, error: null });
      return value;
    } catch (err) {
      if (err?.name !== 'AbortError') setResult((r) => ({ url, data: r.url === url ? r.data : null, error: err }));
      return null;
    } finally {
      if (silent) setRefreshing(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return undefined;
    load();
    return () => controllerRef.current?.abort();
  }, [url, load]);

  useEffect(() => {
    if (!url || !interval) return undefined;
    const timer = setInterval(() => document.visibilityState === 'visible' && load({ silent: true }), interval);
    const onVisible = () => document.visibilityState === 'visible' && load({ silent: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, interval, load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);
  const setData = useCallback((updater) => setResult((r) => ({ ...r, data: typeof updater === 'function' ? updater(r.data) : updater })), []);

  if (!url) return { data: null, error: null, loading: false, refreshing: false, refresh, setData };
  const current = result.url === url;
  const data = current || keepPrevious ? result.data : null;
  return { data, error: current ? result.error : null, loading: !current && !data, refreshing: refreshing || (!current && !!data), refresh, setData };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Run an async action with a loading flag keyed by name. */
export function useBusy() {
  const [busy, setBusy] = useState({});
  const run = useCallback(async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      return await fn();
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    }
  }, []);
  return [busy, run];
}
