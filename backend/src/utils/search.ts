/**
 * Search utilities - Simple Unicode normalization
 */

/**
 * Normalizes text by removing diacritics using built-in JavaScript normalization
 * This handles ALL Unicode characters systematically (no hand-coding needed)
 *
 * Examples:
 * - "JAŽ-Z" → "jaz-z"
 * - "Björk" → "bjork"
 * - "Mötley Crüe" → "motley crue"
 * - "café" → "cafe"
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')                    // Decompose: "ž" → "z" + "ˇ"
    .replace(/[\u0300-\u036f]/g, '')    // Remove ALL combining marks
    .toLowerCase();
}

/**
 * Split query into search terms
 */
export function prepareSearchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(t => t.length > 0);
}

/**
 * Create search parameters for a term
 */
export function createSearchParams(term: string) {
  return {
    searchTerm: `%${term}%`,
    normalizedTerm: `%${normalizeText(term)}%`
  };
}

/**
 * Check if term looks like a year
 */
export function isYearTerm(term: string): boolean {
  const year = parseInt(term);
  return !isNaN(year) && year > 1000 && year < 3000;
}
