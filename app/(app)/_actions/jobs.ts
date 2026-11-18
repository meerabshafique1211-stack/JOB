'use server';
import { requireOwner } from '@/lib/supabase/server';
import { SOURCE_FETCHERS, type RawJob } from '@/lib/jobs/sources';
import { classify, extractApplyEmail, titleMatches, detectCountry } from '@/lib/jobs/classify';
import { canonicalUrl, ctKey, normalizeName, str, strOrNull, stripHtml } from '@/lib/utils';
import { callClaudeJSON, profileContext, TRUTH_RULES } from '@/lib/claude';
import { logActivity } from '@/lib/activity';
import { getProfile, getMasterCV } from './data';
import { go, errMsg, backTo } from './util';

function chunk<T>(a: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

async function upsertCompanies(sb: any, names: string[]) {
  const map = new Map<string, string>();
  const uniq = Array.from(new Map(names.filter(Boolean).map((n) => [normalizeName(n), n])).entries());
  for (const part of chunk(uniq, 100)) {
    const { data: existing } = await sb.from('companies').select('id, normalized_name').in('normalized_name', part.map(([k]) => k));
    (existing ?? []).forEach((c: any) => map.set(c.normalized_name, c.id));
    const missing = part.filter(([k]) => !map.has(k)).map(([k, name]) => ({ name, normalized_name: k }));
    if (missing.length) {
      const { data: ins } = await sb.from('companies').upsert(missing, { onConflict: 'normalized_name', ignoreDuplicates: true }).select('id, normalized_name');
      (ins ?? []).forEach((c: any) => map.set(c.normalized_name, c.id));
    }
  }
  return map;
}

/** Normalizes, classifies, de-duplicates and stores jobs. Returns counts. */
async function storeJobs(sb: any, raw: RawJob[], profile: any) {
  const include: string[] = profile.title_keywords?.length ? profile.title_keywords : [];
  const exclude: string[] = profile.exclude_keywords ?? [];
  const today = new Date().toISOString().slice(0, 10);
  let filteredOut = 0;
  const candidates: any[] = [];
  const seenKeys = new Set<string>();

  for (const r of raw) {
    if (!r.title || !r.company || !r.url) continue;
    if (!titleMatches(r.title, include, exclude)) { filteredOut++; continue; }
    const c = classify({ title: r.title, location: r.location, restriction: r.restriction, description: r.description, isRemote: r.isRemote, sourceSponsorFlag: r.sponsorFlag, sourceName: r.sourceName });
    // Exclude local Pakistani on-site vacancies
    if (c.country === 'Pakistan' && c.pakistan_eligible !== 'yes') { filteredOut++; continue; }
    // Keep only what can plausibly serve one of the two goals
    const europe = Boolean(c.country && c.country !== 'Pakistan');
    if (c.category === 'other' && !europe && c.pakistan_eligible === 'no') { filteredOut++; continue; }
    const canon = canonicalUrl(r.url)!;
    const ck = ctKey(r.company, r.title);
    if (seenKeys.has(canon) || seenKeys.has(ck)) continue;
    seenKeys.add(canon); seenKeys.add(ck);
    candidates.push({
      company_name: r.company.trim(), title: r.title.trim(), country: c.country, location: r.location,
      description: r.description.slice(0, 20000), url: r.url, canonical_url: canon, external_id: r.external_id,
      source_key: r.source_key, posted_at: r.posted_at, deadline: r.deadline,
      salary_min: r.salary_min, salary_max: r.salary_max, salary_currency: r.salary_currency, salary_text: r.salary_text,
      job_type: r.job_type, tags: r.tags?.slice(0, 15) ?? [], location_restriction: r.restriction,
      remote_eligibility: c.remote_eligibility, pakistan_eligible: c.pakistan_eligible, visa_sponsorship: c.visa_sponsorship,
      relocation: c.relocation, evidence: c.evidence, category: c.category,
      vacancy_status: r.deadline && r.deadline < today ? 'expired' : 'active',
      verified_at: new Date().toISOString(), ct_key: ck, apply_email: extractApplyEmail(r.description),
    });
  }

  // De-duplicate against the database by canonical URL and by company+title
  const existingCanon = new Set<string>();
  const existingCt = new Set<string>();
  for (const part of chunk(candidates, 100)) {
    const { data: a } = await sb.from('jobs').select('canonical_url').in('canonical_url', part.map((j) => j.canonical_url));
    (a ?? []).forEach((j: any) => existingCanon.add(j.canonical_url));
    const { data: b } = await sb.from('jobs').select('ct_key').in('ct_key', part.map((j) => j.ct_key));
    (b ?? []).forEach((j: any) => existingCt.add(j.ct_key));
  }
  const fresh = candidates.filter((j) => !existingCanon.has(j.canonical_url) && !existingCt.has(j.ct_key));
  const seenAgain = candidates.filter((j) => existingCanon.has(j.canonical_url)).map((j) => j.canonical_url);
  for (const part of chunk(seenAgain, 100)) {
    await sb.from('jobs').update({ verified_at: new Date().toISOString(), vacancy_status: 'active' }).in('canonical_url', part).neq('vacancy_status', 'expired');
  }

  const companyIds = await upsertCompanies(sb, fresh.map((j) => j.company_name));
  let inserted = 0;
  for (const part of chunk(fresh, 50)) {
    const rows = part.map((j) => ({ ...j, company_id: companyIds.get(normalizeName(j.company_name)) ?? null }));
    const { data, error } = await sb.from('jobs').upsert(rows, { onConflict: 'canonical_url', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }
  return { inserted, duplicates: candidates.length - fresh.length, filteredOut, refreshed: seenAgain.length };
}

export async function runDiscovery(fd: FormData) {
  const { supabase } = await requireOwner();
  const profile = await getProfile(supabase);
  const only = str(fd, 'source');
  const { data: sources } = await supabase.from('job_sources').select('*').eq('enabled', true);
  const active = (sources ?? []).filter((s: any) => SOURCE_FETCHERS[s.key] && (!only || s.key === only));
  const results = await Promise.allSettled(active.map((s: any) => SOURCE_FETCHERS[s.key]()));
  const all: RawJob[] = [];
  const summary: string[] = [];
  for (let i = 0; i < active.length; i++) {
    const s = active[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      all.push(...r.value);
      await supabase.from('job_sources').update({ last_run_at: new Date().toISOString(), last_status: 'ok', last_count: r.value.length }).eq('key', s.key);
    } else {
      summary.push(`${s.name} failed: ${errMsg(r.reason)}`);
      await supabase.from('job_sources').update({ last_run_at: new Date().toISOString(), last_status: `error: ${errMsg(r.reason).slice(0, 120)}` }).eq('key', s.key);
    }
  }
  const stored = await storeJobs(supabase, all, profile).then((c) => ({ c, e: null as string | null }), (e) => ({ c: null, e: errMsg(e) }));
  if (!stored.c) go('/jobs', { err: `Saving jobs failed: ${stored.e}` });
  const counts = stored.c!;
  await logActivity(supabase, 'discovery_run', 'jobs', null, { fetched: all.length, ...counts, errors: summary });
  go('/jobs', {
    msg: `Fetched ${all.length} listings from ${active.length} sources → ${counts.inserted} new relevant vacancies saved, ${counts.duplicates} duplicates skipped, ${counts.refreshed} existing re-verified, ${counts.filteredOut} filtered out (title/location).${summary.length ? ' ' + summary.join('; ') : ''}`,
  });
}

/** User-assisted import: paste a vacancy found on LinkedIn, Indeed, Glassdoor, company sites, etc. */
export async function importJob(fd: FormData) {
  const { supabase } = await requireOwner();
  const url = str(fd, 'url');
  let text = str(fd, 'text');
  let company = str(fd, 'company');
  let title = str(fd, 'title');
  let location = str(fd, 'location');
  if (!url) go('/jobs', { err: 'The original vacancy URL is required so the listing can be verified.' });
  let extracted: any = null;
  if (!company || !title) {
    if (!text) go('/jobs', { err: 'Paste the job description, or fill in company and title.' });
    try {
      const { data } = await callClaudeJSON({
        system: 'You extract structured data from a job posting. Only report what is explicitly written. Use null when absent.',
        prompt: `Extract from this job posting: {"company":string|null,"title":string|null,"location":string|null,"remote_restriction":string|null,"salary_text":string|null,"deadline":"YYYY-MM-DD"|null,"required_experience":string|null,"required_skills":string[],"is_remote":boolean|null}\n\nPOSTING:\n${text.slice(0, 15000)}`,
        maxTokens: 800,
      });
      extracted = data;
    } catch (e) {
      go('/jobs', { err: `Could not auto-extract fields (${errMsg(e)}). Fill in company and title manually.` });
    }
    company = company || extracted?.company || '';
    title = title || extracted?.title || '';
    location = location || extracted?.location || '';
  }
  if (!company || !title) go('/jobs', { err: 'Company and title could not be determined. Please fill them in.' });
  text = stripHtml(text);
  const c = classify({ title, location, restriction: extracted?.remote_restriction ?? location, description: text, isRemote: extracted?.is_remote ?? null, sourceSponsorFlag: null, sourceName: 'Imported posting' });
  const canon = canonicalUrl(url)!;
  const ck = ctKey(company, title);
  const { data: dupA } = await supabase.from('jobs').select('id').eq('canonical_url', canon).limit(1);
  const { data: dupB } = await supabase.from('jobs').select('id').eq('ct_key', ck).limit(1);
  const dup = [...(dupA ?? []), ...(dupB ?? [])];
  if (dup.length) go(`/jobs/${dup[0].id}`, { msg: 'This vacancy is already in your database (duplicate prevented).' });
  const companyIds = await upsertCompanies(supabase, [company]);
  const { data, error } = await supabase.from('jobs').insert({
    company_id: companyIds.get(normalizeName(company)) ?? null, company_name: company, title, location: location || null,
    country: c.country ?? detectCountry(location), description: text.slice(0, 20000), url, canonical_url: canon, ct_key: ck,
    source_key: 'manual', salary_text: extracted?.salary_text ?? null, deadline: extracted?.deadline ?? null,
    required_experience: extracted?.required_experience ?? null, required_skills: extracted?.required_skills ?? [],
    remote_eligibility: c.remote_eligibility, pakistan_eligible: c.pakistan_eligible, visa_sponsorship: c.visa_sponsorship,
    relocation: c.relocation, evidence: c.evidence, category: c.category, vacancy_status: 'unverified',
    location_restriction: extracted?.remote_restriction ?? null, apply_email: extractApplyEmail(text),
  }).select('id').single();
  if (error) go('/jobs', { err: error.message });
  await logActivity(supabase, 'job_imported', 'job', data!.id, { url });
  go(`/jobs/${data!.id}`, { msg: 'Vacancy imported. Click “Verify link” to confirm it is still open.' });
}

export async function verifyJob(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { data: job } = await supabase.from('jobs').select('url').eq('id', id).single();
  let status: 'active' | 'expired' | 'unverified' = 'unverified';
  let note = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(job!.url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; JobsApply link checker)' } });
    clearTimeout(t);
    if (res.status === 404 || res.status === 410) { status = 'expired'; note = `Link returned HTTP ${res.status}.`; }
    else if (res.ok) {
      const html = (await res.text()).slice(0, 400000).toLowerCase();
      if (/no longer (accepting|available|open)|position (has been )?filled|job (has )?expired|this job is closed|job not found|vacancy (has been )?closed/.test(html)) { status = 'expired'; note = 'The page says the job is closed.'; }
      else { status = 'active'; note = 'Page is reachable and does not say the job is closed.'; }
    } else { note = `Site returned HTTP ${res.status} (it may block automated checks). Open the link yourself to confirm.`; }
  } catch (e) {
    note = `Could not reach the page: ${errMsg(e)}`;
  }
  await supabase.from('jobs').update({ vacancy_status: status, verified_at: status === 'unverified' ? null : new Date().toISOString() }).eq('id', id);
  go(backTo(fd, `/jobs/${id}`), { msg: `Verification: ${status}. ${note}` });
}

export async function setJobFields(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const patch: any = { updated_at: new Date().toISOString() };
  for (const k of ['pipeline_status', 'vacancy_status', 'visa_sponsorship', 'relocation', 'pakistan_eligible', 'category', 'country']) {
    const v = strOrNull(fd, k);
    if (v) patch[k] = v;
  }
  const note = strOrNull(fd, 'evidence_note');
  if (note) {
    const { data } = await supabase.from('jobs').select('evidence').eq('id', id).single();
    patch.evidence = { ...(data?.evidence ?? {}), manual: note };
  }
  const { error } = await supabase.from('jobs').update(patch).eq('id', id);
  if (error) go(backTo(fd, `/jobs/${id}`), { err: error.message });
  await logActivity(supabase, 'job_updated', 'job', id, patch);
  go(backTo(fd, `/jobs/${id}`), { msg: 'Saved.' });
}

export async function deleteJob(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) go(`/jobs/${id}`, { err: `Cannot delete: ${error.message}` });
  go('/jobs', { msg: 'Vacancy deleted.' });
}

async function scoreOne(supabase: any, job: any, profile: any, cvText: string) {
  const { data, model } = await callClaudeJSON<any>({
    model: profile.ai_model,
    system: `You are a precise recruitment analyst comparing one job against one candidate. ${TRUTH_RULES}
Scoring guide: 85-100 strong match on title, core skills and seniority; 65-84 good with minor gaps; 40-64 partial; below 40 poor. Penalize hard requirements the CV lacks (e.g. specific languages like German, years well above the candidate's, mandatory certifications, coding-heavy automation). Remote/sponsorship fit must reflect the stated eligibility evidence only.`,
    prompt: `${profileContext(profile, cvText)}

JOB:
Company: ${job.company_name}
Title: ${job.title}
Location: ${job.location ?? ''} | Country: ${job.country ?? 'unknown'}
Location restriction: ${job.location_restriction ?? 'unknown'}
Rule-based eligibility: remote=${job.remote_eligibility}, pakistan_eligible=${job.pakistan_eligible}, visa_sponsorship=${job.visa_sponsorship}, relocation=${job.relocation}
Evidence: ${JSON.stringify(job.evidence ?? {})}
Salary: ${job.salary_text ?? ([job.salary_min, job.salary_max].filter(Boolean).join('–') + ' ' + (job.salary_currency ?? '')).trim() ?? 'not stated'}
Candidate minimum salary (EUR/yr): ${profile.min_salary_eur ?? 'not set'}
Description:
${(job.description ?? '').slice(0, 9000)}

Return JSON: {"score":0-100,"relevant_skills":[...],"missing_requirements":[...],"experience_fit":"one sentence","education_fit":"one sentence","remote_fit":"one sentence","sponsorship_fit":"one sentence","salary_fit":"one sentence","reasons":["3 short reasons to apply"],"concerns":["short concerns"],"required_experience":"as stated in the job or null","required_skills":["skills the job explicitly requires"]}`,
    maxTokens: 1200,
  });
  const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
  await supabase.from('job_matches').upsert({
    job_id: job.id, score, relevant_skills: data.relevant_skills ?? [], missing_requirements: data.missing_requirements ?? [],
    experience_fit: data.experience_fit, education_fit: data.education_fit, remote_fit: data.remote_fit,
    sponsorship_fit: data.sponsorship_fit, salary_fit: data.salary_fit, reasons: data.reasons ?? [], concerns: data.concerns ?? [],
    model, created_at: new Date().toISOString(),
  }, { onConflict: 'job_id' });
  const patch: any = {};
  if (!job.required_experience && data.required_experience) patch.required_experience = String(data.required_experience).slice(0, 300);
  if ((!job.required_skills || !job.required_skills.length) && Array.isArray(data.required_skills)) patch.required_skills = data.required_skills.slice(0, 20);
  if (job.pipeline_status === 'New') patch.pipeline_status = 'Under Review';
  if (Object.keys(patch).length) await supabase.from('jobs').update(patch).eq('id', job.id);
  return score;
}

export async function scoreJobs(fd: FormData) {
  const { supabase } = await requireOwner();
  const profile = await getProfile(supabase);
  const cv = await getMasterCV(supabase);
  const ids = fd.getAll('job_ids').map(String).filter(Boolean);
  const single = str(fd, 'id');
  const back = backTo(fd, '/jobs');
  let jobs: any[] = [];
  if (single) {
    const { data } = await supabase.from('jobs').select('*').eq('id', single);
    jobs = data ?? [];
  } else if (ids.length) {
    const { data } = await supabase.from('jobs').select('*').in('id', ids.slice(0, 10));
    jobs = data ?? [];
  } else {
    const { data: scored } = await supabase.from('job_matches').select('job_id');
    const done = new Set((scored ?? []).map((s: any) => s.job_id));
    const { data } = await supabase.from('jobs').select('*').neq('vacancy_status', 'expired').in('category', ['remote', 'visa', 'both']).order('created_at', { ascending: false }).limit(60);
    jobs = (data ?? []).filter((j: any) => !done.has(j.id)).slice(0, 8);
    if (!jobs.length) {
      const { data: d2 } = await supabase.from('jobs').select('*').neq('vacancy_status', 'expired').order('created_at', { ascending: false }).limit(60);
      jobs = (d2 ?? []).filter((j: any) => !done.has(j.id)).slice(0, 8);
    }
  }
  if (!jobs.length) go(back, { msg: 'Nothing left to score.' });
  const results = await Promise.allSettled(jobs.map((j) => scoreOne(supabase, j, profile, cv?.content ?? '')));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  await logActivity(supabase, 'jobs_scored', 'jobs', null, { ok, failed: results.length - ok });
  if (!ok && firstErr) go(back, { err: `Scoring failed: ${errMsg(firstErr.reason)}` });
  go(back, { msg: `Scored ${ok} of ${jobs.length} vacancies with Claude.${firstErr ? ' Some failed: ' + errMsg(firstErr.reason) : ''}` });
}

export async function toggleSource(fd: FormData) {
  const { supabase } = await requireOwner();
  const key = str(fd, 'key');
  const enabled = str(fd, 'enabled') === 'true';
  await supabase.from('job_sources').update({ enabled }).eq('key', key);
  go('/settings?tab=sources', { msg: `${key} ${enabled ? 'enabled' : 'disabled'}.` });
}
