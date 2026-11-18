import 'server-only';
import { stripHtml } from '@/lib/utils';

export interface RawJob {
  source_key: string;
  sourceName: string;
  external_id: string;
  title: string;
  company: string;
  url: string;
  location: string | null;
  restriction: string | null;
  description: string;
  posted_at: string | null;
  deadline: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_text: string | null;
  job_type: string | null;
  tags: string[];
  isRemote: boolean | null;
  sponsorFlag: boolean | null;
}

const UA = 'JobsApply/1.0 (personal single-user job search tool)';

async function getJSON(url: string, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function iso(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function num(v: any): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}

export async function fetchRemotive(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const term of ['qa', 'quality assurance', 'tester', 'project coordinator', 'project manager', 'business analyst', 'implementation specialist', 'support specialist']) {
    let data: any;
    try { data = await getJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=50`); } catch { continue; }
    for (const j of data.jobs ?? []) {
      out.push({
        source_key: 'remotive', sourceName: 'Remotive', external_id: String(j.id), title: j.title, company: j.company_name,
        url: j.url, location: j.candidate_required_location ?? null, restriction: j.candidate_required_location ?? null,
        description: stripHtml(j.description), posted_at: iso(j.publication_date), deadline: null,
        salary_min: null, salary_max: null, salary_currency: null, salary_text: j.salary || null,
        job_type: j.job_type ?? null, tags: j.tags ?? [], isRemote: true, sponsorFlag: null,
      });
    }
  }
  return out;
}

export async function fetchRemoteOK(): Promise<RawJob[]> {
  const data = await getJSON('https://remoteok.com/api');
  const out: RawJob[] = [];
  for (const j of Array.isArray(data) ? data : []) {
    if (!j || !j.id || !j.position) continue;
    out.push({
      source_key: 'remoteok', sourceName: 'Remote OK', external_id: String(j.id), title: j.position, company: j.company,
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`, location: j.location || null, restriction: j.location || null,
      description: stripHtml(j.description), posted_at: iso(j.date || j.epoch), deadline: null,
      salary_min: num(j.salary_min), salary_max: num(j.salary_max), salary_currency: num(j.salary_min) ? 'USD' : null, salary_text: null,
      job_type: null, tags: j.tags ?? [], isRemote: true, sponsorFlag: null,
    });
  }
  return out;
}

export async function fetchHimalayas(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const term of ['qa engineer', 'quality assurance', 'software tester', 'test analyst', 'project coordinator', 'project manager', 'business analyst', 'implementation specialist', 'support specialist']) {
    let data: any;
    try { data = await getJSON(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(term)}&sort=recent`); } catch { continue; }
    for (const j of data.jobs ?? []) {
      const id = String(j.guid ?? j.applicationLink ?? j.title);
      if (seen.has(id)) continue;
      seen.add(id);
      const restr = Array.isArray(j.locationRestrictions) && j.locationRestrictions.length
        ? j.locationRestrictions.map((x: any) => (typeof x === 'string' ? x : x?.name)).filter(Boolean).join(', ')
        : 'Worldwide';
      out.push({
        source_key: 'himalayas', sourceName: 'Himalayas', external_id: id, title: j.title, company: j.companyName,
        url: j.applicationLink || j.guid, location: restr, restriction: restr,
        description: stripHtml(j.description || j.excerpt), posted_at: iso(j.pubDate),
        deadline: j.expiryDate ? (iso(j.expiryDate)?.slice(0, 10) ?? null) : null,
        salary_min: num(j.minSalary), salary_max: num(j.maxSalary), salary_currency: j.currency || (num(j.minSalary) ? 'USD' : null), salary_text: null,
        job_type: j.employmentType ?? null, tags: j.categories ?? [], isRemote: true, sponsorFlag: null,
      });
    }
  }
  return out;
}

export async function fetchJobicy(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const tag of ['qa', 'testing', 'project manager', 'project coordinator', 'business analyst', 'support']) {
    let data: any;
    try { data = await getJSON(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`); } catch { continue; }
    for (const j of data.jobs ?? []) {
      const id = String(j.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        source_key: 'jobicy', sourceName: 'Jobicy', external_id: id, title: stripHtml(j.jobTitle), company: j.companyName,
        url: j.url, location: j.jobGeo ?? null, restriction: j.jobGeo ?? null,
        description: stripHtml(j.jobDescription || j.jobExcerpt), posted_at: iso(j.pubDate), deadline: null,
        salary_min: num(j.annualSalaryMin ?? j.salaryMin), salary_max: num(j.annualSalaryMax ?? j.salaryMax), salary_currency: j.salaryCurrency ?? null, salary_text: null,
        job_type: Array.isArray(j.jobType) ? j.jobType.join(', ') : (j.jobType ?? null), tags: [], isRemote: true, sponsorFlag: null,
      });
    }
  }
  return out;
}

