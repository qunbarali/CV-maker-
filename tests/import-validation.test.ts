import { describe, expect, it } from 'vitest';
import { createStarterResume } from '../src/types/resume';
import { normalizeResumeBackup } from '../src/lib/import-validation';

describe('resume backup normalization', () => {
  it('rejects non-resume files with a helpful message', () => {
    expect(() => normalizeResumeBackup({ hello: 'world' }, createStarterResume())).toThrow(/personal details are missing/i);
  });

  it('accepts an exported backup envelope and assigns a fresh document identity', () => {
    const starter = createStarterResume();
    const imported = normalizeResumeBackup({ schemaVersion: 1, document: { ...starter, id: 'source-id', title: 'Imported CV' } }, starter);
    expect(imported.title).toBe('Imported CV');
    expect(imported.id).not.toBe('source-id');
    expect(imported.personal.fullName).toBe(starter.personal.fullName);
  });

  it('normalizes missing legacy collections and ignores malformed entries', () => {
    const imported = normalizeResumeBackup({ personal: { fullName: 'Taylor' }, experience: [null, { role: 'Engineer', bullets: ['Built tools', 42] }] }, createStarterResume());
    expect(imported.personal.fullName).toBe('Taylor');
    expect(imported.experience).toHaveLength(1);
    expect(imported.experience[0].bullets).toEqual(['Built tools']);
    expect(imported.education).toEqual([]);
    expect(imported.design.density).toBe('balanced');
  });

  it('bounds design values and discards unsafe color/photo data', () => {
    const starter = createStarterResume();
    const imported = normalizeResumeBackup({
      personal: { photoDataUrl: 'javascript:alert(1)', photoPositionX: 999 },
      design: { accentColor: 'red', fontSize: 500, lineSpacing: 0, marginMm: 500 },
    }, starter);
    expect(imported.personal.photoDataUrl).toBeUndefined();
    expect(imported.personal.photoPositionX).toBe(100);
    expect(imported.design.accentColor).toBe(starter.design.accentColor);
    expect(imported.design.fontSize).toBe(12);
    expect(imported.design.lineSpacing).toBe(1);
    expect(imported.design.marginMm).toBe(24);
  });

  it('filters invalid section names and duplicate section entries', () => {
    const imported = normalizeResumeBackup({ personal: {}, sectionOrder: ['summary', 'summary', 'not-a-section', 'skills'] }, createStarterResume());
    expect(imported.sectionOrder).toEqual(['summary', 'skills']);
  });
});
