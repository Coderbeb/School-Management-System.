import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Common honorific prefixes to strip when generating initials
const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'smt', 'shri', 'shrimati', 'sri',
  'md', 'mst', 'master', 'miss', 'mx', 'er', 'ca', 'advocate', 'adv'
]);

/**
 * Strips honorific prefixes from a name part.
 * e.g., "Mr." → true (should skip), "Rahul" → false (keep)
 */
function isHonorific(word: string): boolean {
  return HONORIFICS.has(word.replace(/\./g, '').toLowerCase());
}

/**
 * Get initials from firstName + lastName, skipping honorifics.
 * "Mr. Rahul" + "Kumar" → "RK"
 * "Dr. Neha" + "Singh" → "NS"
 * "Ranjeet"  + "Kumar" → "RK"
 */
export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const allParts = `${firstName || ''} ${lastName || ''}`.trim().split(/\s+/).filter(Boolean);
  const meaningful = allParts.filter(w => !isHonorific(w));

  // Use meaningful parts if available, otherwise fall back to original
  const parts = meaningful.length > 0 ? meaningful : allParts;

  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
