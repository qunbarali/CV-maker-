import { describe, expect, it } from 'vitest';
import { analyzeJobKeywords } from '../src/lib/ats';

describe('offline keyword analysis', () => {
  it('returns no terms for an empty job description', () => {
    expect(analyzeJobKeywords('', 'React TypeScript')).toEqual([]);
  });
  it('marks matching terms and phrases', () => {
    const results = analyzeJobKeywords('We need project management and customer service skills', 'Project management, customer support, and reporting');
    expect(results.find(x => x.word === 'management')?.found).toBe(true);
    expect(results.find(x => x.word === 'project management')?.found).toBe(true);
    expect(results.find(x => x.word === 'customer service')?.found).toBe(true);
  });
});
