import { describe, expect, it } from 'vitest';
import { createStarterResume } from '../src/types/resume';
import type { SavedResume } from '../src/lib/storage';
import { mergeWorkspaceDocuments } from '../src/lib/workspace-backup';

const starter = createStarterResume();

function saved(title: string, fullName: string, summary: string, id: string): SavedResume {
  const document = { ...starter, personal: { ...starter.personal } };
  document.id = id;
  document.title = title;
  document.personal.fullName = fullName;
  document.summary = summary;
  return { id, title, updatedAt: `2026-10-14T00:00:0${id.length}Z`, document };
}

describe('workspace backup restore merge', () => {
  it('deduplicates identical resume content independent of IDs and timestamps', () => {
    const first = saved('Designer CV', 'Taylor', 'Built products', 'one');
    const duplicate = saved('Designer CV', 'Taylor', 'Built products', 'two');
    expect(mergeWorkspaceDocuments([first], [duplicate])).toHaveLength(1);
  });

  it('preserves distinct versions even when title and name match', () => {
    const original = saved('Designer CV', 'Taylor', 'Built products', 'one');
    const revised = saved('Designer CV', 'Taylor', 'Led a redesign', 'two');
    expect(mergeWorkspaceDocuments([revised], [original])).toHaveLength(2);
  });

  it('refuses to exceed the limit rather than silently deleting existing documents', () => {
    const first = saved('CV one', 'Taylor', 'First', 'one');
    const second = saved('CV two', 'Taylor', 'Second', 'two');
    expect(() => mergeWorkspaceDocuments([first, second], [], 1)).toThrow(/exceed the 1-CV limit/i);
  });
});
