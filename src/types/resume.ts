export type SectionKind = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages' | 'awards' | 'custom';
export interface ExperienceItem { id: string; role: string; company: string; location: string; startDate: string; endDate: string; current: boolean; bullets: string[] }
export interface EducationItem { id: string; institution: string; qualification: string; startDate: string; endDate: string; details: string }
export interface SkillItem { id: string; name: string; level: number }
export interface ResumeDocument {
  id: string; title: string; version: string; language: string; templateId: string;
  personal: { fullName: string; headline: string; email: string; phone: string; location: string; website: string; photoDataUrl?: string; photoPositionX?: number; photoPositionY?: number; photoFilter?: 'none' | 'grayscale' | 'warm' | 'contrast' };
  summary: string; experience: ExperienceItem[]; education: EducationItem[]; skills: SkillItem[];
  projects: Array<{ id: string; name: string; description: string }>;
  certifications: string[]; languages: string[]; sectionOrder: SectionKind[];
  customSections: Array<{ id: string; title: string; body: string }>;
  design: { accentColor: string; fontFamily: string; fontSize: number; lineSpacing: number; marginMm: number; density: 'compact' | 'balanced' | 'spacious' };
  updatedAt: string;
}
export const createStarterResume = (): ResumeDocument => ({
  id: crypto.randomUUID(), title: 'Product Designer Resume', version: 'General', language: 'en', templateId: 'modern-editorial',
  personal: { fullName: 'Alex Morgan', headline: 'Product Designer · UX Strategist', email: 'alex.morgan@email.com', phone: '+1 555 012 3489', location: 'Brooklyn, New York', website: 'alexmorgan.design' },
  summary: 'Product designer with 6+ years turning complex problems into clear, human-centered digital experiences. I partner across research, product and engineering to ship thoughtful work that improves customer outcomes.',
  experience: [
    { id: crypto.randomUUID(), role: 'Senior Product Designer', company: 'Northstar Labs', location: 'New York, NY', startDate: '2022-03', endDate: '', current: true, bullets: ['Led the redesign of a core onboarding journey, improving activation by 24%.', 'Built a shared component library used by 4 product teams across web and mobile.', 'Partnered with research and engineering to validate concepts through weekly usability sessions.'] },
    { id: crypto.randomUUID(), role: 'Product Designer', company: 'Fieldwork Studio', location: 'Remote', startDate: '2019-06', endDate: '2022-02', current: false, bullets: ['Delivered end-to-end experiences for B2B and consumer products from discovery to launch.', 'Simplified a complex reporting workflow, reducing time-to-completion by 30%.'] }
  ],
  education: [{ id: crypto.randomUUID(), institution: 'Parsons School of Design', qualification: 'BFA, Communication Design', startDate: '2015-09', endDate: '2019-05', details: 'Graduated with honors' }],
  skills: [{ id: crypto.randomUUID(), name: 'Product strategy', level: 90 }, { id: crypto.randomUUID(), name: 'Interaction design', level: 95 }, { id: crypto.randomUUID(), name: 'Prototyping', level: 88 }, { id: crypto.randomUUID(), name: 'Design systems', level: 86 }, { id: crypto.randomUUID(), name: 'User research', level: 82 }],
  projects: [{ id: crypto.randomUUID(), name: 'Open banking dashboard', description: 'Designed a clear, accessible financial overview for first-time investors.' }], certifications: ['Google UX Design Certificate'], languages: ['English — Native', 'Spanish — Conversational'], sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages'], customSections: [],
  design: { accentColor: '#6658d3', fontFamily: 'Inter, Arial, sans-serif', fontSize: 10, lineSpacing: 1.35, marginMm: 15, density: 'balanced' }, updatedAt: new Date().toISOString()
});
