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

export async function exportPdf(resume: ResumeDocument) {
  const node = document.querySelector<HTMLElement>('.resume-paper');
  if (!node) throw new Error('Resume preview is not available. Open the resume editor first.');
  const dataUrl = await toPng(node, {
    pixelRatio: 1.5,
    cacheBust: false,
    backgroundColor: '#ffffff',
    skipAutoScale: false,
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render the resume preview for PDF export.'));
    img.src = dataUrl;
  });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const margin = 10;
  const pageWidth = 210 - margin * 2;
  const pageHeight = 297 - margin * 2;
  const pagePixelHeight = Math.max(1, Math.floor(image.width * pageHeight / pageWidth));
  const pageCount = Math.max(1, Math.ceil(image.height / pagePixelHeight));
  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage('a4', 'portrait');
    // Crop each page slice before embedding it so page boundaries do not overlap.
    const sourceY = page * pagePixelHeight;
    const sliceHeight = Math.min(pagePixelHeight, image.height - sourceY);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = sliceHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare a page for PDF export.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, sourceY, image.width, sliceHeight, 0, 0, image.width, sliceHeight);
    const pageImage = canvas.toDataURL('image/png');
    const sliceHeightMm = pageWidth * sliceHeight / image.width;
    pdf.addImage(pageImage, 'PNG', margin, margin, pageWidth, sliceHeightMm, undefined, 'FAST');
  }
  const filename = `${safeFilename(resume.title)}.pdf`;
  await downloadBlob(pdf.output('blob'), filename);
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
  const node = document.querySelector<HTMLElement>('.resume-paper');
  if (!node) throw new Error('Resume preview is not available. Open the resume editor first.');
  const options = { pixelRatio: 2, cacheBust: false, backgroundColor: '#ffffff', skipAutoScale: false };
  const dataUrl = format === 'png' ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.96 });
  const [meta, encoded] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? (format === 'png' ? 'image/png' : 'image/jpeg');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  await downloadBlob(new Blob([bytes], { type: mime }), `${safeFilename(filename)}.${format}`);
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
