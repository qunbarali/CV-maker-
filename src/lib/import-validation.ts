import type { ResumeDocument, SectionKind } from '../types/resume';

const SECTION_KINDS: SectionKind[] = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'custom'];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const stringValue = (value: unknown, fallback = ''): string => typeof value === 'string' ? value.slice(0, 20_000) : fallback;
const stringArray = (value: unknown, fallback: string[] = []): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500).map(item => item.slice(0, 20_000)) : fallback;
const idValue = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : crypto.randomUUID();
const boundedNumber = (value: unknown, fallback: number, min: number, max: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Validate and safely normalize a portable backup while preserving older, partial backups. */
export function normalizeResumeBackup(value: unknown, starter: ResumeDocument): ResumeDocument {
  const input = isRecord(value) && 'document' in value ? value.document : value;
  if (!isRecord(input) || !isRecord(input.personal)) {
    throw new Error('This file does not look like a CV Maker backup: personal details are missing.');
  }
  const source = input;
  const personalInput = input.personal;
  const designInput = isRecord(input.design) ? input.design : {};
  const density = designInput.density;
  const sectionOrder = Array.isArray(input.sectionOrder)
    ? [...new Set(input.sectionOrder.filter((item): item is SectionKind => typeof item === 'string' && SECTION_KINDS.includes(item as SectionKind)))]
    : [...starter.sectionOrder];

  const experience = (Array.isArray(input.experience) ? input.experience : []).filter(isRecord).slice(0, 500).map(item => ({
    id: idValue(item.id), role: stringValue(item.role), company: stringValue(item.company), location: stringValue(item.location),
    startDate: stringValue(item.startDate), endDate: stringValue(item.endDate), current: typeof item.current === 'boolean' ? item.current : false,
    bullets: stringArray(item.bullets),
  }));
  const education = (Array.isArray(input.education) ? input.education : []).filter(isRecord).slice(0, 500).map(item => ({
    id: idValue(item.id), institution: stringValue(item.institution), qualification: stringValue(item.qualification),
    startDate: stringValue(item.startDate), endDate: stringValue(item.endDate), details: stringValue(item.details),
  }));
  const skills = (Array.isArray(input.skills) ? input.skills : []).filter(isRecord).slice(0, 500).map(item => ({
    id: idValue(item.id), name: stringValue(item.name), level: boundedNumber(item.level, 50, 0, 100),
  }));
  const projects = (Array.isArray(input.projects) ? input.projects : []).filter(isRecord).slice(0, 500).map(item => ({
    id: idValue(item.id), name: stringValue(item.name), description: stringValue(item.description),
  }));
  const customSections = (Array.isArray(input.customSections) ? input.customSections : []).filter(isRecord).slice(0, 100).map(item => ({
    id: idValue(item.id), title: stringValue(item.title, 'Custom section').slice(0, 300), body: stringValue(item.body),
  }));
  const color = stringValue(designInput.accentColor, starter.design.accentColor);
  const accentColor = /^#[0-9a-f]{6}$/i.test(color) ? color : starter.design.accentColor;
  const allowedPhotoFilters = ['none', 'grayscale', 'warm', 'contrast'] as const;
  const photoFilter = allowedPhotoFilters.includes(personalInput.photoFilter as typeof allowedPhotoFilters[number]) ? personalInput.photoFilter as typeof allowedPhotoFilters[number] : undefined;

  return {
    ...starter,
    id: crypto.randomUUID(),
    title: stringValue(source.title, starter.title).trim().slice(0, 160) || starter.title,
    version: stringValue(source.version, starter.version).slice(0, 160),
    language: stringValue(source.language, starter.language).slice(0, 20),
    templateId: stringValue(source.templateId, starter.templateId).slice(0, 160) || starter.templateId,
    personal: {
      fullName: stringValue(personalInput.fullName), headline: stringValue(personalInput.headline), email: stringValue(personalInput.email),
      phone: stringValue(personalInput.phone), location: stringValue(personalInput.location), website: stringValue(personalInput.website),
      ...(typeof personalInput.photoDataUrl === 'string' && personalInput.photoDataUrl.startsWith('data:image/') && personalInput.photoDataUrl.length <= 5_000_000 ? { photoDataUrl: personalInput.photoDataUrl } : {}),
      ...(typeof personalInput.photoPositionX === 'number' ? { photoPositionX: boundedNumber(personalInput.photoPositionX, 50, 0, 100) } : {}),
      ...(typeof personalInput.photoPositionY === 'number' ? { photoPositionY: boundedNumber(personalInput.photoPositionY, 50, 0, 100) } : {}),
      ...(photoFilter ? { photoFilter } : {}),
    },
    summary: stringValue(source.summary), experience, education, skills, projects,
    certifications: stringArray(source.certifications), languages: stringArray(source.languages), sectionOrder,
    customSections,
    design: {
      accentColor,
      fontFamily: stringValue(designInput.fontFamily, starter.design.fontFamily).slice(0, 200),
      fontSize: boundedNumber(designInput.fontSize, starter.design.fontSize, 8, 12),
      lineSpacing: boundedNumber(designInput.lineSpacing, starter.design.lineSpacing, 1, 2.5),
      marginMm: boundedNumber(designInput.marginMm, starter.design.marginMm, 8, 24),
      density: density === 'compact' || density === 'balanced' || density === 'spacious' ? density : starter.design.density,
    },
    updatedAt: new Date().toISOString(),
  };
}
