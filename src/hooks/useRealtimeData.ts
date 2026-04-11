'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseRealtimeDataOptions {
    /** Which database tables to watch for changes */
    tables: string[];
    /** Callback fired when a watched table changes */
    onTableChange: (table: string) => void;
    /** Whether to enable the real-time connection (default: true) */
    enabled?: boolean;
    /** Debounce delay in ms to batch rapid changes (default: 400ms) */
    debounceMs?: number;
}

/**
 * React hook for real-time data updates via Server-Sent Events.
 * 
 * Connects to `/api/realtime` and listens for PostgreSQL NOTIFY events.
 * When a watched table changes, it calls the provided `onTableChange` callback
 * (typically used to re-fetch data from the API).
 * 
 * Features:
 * - Debounced: rapid successive changes are batched
 * - Auto-reconnects on errors (native EventSource behavior)
 * - Cleans up on unmount
 * - Skips self-triggered events via a brief ignore window
 * 
 * @example
 * ```tsx
 * useRealtimeData({
 *   tables: ['students', 'departments'],
 *   onTableChange: () => {
 *     fetchStudents(token);
 *     fetchDepartments(token);
 *   }
 * });
 * ```
 */
export function useRealtimeData({
    tables,
    onTableChange,
    enabled = true,
    debounceMs = 400,
}: UseRealtimeDataOptions) {
    const onTableChangeRef = useRef(onTableChange);
    onTableChangeRef.current = onTableChange;

    const tablesRef = useRef(tables);
    tablesRef.current = tables;

    // Track pending debounce timers per table
    const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Self-mutation ignore window: when we trigger a mutation ourselves,
    // we briefly ignore incoming SSE events for that table to avoid double-refresh
    const ignoredTablesRef = useRef<Set<string>>(new Set());

    const cleanup = useCallback(() => {
        debounceTimers.current.forEach((timer) => clearTimeout(timer));
        debounceTimers.current.clear();
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let eventSource: EventSource | null = null;

        const connect = () => {
            eventSource = new EventSource('/api/realtime');

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Skip connection/keepalive messages
                    if (data.type === 'connected' || data.type === 'error') return;

                    const changedTable = data.table;
                    if (!changedTable) return;

                    // Check if this table is in our watch list
                    if (!tablesRef.current.includes(changedTable)) return;

                    // Check if we should ignore this (self-mutation)
                    if (ignoredTablesRef.current.has(changedTable)) return;

                    // Debounce: clear existing timer for this table
                    const existing = debounceTimers.current.get(changedTable);
                    if (existing) clearTimeout(existing);

                    const timer = setTimeout(() => {
                        debounceTimers.current.delete(changedTable);
                        onTableChangeRef.current(changedTable);
                    }, debounceMs);

                    debounceTimers.current.set(changedTable, timer);
                } catch {
                    // Ignore parse errors (e.g., keep-alive comments)
                }
            };

            eventSource.onerror = () => {
                // EventSource auto-reconnects, but we should clean up timers
                cleanup();
            };
        };

        connect();

        return () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            cleanup();
        };
    }, [enabled, debounceMs, cleanup]);

    /**
     * Call this before making a mutation to temporarily ignore
     * SSE events for the given tables (prevents double-refresh).
     * The ignore window lasts 2 seconds.
     */
    const ignoreSelfMutation = useCallback((tableNames: string[]) => {
        tableNames.forEach((t) => {
            ignoredTablesRef.current.add(t);
            setTimeout(() => {
                ignoredTablesRef.current.delete(t);
            }, 2000);
        });
    }, []);

    return { ignoreSelfMutation };
}
