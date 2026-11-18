import 'server-only';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function extractText(buf: Buffer, ext: string): Promise<string> {
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value.replace(/\n{3,}/g, '\n\n').trim();
  }
  if (ext === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).trim();
  }
  throw new Error('Unsupported file type');
}

/** Verifies the file's magic bytes match its declared type. */
export function sniffOk(buf: Buffer, ext: string) {
  if (ext === 'pdf') return buf.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'docx') return buf[0] === 0x50 && buf[1] === 0x4b; // ZIP container
  return false;
}

function runs(text: string): TextRun[] {
  // **bold** support
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => (p.startsWith('**') && p.endsWith('**') ? new TextRun({ text: p.slice(2, -2), bold: true }) : new TextRun({ text: p })));
}

/** Converts the simple markdown we generate (#, ##, ###, - bullets, paragraphs) into an ATS-friendly .docx. */
export async function markdownToDocx(md: string): Promise<Buffer> {
  const paras: Paragraph[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { paras.push(new Paragraph({ text: '' })); continue; }
    if (line.startsWith('### ')) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs(line.slice(4)) }));
    else if (line.startsWith('## ')) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(line.slice(3)) }));
    else if (line.startsWith('# ')) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(line.slice(2)) }));
    else if (/^\s*[-•*]\s+/.test(line)) paras.push(new Paragraph({ bullet: { level: 0 }, children: runs(line.replace(/^\s*[-•*]\s+/, '')) }));
    else paras.push(new Paragraph({ children: runs(line) }));
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: paras }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export function safeFilename(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

/** Simple line diff: lines only in a, only in b. */
export function lineDiff(a: string, b: string) {
  const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const A = norm(a), B = norm(b);
  const setA = new Set(A.map((l) => l.toLowerCase()));
  const setB = new Set(B.map((l) => l.toLowerCase()));
  return {
    added: B.filter((l) => !setA.has(l.toLowerCase())),
    removed: A.filter((l) => !setB.has(l.toLowerCase())),
  };
}