export async function fetchArbeitnow(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  const urls = [
    'https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=1',
    'https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=2',
    'https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=3',
    'https://www.arbeitnow.com/api/job-board-api?remote=true&page=1',
    'https://www.arbeitnow.com/api/job-board-api?page=1',
  ];
  for (const u of urls) {
    let data: any;
    try { data = await getJSON(u); } catch { continue; }
    const sponsorFeed = u.includes('visa_sponsorship=true');
    for (const j of data.data ?? []) {
      if (seen.has(j.slug)) continue;
      seen.add(j.slug);
      const tags: string[] = j.tags ?? [];
      out.push({
        source_key: 'arbeitnow', sourceName: 'Arbeitnow', external_id: j.slug, title: j.title, company: j.company_name,
        url: j.url, location: j.location ?? null, restriction: j.remote ? (j.location ?? null) : null,
        description: stripHtml(j.description), posted_at: iso(j.created_at), deadline: null,
        salary_min: null, salary_max: null, salary_currency: null, salary_text: null,
        job_type: (j.job_types ?? []).join(', ') || null, tags, isRemote: Boolean(j.remote),
        sponsorFlag: sponsorFeed || Boolean(j.visa_sponsorship) || tags.some((t) => /visa/i.test(t)),
      });
    }
  }
  return out;
}

export async function fetchWWR(): Promise<RawJob[]> {
  const xml = await getText('https://weworkremotely.com/remote-jobs.rss');
  const items = xml.split('<item>').slice(1);
  const out: RawJob[] = [];
  const tag = (s: string, name: string) => {
    const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(s);
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
  };
  for (const it of items) {
    const rawTitle = stripHtml(tag(it, 'title'));
    const idx = rawTitle.indexOf(':');
    const company = idx > 0 ? rawTitle.slice(0, idx).trim() : 'Unknown';
    const title = idx > 0 ? rawTitle.slice(idx + 1).trim() : rawTitle;
    const link = tag(it, 'link') || tag(it, 'guid');
    const region = stripHtml(tag(it, 'region'));
    out.push({
      source_key: 'wwr', sourceName: 'We Work Remotely', external_id: link, title, company, url: link,
      location: region || null, restriction: region || null, description: stripHtml(tag(it, 'description')),
      posted_at: iso(tag(it, 'pubDate')), deadline: null, salary_min: null, salary_max: null, salary_currency: null, salary_text: null,
      job_type: tag(it, 'type') || null, tags: [], isRemote: true, sponsorFlag: null,
    });
  }
  return out;
}

export const SOURCE_FETCHERS: Record<string, () => Promise<RawJob[]>> = {
  remotive: fetchRemotive,
  remoteok: fetchRemoteOK,
  himalayas: fetchHimalayas,
  jobicy: fetchJobicy,
  arbeitnow: fetchArbeitnow,
  wwr: fetchWWR,
};

/** Search links for boards without a permitted public API (user-assisted workflow). */
export function assistedSearchLinks(title: string, country?: string) {
  const q = encodeURIComponent(title);
  const loc = encodeURIComponent(country || 'Europe');
  return [
    { name: 'LinkedIn Jobs (remote)', url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}&f_WT=2` },
    { name: 'LinkedIn Jobs (visa sponsorship)', url: `https://www.linkedin.com/jobs/search/?keywords=${q}%20visa%20sponsorship&location=${loc}` },
    { name: 'Indeed', url: `https://www.indeed.com/jobs?q=${q}+remote&l=${loc}` },
    { name: 'Glassdoor', url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}` },
    { name: 'Wellfound', url: `https://wellfound.com/jobs?query=${q}` },
    { name: 'Welcome to the Jungle', url: `https://www.welcometothejungle.com/en/jobs?query=${q}` },
    { name: 'Relocate.me', url: `https://relocate.me/search?query=${q}` },
  ];
}
