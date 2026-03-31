'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePageCacheOptions<T> {
    /** Unique cache key for this page's data */
    cacheKey: string;
    /** Function to fetch data from the server */
    fetcher: (token: string) => Promise<T>;
    /** How long (ms) the cache is considered fresh. Default: 5 minutes */
    maxAge?: number;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * Hook that provides instant data from sessionStorage cache on page revisit,
 * while refreshing data in the background.
 * 
 * First visit: shows skeleton → fetches → caches → shows data
 * Revisit: shows cached data instantly → refreshes in background → updates if changed
 */
export function usePageCache<T>({ cacheKey, fetcher, maxAge = 5 * 60 * 1000 }: UsePageCacheOptions<T>) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const fetchedRef = useRef(false);

    // Try to load from cache on mount
    useEffect(() => {
        try {
            const cached = sessionStorage.getItem(`page_cache_${cacheKey}`);
            if (cached) {
                const entry: CacheEntry<T> = JSON.parse(cached);
                const age = Date.now() - entry.timestamp;
                
                // Use cache if it exists (regardless of age, we'll refresh in background)
                setData(entry.data);
                setLoading(false);
                
                // If cache is fresh enough, skip background refresh
                if (age < maxAge) {
                    fetchedRef.current = true;
                    return;
                }
            }
        } catch {
            // Cache read failed, will fetch fresh
        }
    }, [cacheKey, maxAge]);

    // Fetch and cache data
    const fetchData = useCallback(async (token: string, forceRefresh = false) => {
        // If we already have cached data, show it and refresh in background
        if (data && !forceRefresh) {
            setIsRefreshing(true);
        }

        try {
            const freshData = await fetcher(token);
            setData(freshData);
            
            // Save to sessionStorage
            try {
                const entry: CacheEntry<T> = {
                    data: freshData,
                    timestamp: Date.now(),
                };
                sessionStorage.setItem(`page_cache_${cacheKey}`, JSON.stringify(entry));
            } catch {
                // Storage full or unavailable, silently fail
            }
        } catch (err) {
            console.error(`Cache fetch error for ${cacheKey}:`, err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
            fetchedRef.current = true;
        }
    }, [cacheKey, fetcher, data]);

    // Invalidate cache (call after mutations like create/update/delete)
    const invalidateCache = useCallback(() => {
        try {
            sessionStorage.removeItem(`page_cache_${cacheKey}`);
        } catch {
            // Silently fail
        }
    }, [cacheKey]);

    // Update cache directly (for optimistic updates)
    const updateCache = useCallback((newData: T) => {
        setData(newData);
        try {
            const entry: CacheEntry<T> = {
                data: newData,
                timestamp: Date.now(),
            };
            sessionStorage.setItem(`page_cache_${cacheKey}`, JSON.stringify(entry));
        } catch {
            // Silently fail
        }
    }, [cacheKey]);

    return {
        data,
        loading,
        isRefreshing,
        fetchData,
        invalidateCache,
        updateCache,
        hasCachedData: !!data && fetchedRef.current === false,
    };
}
