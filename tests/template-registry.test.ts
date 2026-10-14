import { describe, expect, it } from 'vitest';
import { templates } from '../src/templates/registry';

describe('template registry', () => {
  it('contains 30 uniquely identified template definitions', () => {
    expect(templates).toHaveLength(30);
    expect(new Set(templates.map(t => t.id)).size).toBe(30);
  });
  it('provides metadata for every template', () => {
    for (const template of templates) {
      expect(template.name.length).toBeGreaterThan(2);
      expect(template.description.length).toBeGreaterThan(5);
      expect(template.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
