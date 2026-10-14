import type { SavedResume } from './storage';

const MAX_WORKSPACE_DOCUMENTS = 500;

/** Merge a restored workspace without silently dropping existing documents.
 * Identical resume content is deduplicated independent of generated IDs/timestamps;
 * distinct versions with the same title/name are retained.
 */
export function mergeWorkspaceDocuments(
  imported: SavedResume[],
  existing: SavedResume[],
  maxDocuments = MAX_WORKSPACE_DOCUMENTS,
): SavedResume[] {
  const merged: SavedResume[] = [];
  const signatures = new Set<string>();

  for (const item of [...imported, ...existing]) {
    const document = { ...item.document, id: '', updatedAt: '' };
    const signature = JSON.stringify(document);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    merged.push(item);
  }

  if (merged.length > maxDocuments) {
    throw new Error(`Restoring this backup would exceed the ${maxDocuments}-CV limit. Export a backup, remove some CVs, and try again.`);
  }

  return merged;
}
