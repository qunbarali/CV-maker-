import { describe, expect, it } from 'vitest';
import { isDatabaseHealthy, safeFilename, type DatabaseHealth } from '../src/lib/storage';

describe('safe export filenames', () => {
  it('removes path separators and unsupported characters', () => {
    expect(safeFilename('../my resume: final')).toBe('my-resume-final');
  });

  it('limits filename length and supplies a fallback for empty titles', () => {
    expect(safeFilename('   ')).toBe('resume');
    expect(safeFilename('a'.repeat(100))).toHaveLength(70);
  });
});


describe('database health validation', () => {
  const healthy: DatabaseHealth = { integrity: 'ok', schemaVersion: 1, resumeCount: 3, settingsCount: 2 };

  it('accepts a valid SQLite health report', () => {
    expect(isDatabaseHealthy(healthy)).toBe(true);
  });

  it('rejects integrity errors, unknown schemas and invalid counts', () => {
    expect(isDatabaseHealthy({ ...healthy, integrity: 'corrupt' })).toBe(false);
    expect(isDatabaseHealthy({ ...healthy, schemaVersion: 0 })).toBe(false);
    expect(isDatabaseHealthy({ ...healthy, schemaVersion: 1.5 })).toBe(false);
    expect(isDatabaseHealthy({ ...healthy, resumeCount: -1 })).toBe(false);
    expect(isDatabaseHealthy(null)).toBe(false);
  });
});
