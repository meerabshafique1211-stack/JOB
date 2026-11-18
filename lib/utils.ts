export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function normalizeName(s: string) {
  return s.toLowerCase().replace(/\b(gmbh|ltd|limited|inc|llc|bv|b\.v\.|ab|as|oy|sa|sas|srl|plc|ag|se|co)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    const keep = ['gh_jid', 'jobId', 'job', 'id', 'currentJobId', 'jk'];
    const params = new URLSearchParams();
    keep.forEach((k) => { const v = u.searchParams.get(k); if (v) params.set(k, v); });
    u.search = params.toString();
    let s = `${u.protocol}//${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
    if (u.search) s += u.search;
    return s;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function ctKey(company: string, title: string) {
  return `${normalizeName(company)}|${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
}

export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

export function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function emailDomain(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

export const PIPELINE_STATUSES = [
  'New', 'Under Review', 'Shortlisted', 'CV Prepared', 'Draft Ready', 'Awaiting Batch Approval', 'Applied',
  'Recruiter Contacted', 'Email Sent', 'Response Received', 'Follow-Up Due', 'Interview Scheduled', 'Rejected',
  'Offer Received', 'Closed',
] as const;

export const RECIPIENT_TYPES = [
  'Recruiter', 'Technical Recruiter', 'Talent Acquisition Manager', 'Head of Talent Acquisition', 'HR Manager',
  'QA Manager', 'Engineering Manager', 'Project Manager', 'CTO', 'Founder', 'CEO',
] as const;

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
}
export function strOrNull(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === '' ? null : v;
}
export function lines(v: string) {
  return v.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
}

export function recipientTypeFor(designation: string) {
  const d = designation.toLowerCase();
  if (/technical recruiter/.test(d)) return 'Technical Recruiter';
  if (/head of talent/.test(d)) return 'Head of Talent Acquisition';
  if (/talent acquisition/.test(d)) return 'Talent Acquisition Manager';
  if (/recruit/.test(d)) return 'Recruiter';
  if (/\b(hr|human resources|people)\b/.test(d)) return 'HR Manager';
  if (/\b(qa|quality|test)\b/.test(d)) return 'QA Manager';
  if (/engineering manager|head of engineering|vp engineering/.test(d)) return 'Engineering Manager';
  if (/project manager|program manager|delivery manager|pmo/.test(d)) return 'Project Manager';
  if (/\bcto\b|chief technology/.test(d)) return 'CTO';
  if (/\bceo\b|chief executive/.test(d)) return 'CEO';
  if (/founder/.test(d)) return 'Founder';
  return 'Recruiter';
}

