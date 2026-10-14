import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { isTauri } from '@tauri-apps/api/core';
import { share } from '@vnidrop/tauri-plugin-share';
import { jsPDF } from 'jspdf';
import { toJpeg, toPng } from 'html-to-image';
import type { ResumeDocument } from '../types/resume';
import { safeFilename } from './storage';

async function downloadBlob(blob: Blob, filename: string) {
  // Android must hand the real file to the native Sharesheet. A WebView download
  // is not a reliable way to create or print a PDF/DOCX on Android.
  if (isTauri() && /Android/i.test(navigator.userAgent)) {
    const file = new File([blob], filename, { type: blob.type || mimeForFilename(filename) });
    await share({ title: filename, files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mimeForFilename(filename: string) {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'txt') return 'text/plain;charset=utf-8';
  return 'application/octet-stream';
}

/**
 * html-to-image rasterizes a DOM subtree through SVG foreignObject. A large
 * negative left offset can clip that subtree and yield a valid but white PDF.
 * Keep the clone at the viewport origin and explicitly make it renderable.
 */
function prepareExportClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const computed = window.getComputedStyle(source);
  for (const property of ['--accent', '--resume-font-size', '--resume-margin', '--resume-font']) {
    const value = computed.getPropertyValue(property).trim();
    if (value) clone.style.setProperty(property, value);
  }
  Object.assign(clone.style, {
    position: 'fixed', left: '0', top: '0', zIndex: '-1', margin: '0',
    transform: 'none', boxShadow: 'none', borderRadius: '0',
    background: '#ffffff', color: '#252a36', overflow: 'visible',
    display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'none',
  });
  clone.style.setProperty('width', '794px', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('min-width', '0', 'important');
  clone.style.setProperty('min-height', '0', 'important');
  clone.style.setProperty('height', 'auto', 'important');
  clone.style.setProperty('max-height', 'none', 'important');
  clone.style.setProperty('aspect-ratio', 'auto', 'important');
  clone.style.setProperty('overflow', 'visible', 'important');
  clone.style.setProperty('box-sizing', 'border-box', 'important');
  clone.querySelectorAll<HTMLElement>('.layout-sidebar, .resume-sidebar-layout, .resume-timeline-layout').forEach(element => {
    element.style.setProperty('min-height', '0', 'important');
    element.style.setProperty('height', 'auto', 'important');
    element.style.setProperty('max-height', 'none', 'important');
    element.style.setProperty('overflow', 'visible', 'important');
  });
  return clone;
}

async function waitForExportLayout(element: HTMLElement): Promise<{ width: number; height: number }> {
  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
  return {
    width: Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width, 794)),
    height: Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height, 100)),
  };
}

function assertRenderedContent(image: HTMLImageElement): void {
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('The resume preview could not be rendered. No PDF was exported.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(image.naturalWidth, 320);
  canvas.height = Math.min(image.naturalHeight, 320);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not validate the rendered resume. No PDF was exported.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let visiblePixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 20 && (pixels[i] < 238 || pixels[i + 1] < 238 || pixels[i + 2] < 238)) {
      if (++visiblePixels >= 12) return;
    }
  }
  throw new Error('The PDF export was stopped because the captured resume appears blank. Reopen the preview and try again.');
}

