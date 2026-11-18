'use server';
import { requireOwner } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { normalizeName, str, strOrNull, recipientTypeFor } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { go, errMsg, backTo } from './util';

const PRIORITY = ['technical recruiter', 'talent acquisition manager', 'recruiter', 'talent acquisition', 'hr manager', 'people', 'qa manager', 'quality', 'engineering manager', 'project manager', 'head of talent', 'cto', 'founder', 'ceo'];

export async function addCompany(fd: FormData) {
  const { supabase } = await requireOwner();
  const name = str(fd, 'name');
  if (!name) go('/companies', { err: 'Company name is required.' });
  const domain = strOrNull(fd, 'domain')?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') ?? null;
  const { error } = await supabase.from('companies').upsert({
    name, normalized_name: normalizeName(name), domain, website: strOrNull(fd, 'website'), country: strOrNull(fd, 'country'),
    linkedin_url: strOrNull(fd, 'linkedin_url'), careers_url: strOrNull(fd, 'careers_url'), notes: strOrNull(fd, 'notes'),
  }, { onConflict: 'normalized_name' });
  if (error) go('/companies', { err: error.message });
  go(backTo(fd, '/companies'), { msg: `Saved ${name}.` });
}

export async function updateCompany(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const domain = strOrNull(fd, 'domain')?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') ?? null;
  const patch: any = { domain, website: strOrNull(fd, 'website'), country: strOrNull(fd, 'country'), linkedin_url: strOrNull(fd, 'linkedin_url'), careers_url: strOrNull(fd, 'careers_url'), notes: strOrNull(fd, 'notes') };
  if (fd.has('shortlisted')) patch.shortlisted = str(fd, 'shortlisted') === 'true';
  const { error } = await supabase.from('companies').update(patch).eq('id', id);
  if (error) go(`/companies/${id}`, { err: error.message });
  go(backTo(fd, `/companies/${id}`), { msg: 'Company updated.' });
}

export async function toggleShortlist(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const on = str(fd, 'shortlisted') === 'true';
  await supabase.from('companies').update({ shortlisted: on }).eq('id', id);
  const jobId = strOrNull(fd, 'job_id');
  if (jobId && on) await supabase.from('jobs').update({ pipeline_status: 'Shortlisted' }).eq('id', jobId).in('pipeline_status', ['New', 'Under Review']);
  go(backTo(fd, `/companies/${id}`), { msg: on ? 'Shortlisted.' : 'Removed from shortlist.' });
}

export async function addContact(fd: FormData) {
  const { supabase } = await requireOwner();
  const companyId = str(fd, 'company_id');
  const name = str(fd, 'name');
  const sourceUrl = strOrNull(fd, 'source_url');
  const email = strOrNull(fd, 'email')?.toLowerCase() ?? null;
  let emailStatus = str(fd, 'email_status') || (email ? 'unverified' : 'none');
  const back = backTo(fd, `/companies/${companyId}`);
  if (!name) go(back, { err: 'Name is required.' });
  if (!sourceUrl && !strOrNull(fd, 'linkedin_url')) go(back, { err: 'Add the public source URL (or LinkedIn profile) where you found this person.' });
  if (emailStatus === 'public_source' && !sourceUrl) go(back, { err: '“Published on a public page” needs the source URL where the email appears.' });
  if (!email) emailStatus = 'none';
  const designation = strOrNull(fd, 'designation');
  const { data, error } = await supabase.from('hiring_contacts').insert({
    company_id: companyId, job_id: strOrNull(fd, 'job_id'), name, designation,
    role_type: strOrNull(fd, 'role_type') ?? recipientTypeFor(designation ?? ''), country: strOrNull(fd, 'country'),
    linkedin_url: strOrNull(fd, 'linkedin_url'), email, email_status: emailStatus, source_url: sourceUrl, notes: strOrNull(fd, 'notes'),
  }).select('id').single();
  if (error) go(back, { err: error.message });
  if (sourceUrl) await supabase.from('contact_sources').insert({ contact_id: data!.id, url: sourceUrl, description: 'Added manually' });
  await logActivity(supabase, 'contact_added', 'contact', data!.id, { name });
  go(back, { msg: `Added ${name}.` });
}

export async function updateContact(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const email = strOrNull(fd, 'email')?.toLowerCase() ?? null;
  const sourceUrl = strOrNull(fd, 'source_url');
  let emailStatus = str(fd, 'email_status') || 'unverified';
  if (!email) emailStatus = 'none';
  const back = backTo(fd, '/contacts');
  if (emailStatus === 'public_source' && !sourceUrl) go(back, { err: '“Published on a public page” needs the source URL where the email appears.' });
  const designation = strOrNull(fd, 'designation');
  const { error } = await supabase.from('hiring_contacts').update({
    name: str(fd, 'name'), designation, role_type: strOrNull(fd, 'role_type') ?? recipientTypeFor(designation ?? ''),
    job_id: strOrNull(fd, 'job_id'), country: strOrNull(fd, 'country'), linkedin_url: strOrNull(fd, 'linkedin_url'),
    email, email_status: emailStatus, source_url: sourceUrl, notes: strOrNull(fd, 'notes'),
  }).eq('id', id);
  if (error) go(back, { err: error.message });
  go(back, { msg: 'Contact updated.' });
}

