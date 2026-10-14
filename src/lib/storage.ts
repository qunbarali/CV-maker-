import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ResumeDocument } from '../types/resume';
const KEY = 'cv-maker.documents.v1';
let nativeWriteQueue: Promise<void> = Promise.resolve();

/** Serialize SQLite mutations and preserve failures so callers can show an honest save status. */
function queueNativeWrite(command: string, args: Record<string, unknown>): Promise<void> {
  const operation = nativeWriteQueue.catch(() => undefined).then(() => invoke(command, args)).then(() => undefined);
  nativeWriteQueue = operation;
  return operation;
}

export async function flushStorageWrites(): Promise<void> {
  await nativeWriteQueue;
}
export interface SavedResume { id: string; title: string; updatedAt: string; document: ResumeDocument }

export interface DatabaseHealth {
  integrity: string;
  schemaVersion: number;
  resumeCount: number;
  settingsCount: number;
}

/** Check the native SQLite database without modifying stored documents. */
export async function checkDatabaseHealth(): Promise<DatabaseHealth | null> {
  if (!isTauri()) return null;
  return invoke<DatabaseHealth>('database_health');
}

export function isDatabaseHealthy(health: DatabaseHealth | null): boolean {
  return health !== null && health.integrity === 'ok' && Number.isSafeInteger(health.schemaVersion) && health.schemaVersion >= 1 &&
    Number.isSafeInteger(health.resumeCount) && health.resumeCount >= 0 &&
    Number.isSafeInteger(health.settingsCount) && health.settingsCount >= 0;
}


function validSavedResumes(value: unknown): SavedResume[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SavedResume => Boolean(item && typeof item === 'object' &&
    typeof item.id === 'string' && typeof item.title === 'string' && typeof item.updatedAt === 'string' &&
    item.document && typeof item.document === 'object' && typeof item.document.id === 'string'));
}

export function loadResumes(): SavedResume[] {
  try { const raw = localStorage.getItem(KEY); if (!raw) return []; return validSavedResumes(JSON.parse(raw)); }
  catch { return []; }
}

/** Desktop builds use the app-data SQLite database; the browser preview keeps a localStorage fallback. */
export async function loadResumesDurable(): Promise<SavedResume[]> {
  if (!isTauri()) return loadResumes();

  // Native SQLite is authoritative in the desktop app. Never silently fall back to
  // localStorage here: a later save could otherwise overwrite a valid database with
  // an old browser cache after a transient SQLite read failure.
  const native = await invoke<unknown>('load_resumes');
  if (!Array.isArray(native)) throw new Error('The local CV database returned an invalid document list.');
  const parsed: SavedResume[] = [];
  for (const item of native) {
    if (!item || typeof item !== 'object') throw new Error('The local CV database contains an invalid saved document.');
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' ||
        typeof candidate.updatedAt !== 'string' || !candidate.document || typeof candidate.document !== 'object' ||
        Array.isArray(candidate.document) || typeof (candidate.document as Record<string, unknown>).id !== 'string') {
      throw new Error('The local CV database contains an incomplete saved document. No data was replaced.');
    }
    const document = candidate.document as ResumeDocument;
    if (candidate.id !== document.id) throw new Error('A saved document has mismatched identifiers. No data was replaced.');
    parsed.push({ id: candidate.id, title: candidate.title, updatedAt: candidate.updatedAt, document });
  }
  try { localStorage.setItem(KEY, JSON.stringify(parsed)); } catch { /* SQLite remains the source of truth on desktop. */ }
  return parsed;
}

export function saveResumes(resumes: SavedResume[]): Promise<void> {
  let browserStorageError: unknown;
  try { localStorage.setItem(KEY, JSON.stringify(resumes)); } catch (error) { browserStorageError = error; }
  if (isTauri()) return queueNativeWrite('replace_resumes', { resumes });
  return browserStorageError ? Promise.reject(browserStorageError) : Promise.resolve();
}

export function saveSetting(key: string, value: string): Promise<void> {
  let browserStorageError: unknown;
  try { localStorage.setItem(key, value); } catch (error) { browserStorageError = error; }
  if (isTauri()) return queueNativeWrite('save_setting', { key, value });
  return browserStorageError ? Promise.reject(browserStorageError) : Promise.resolve();
}

export async function loadSetting(key: string): Promise<string | null> {
  if (isTauri()) {
    // A missing native setting is a real null, not permission to restore a possibly
    // stale browser value over it. Native read failures must be visible to the caller.
    const value = await invoke<string | null>('load_setting', { key });
    if (value === null) {
      try { localStorage.removeItem(key); } catch { /* SQLite remains authoritative. */ }
    } else {
      try { localStorage.setItem(key, value); } catch { /* SQLite remains authoritative. */ }
    }
    return value;
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

export function downloadJson(document: ResumeDocument): void {
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), document }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = Object.assign(window.document.createElement('a'), { href: url, download: `${safeFilename(document.title)}.json` }); a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeFilename(name: string): string { return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'resume'; }
