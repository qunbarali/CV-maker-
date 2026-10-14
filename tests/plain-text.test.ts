import { describe, expect, it } from 'vitest';
import { createStarterResume } from '../src/types/resume';
import { buildResumePlainText } from '../src/lib/plain-text';

describe('ATS-readable plain-text export', () => {
  it('includes contact details and core resume sections without HTML', () => {
    const resume = createStarterResume();
    const text = buildResumePlainText(resume);
    expect(text).toContain('ALEX MORGAN');
    expect(text).toContain(resume.personal.email);
    expect(text).toContain('PROFESSIONAL SUMMARY');
    expect(text).toContain('WORK EXPERIENCE');
    expect(text).toContain('EDUCATION');
    expect(text).toContain('SKILLS');
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('omits blank optional sections and trims whitespace', () => {
    const resume = createStarterResume();
    resume.personal.fullName = '  Example Person  ';
    resume.personal.email = '';
    resume.summary = '   ';
    resume.experience = [];
    resume.education = [];
    resume.skills = [];
    resume.projects = [];
    resume.certifications = [];
    resume.languages = [];
    const text = buildResumePlainText(resume);
    expect(text).toContain('EXAMPLE PERSON');
    expect(text).not.toContain('PROFESSIONAL SUMMARY');
    expect(text).not.toContain('WORK EXPERIENCE');
    expect(text).not.toContain('EDUCATION');
  });
});
