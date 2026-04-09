import { useEffect, useState } from 'react';

/**
 * Hook that fetches batch config from settings and returns
 * only the active semesters (ones the admin hasn't cleared).
 * Also provides getBatchLabel() for displaying batch year ranges.
 *
 * If no config exists yet, all 8 semesters are shown (default).
 * If config exists but a semester has `null` value, it's hidden.
 */
export function useActiveSemesters() {
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number | null>>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/settings/batch-config', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setBatchConfig(data.mappings || {});
                }
            } catch (err) {
                console.error('Error fetching batch config:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    /**
     * Get active semesters for a given dept type.
     * If no config saved for this type, return all 8.
     * If config exists, return only semesters with non-null values.
     */
    const getActiveSemesters = (type?: string): number[] => {
        const allSemesters = [1, 2, 3, 4, 5, 6, 7, 8];

        if (!type) {
            // No dept type specified — check ALL dept type configs
            // A semester is active if it's active in ANY dept type config
            const configKeys = Object.keys(batchConfig);
            if (configKeys.length === 0) return allSemesters;

            return allSemesters.filter(sem => {
                return configKeys.some(key => {
                    const mappings = batchConfig[key];
                    if (!mappings || Object.keys(mappings).length === 0) return true;
                    const val = mappings[sem.toString()];
                    return val !== null && val !== undefined;
                });
            });
        }

        const mappings = batchConfig[type];
        // No config for this type yet — show all
        if (!mappings || Object.keys(mappings).length === 0) return allSemesters;
        // Filter to only semesters that have a non-null batch year
        return allSemesters.filter(sem => {
            const val = mappings[sem.toString()];
            return val !== null && val !== undefined;
        });
    };

    /**
     * Get a batch label like "2025-29" for a given semester and dept type.
     * Falls back to dynamic calculation if no saved config exists.
     */
    const getBatchLabel = (sem: number, deptType?: string): string | null => {
        if (deptType) {
            // Check saved config first
            const savedMappings = batchConfig[deptType];
            if (savedMappings && savedMappings[sem.toString()]) {
                const batchStart = savedMappings[sem.toString()] as number;
                const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
                const batchEnd = (batchStart + duration) % 100;
                return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
            }
        }

        // Fallback: calculate from current date
        const now = new Date();
        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const yearOffset = Math.floor((sem - 1) / 2);
        const batchStart = academicStartYear - yearOffset;
        const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
        const batchEnd = (batchStart + duration) % 100;
        return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
    };

    return {
        getActiveSemesters,
        getBatchLabel,
        batchConfig,
        loading,
    };
}