export async function deleteContact(fd: FormData) {
  const { supabase } = await requireOwner();
  await supabase.from('hiring_contacts').delete().eq('id', str(fd, 'id'));
  go(backTo(fd, '/contacts'), { msg: 'Contact deleted.' });
}

export async function setLinkedInStatus(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const status = str(fd, 'linkedin_status');
  await supabase.from('hiring_contacts').update({ linkedin_status: status }).eq('id', id);
  await logActivity(supabase, 'linkedin_status', 'contact', id, { status });
  go(backTo(fd, '/linkedin'), { msg: `LinkedIn status set to ${status.replace(/_/g, ' ')}.` });
}

/** Hunter.io domain search – returns publicly sourced professional emails with their sources and verification. */
export async function hunterFindContacts(fd: FormData) {
  const { supabase } = await requireOwner();
  const companyId = str(fd, 'company_id');
  const back = backTo(fd, `/companies/${companyId}`);
  if (!env.hunterKey) go(back, { err: 'Hunter.io is not configured. Add HUNTER_API_KEY in Vercel to enable verified contact discovery, or add contacts manually with their source URL.' });
  const { data: company } = await supabase.from('companies').select('*').eq('id', companyId).single();
  if (!company?.domain) go(back, { err: 'Add the company’s website domain first (e.g. example.com).' });
  let emails: any[] = [];
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(company!.domain)}&type=personal&limit=20&api_key=${env.hunterKey}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.errors?.[0]?.details ?? `HTTP ${res.status}`);
    emails = data.data?.emails ?? [];
  } catch (e) {
    go(back, { err: `Hunter search failed: ${errMsg(e)}` });
  }
  const relevant = emails
    .filter((e) => e.position && PRIORITY.some((p) => e.position.toLowerCase().includes(p)))
    .sort((a, b) => PRIORITY.findIndex((p) => a.position.toLowerCase().includes(p)) - PRIORITY.findIndex((p) => b.position.toLowerCase().includes(p)));
  const { data: existing } = await supabase.from('hiring_contacts').select('email').eq('company_id', companyId);
  const have = new Set((existing ?? []).map((c: any) => (c.email ?? '').toLowerCase()));
  let added = 0;
  for (const e of relevant.slice(0, 10)) {
    if (have.has(e.value.toLowerCase())) continue;
    const verified = e.verification?.status === 'valid';
    const source = e.sources?.[0]?.uri ?? null;
    const { data: c } = await supabase.from('hiring_contacts').insert({
      company_id: companyId, name: [e.first_name, e.last_name].filter(Boolean).join(' ') || e.value, designation: e.position,
      role_type: recipientTypeFor(e.position), linkedin_url: e.linkedin ? (e.linkedin.startsWith('http') ? e.linkedin : `https://www.linkedin.com/in/${e.linkedin}`) : null,
      email: e.value.toLowerCase(), email_status: verified ? 'verified' : 'unverified', source_url: source,
      notes: `Found via Hunter.io (confidence ${e.confidence ?? '?'}%, verification: ${e.verification?.status ?? 'none'}).`,
    }).select('id').single();
    if (c) {
      added++;
      for (const s of (e.sources ?? []).slice(0, 3)) await supabase.from('contact_sources').insert({ contact_id: c.id, url: s.uri, description: `Hunter source (${s.extracted_on ?? ''})` });
    }
  }
  await logActivity(supabase, 'hunter_search', 'company', companyId, { found: emails.length, added });
  go(back, { msg: `Hunter found ${emails.length} public emails at ${company!.domain}; added ${added} relevant hiring contacts. Unverified ones will not be emailed until verified.` });
}

export async function hunterVerifyEmail(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const back = backTo(fd, '/contacts');
  if (!env.hunterKey) go(back, { err: 'Email verification needs HUNTER_API_KEY. Alternatively mark the email as “published on a public page” and give the source URL.' });
  const { data: c } = await supabase.from('hiring_contacts').select('email').eq('id', id).single();
  if (!c?.email) go(back, { err: 'This contact has no email.' });
  let status = 'unverified';
  let raw = '';
  try {
    const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(c!.email)}&api_key=${env.hunterKey}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.errors?.[0]?.details ?? `HTTP ${res.status}`);
    raw = data.data?.status ?? data.data?.result ?? '';
    status = raw === 'valid' || raw === 'deliverable' ? 'verified' : raw === 'invalid' || raw === 'undeliverable' ? 'invalid' : 'unverified';
  } catch (e) {
    go(back, { err: `Verification failed: ${errMsg(e)}` });
  }
  await supabase.from('hiring_contacts').update({ email_status: status }).eq('id', id);
  go(back, { msg: `Verification result for ${c!.email}: ${raw || 'unknown'} → ${status}.` });
}