export async function exportPdf(resume: ResumeDocument) {
  // Build a real text PDF from the resume data. Do not render/capture the preview
  // or embed a PNG/JPEG: selectable text stays sharp at any zoom and is searchable.
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = Math.max(12, Math.min(24, Number(resume.design?.marginMm) || 16));
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  const accent = /^#[0-9a-f]{6}$/i.test(resume.design?.accentColor || '') ? resume.design.accentColor : '#145b73';
  const rgb = [parseInt(accent.slice(1, 3), 16), parseInt(accent.slice(3, 5), 16), parseInt(accent.slice(5, 7), 16)] as const;
  const baseFont = Math.max(8, Math.min(12, Number(resume.design?.fontSize) || 10));
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > bottom) {
      pdf.addPage('a4', 'portrait');
      y = margin;
    }
  };
  const addWrapped = (value: string, options: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gapAfter?: number } = {}) => {
    const text = value.trim();
    if (!text) return;
    const size = options.size ?? baseFont;
    const indent = options.indent ?? 0;
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    const lineHeight = size * 0.42 * (Number(resume.design?.lineSpacing) || 1.25);
    for (const line of lines) {
      ensureSpace(lineHeight);
      if (options.color) pdf.setTextColor(...options.color);
      else pdf.setTextColor(38, 43, 52);
      pdf.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += options.gapAfter ?? 1.2;
  };
  const addSection = (title: string) => {
    if (!title.trim()) return;
    ensureSpace(11);
    y += 2;
    pdf.setDrawColor(...rgb);
    pdf.setLineWidth(0.45);
    pdf.line(margin, y + 1, margin + contentWidth, y + 1);
    y += 5;
    addWrapped(title.toUpperCase(), { size: 10, bold: true, color: [...rgb] as [number, number, number], gapAfter: 2 });
  };
  const addDateLine = (start: string, end: string, current = false) => {
    const date = [start, current ? 'Present' : end].filter(Boolean).join(' – ');
    if (date) addWrapped(date, { size: Math.max(8, baseFont - 1), color: [95, 101, 112], gapAfter: 1 });
  };

  addWrapped(resume.personal.fullName || 'Your Name', { size: 22, bold: true, color: [...rgb] as [number, number, number], gapAfter: 1.5 });
  if (resume.personal.headline) addWrapped(resume.personal.headline, { size: 12, bold: true, gapAfter: 2 });
  const contact = [resume.personal.email, resume.personal.phone, resume.personal.location, resume.personal.website].filter(Boolean).join('  |  ');
  if (contact) addWrapped(contact, { size: 8.5, color: [82, 88, 98], gapAfter: 3 });

  const addSummary = () => { if (resume.summary.trim()) { addSection('Professional Summary'); addWrapped(resume.summary); } };
  const addExperience = () => {
    if (!resume.experience.length) return;
    addSection('Work Experience');
    for (const item of resume.experience) {
      addWrapped([item.role, item.company].filter(Boolean).join(' — '), { bold: true, gapAfter: 0.5 });
      const subline = [item.location, [item.startDate, item.current ? 'Present' : item.endDate].filter(Boolean).join(' – ')].filter(Boolean).join('  |  ');
      if (subline) addWrapped(subline, { size: Math.max(8, baseFont - 1), color: [95, 101, 112], gapAfter: 1 });
      for (const bullet of item.bullets.filter(Boolean)) addWrapped('•  ' + bullet, { indent: 2.5, gapAfter: 0.7 });
      y += 1.5;
    }
  };
  const addEducation = () => {
    if (!resume.education.length) return;
    addSection('Education');
    for (const item of resume.education) {
      addWrapped([item.qualification, item.institution].filter(Boolean).join(' — '), { bold: true, gapAfter: 0.5 });
      addDateLine(item.startDate, item.endDate);
      if (item.details) addWrapped(item.details);
    }
  };
  const addSkills = () => {
    const skills = resume.skills.map(s => s.name).filter(Boolean);
    if (skills.length) { addSection('Skills'); addWrapped(skills.join('  •  ')); }
  };
  const addProjects = () => {
    if (!resume.projects.length) return;
    addSection('Projects');
    for (const item of resume.projects) {
      addWrapped(item.name, { bold: true, gapAfter: 0.5 });
      if (item.description) addWrapped(item.description);
    }
  };
  const addCertifications = () => { if (resume.certifications.length) { addSection('Certifications'); resume.certifications.filter(Boolean).forEach(item => addWrapped('•  ' + item, { indent: 2.5 })); } };
  const addLanguages = () => { if (resume.languages.length) { addSection('Languages'); addWrapped(resume.languages.join('  •  ')); } };
  const addCustom = () => { for (const section of resume.customSections) { if (section.title || section.body) { addSection(section.title || 'Additional Information'); if (section.body) addWrapped(section.body); } } };
  const sectionRenderers: Record<string, () => void> = {
    summary: addSummary, experience: addExperience, education: addEducation, skills: addSkills,
    projects: addProjects, certifications: addCertifications, languages: addLanguages, custom: addCustom,
  };
  const seen = new Set<string>();
  for (const section of resume.sectionOrder || []) {
    if (section in sectionRenderers && !seen.has(section)) {
      seen.add(section);
      sectionRenderers[section]();
    }
  }
  for (const [key, render] of Object.entries(sectionRenderers)) {
    if (!seen.has(key)) render();
  }

  await downloadBlob(pdf.output('blob'), `${safeFilename(resume.title)}.pdf`);
}

export async function exportCoverLetterPdf(letter: string, title = 'Cover Letter') {
  const text = letter.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Write a cover letter before exporting it.');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const left = 20;
  const right = 20;
  const top = 22;
  const bottom = 20;
  const width = 210 - left - right;
  const lines = pdf.splitTextToSize(text, width);
  let y = top;
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  const lineHeight = 5.5;
  for (const line of lines) {
    if (y + lineHeight > 297 - bottom) {
      pdf.addPage('a4', 'portrait');
      y = top;
    }
    pdf.text(line, left, y);
    y += lineHeight;
  }
  await downloadBlob(pdf.output('blob'), `${safeFilename(title)}.pdf`);
}

