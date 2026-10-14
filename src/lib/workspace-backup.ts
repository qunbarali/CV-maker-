import type { SavedResume } from './storage';

const MAX_WORKSPACE_DOCUMENTS = 500;

/** Produce a stable content signature independent of generated IDs and edit timestamps. */
function canonicalContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalContent);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).filter(key => key !== 'id' && key !== 'updatedAt')
      .sort().map(key => [key, canonicalContent(record[key])]));
  }
  return value;
}

/** Merge a restored workspace without silently dropping existing documents.
 * Identical resume content is deduplicated independent of generated IDs/timestamps,
 * including IDs on nested experience/education/skill entries; distinct revisions remain.
 */
export function mergeWorkspaceDocuments(
  imported: SavedResume[],
  existing: SavedResume[],
  maxDocuments = MAX_WORKSPACE_DOCUMENTS,
): SavedResume[] {
  const merged: SavedResume[] = [];
  const signatures = new Set<string>();

  for (const item of [...imported, ...existing]) {
    const signature = JSON.stringify(canonicalContent(item.document));
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    merged.push(item);
  }

  if (merged.length > maxDocuments) {
    throw new Error(`Restoring this backup would exceed the ${maxDocuments}-CV limit. Export a backup, remove some CVs, and try again.`);
  }

  return merged;
}
