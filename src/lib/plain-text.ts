import type { ResumeDocument } from '../types/resume';

const clean = (value: string | null | undefined) => (value ?? '').replace(/\r\n?/g, '\n').trim();
const present = (values: Array<string | null | undefined>) => values.map(clean).filter(Boolean);
const heading = (label: string, body: string[]) => { const lines = body.map(clean).filter(Boolean); return lines.length ? [`${label.toUpperCase()}`, ...lines, ''] : []; };

/** Produce a portable, ATS-readable UTF-8 text representation of the resume. */
export function buildResumePlainText(resume: ResumeDocument): string {
  const output: string[] = [];
  const name = clean(resume.personal.fullName);
  const headline = clean(resume.personal.headline);
  if (name) output.push(name.toLocaleUpperCase());
  if (headline) output.push(headline);
  const contacts = present([resume.personal.email, resume.personal.phone, resume.personal.location, resume.personal.website]);
  if (contacts.length) output.push(contacts.join(' | '));
  if (output.length) output.push('');

  output.push(...heading('Professional Summary', [clean(resume.summary)]));
  output.push(...heading('Work Experience', resume.experience.flatMap(item => {
    const role = [clean(item.role), clean(item.company)].filter(Boolean).join(' — ');
    const dates = [clean(item.startDate), item.current ? 'Present' : clean(item.endDate)].filter(Boolean).join(' – ');
    const location = clean(item.location);
    return [
      [role, dates].filter(Boolean).join(' | '),
      ...(location ? [location] : []),
      ...item.bullets.map(clean).filter(Boolean).map(line => `• ${line}`),
      ''
    ].filter((line, index, rows) => line !== '' || index !== rows.length - 1);
  })));
  output.push(...heading('Education', resume.education.flatMap(item => {
    const title = [clean(item.qualification), clean(item.institution)].filter(Boolean).join(' — ');
    const dates = [clean(item.startDate), clean(item.endDate)].filter(Boolean).join(' – ');
    return [title, dates, clean(item.details), ''].filter((line, index, rows) => line !== '' || index !== rows.length - 1);
  })));
  output.push(...heading('Skills', [resume.skills.map(skill => clean(skill.name)).filter(Boolean).join(' • ')]));
  output.push(...heading('Projects', resume.projects.flatMap(item => [clean(item.name), clean(item.description), ''].filter((line, index, rows) => line !== '' || index !== rows.length - 1))));
  output.push(...heading('Certifications', resume.certifications.map(clean).filter(Boolean).map(value => `• ${value}`)));
  output.push(...heading('Languages', present(resume.languages)));
  for (const section of resume.customSections) {
    output.push(...heading(section.title, [clean(section.body)]));
  }
  return `${output.join('\n').trim()}\n`;
}