export async function exportDocx(resume: ResumeDocument) {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ text: resume.personal.fullName || 'Your Name', style: 'Title' }));
  if (resume.personal.headline) children.push(new Paragraph({ text: resume.personal.headline, style: 'Subtitle' }));
  const contact = [resume.personal.email, resume.personal.phone, resume.personal.location, resume.personal.website].filter(Boolean).join(' | ');
  if (contact) children.push(new Paragraph({ children: [new TextRun({ text: contact, color: '555555', size: 18 })] }));
  const heading = (title: string) => children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { before: 220, after: 100 } }));
  if (resume.summary.trim()) { heading('Professional Summary'); children.push(new Paragraph(resume.summary)); }
  if (resume.experience.length) {
    heading('Work Experience');
    for (const item of resume.experience) {
      children.push(new Paragraph({ children: [new TextRun({ text: item.role, bold: true }), new TextRun({ text: ` — ${item.company}`, italics: true })] }));
      const dates = `${item.startDate || ''} – ${item.current ? 'Present' : item.endDate || ''}`;
      if (dates.trim() !== '–') children.push(new Paragraph({ children: [new TextRun({ text: dates, color: '666666', size: 18 })] }));
      for (const bullet of item.bullets.filter(Boolean)) children.push(new Paragraph({ text: bullet, bullet: { level: 0 }, spacing: { after: 50 } }));
    }
  }
  if (resume.education.length) { heading('Education'); for (const item of resume.education) { children.push(new Paragraph({ children: [new TextRun({ text: item.qualification, bold: true }), new TextRun({ text: ` — ${item.institution}` })] })); if (item.details) children.push(new Paragraph(item.details)); } }
  if (resume.skills.length) { heading('Skills'); children.push(new Paragraph(resume.skills.map(s => s.name).filter(Boolean).join(' • '))); }
  if (resume.projects.length) { heading('Projects'); for (const item of resume.projects) { children.push(new Paragraph({ children: [new TextRun({ text: item.name, bold: true })] })); if (item.description) children.push(new Paragraph(item.description)); } }
  if (resume.certifications.length) { heading('Certifications'); for (const item of resume.certifications) children.push(new Paragraph({ text: item, bullet: { level: 0 } })); }
  if (resume.languages.length) { heading('Languages'); children.push(new Paragraph(resume.languages.join(' • '))); }
  for (const section of resume.customSections) { heading(section.title); if (section.body) children.push(new Paragraph(section.body)); }
  const doc = new Document({ creator: 'CV Maker', title: resume.title, description: 'Offline CV Maker export', sections: [{ properties: { page: { margin: { top: 720, right: 850, bottom: 720, left: 850 } } }, children }] });
  await downloadBlob(await Packer.toBlob(doc), `${safeFilename(resume.title)}.docx`);
}

export async function exportPreviewImage(format: 'png' | 'jpg' = 'png', filename = 'resume') {
  const source = document.querySelector<HTMLElement>('.resume-paper');
  if (!source) throw new Error('Resume preview is not available. Open the resume editor first.');
  const clone = prepareExportClone(source);
  document.body.appendChild(clone);
  try {
    const dimensions = await waitForExportLayout(clone);
    const options = {
      width: dimensions.width,
      height: dimensions.height,
      pixelRatio: 2,
      cacheBust: false,
      backgroundColor: '#ffffff',
      skipAutoScale: false,
    };
    const dataUrl = format === 'png' ? await toPng(clone, options) : await toJpeg(clone, { ...options, quality: 0.96 });
    const [meta, encoded] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] ?? (format === 'png' ? 'image/png' : 'image/jpeg');
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await downloadBlob(new Blob([bytes], { type: mime }), `${safeFilename(filename)}.${format}`);
  } finally {
    clone.remove();
  }
}

export async function exportCoverLetterDocx(letter: string, title = 'Cover Letter') {
  const text = letter.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Write a cover letter before exporting it.');
  const paragraphs = text.split(/\n\s*\n/).map(block => new Paragraph({
    children: block.split('\n').map((line, index) => new TextRun({ text: line, break: index > 0 ? 1 : 0 })),
    spacing: { after: 180, line: 360 },
  }));
  const doc = new Document({
    creator: 'CV Maker',
    title,
    description: 'Offline cover letter export',
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: paragraphs }],
  });
  await downloadBlob(await Packer.toBlob(doc), `${safeFilename(title)}.docx`);
}
