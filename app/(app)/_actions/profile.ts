'use server';
import { requireOwner } from '@/lib/supabase/server';
import { lines, str, strOrNull } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { go } from './util';

export async function saveProfile(fd: FormData) {
  const { supabase } = await requireOwner();
  let experience: any = undefined;
  let education: any = undefined;
  try {
    const e = str(fd, 'experience_json');
    if (e) experience = JSON.parse(e);
    const ed = str(fd, 'education_json');
    if (ed) education = JSON.parse(ed);
  } catch {
    go('/settings', { err: 'Experience/Education must be valid JSON. Nothing was saved.' });
  }
  const minSal = str(fd, 'min_salary_eur');
  const years = str(fd, 'years_experience');
  const patch: any = {
    full_name: strOrNull(fd, 'full_name'), headline: strOrNull(fd, 'headline'), email: strOrNull(fd, 'email'),
    phone: strOrNull(fd, 'phone'), location: strOrNull(fd, 'location'), linkedin_url: strOrNull(fd, 'linkedin_url'),
    portfolio_url: strOrNull(fd, 'portfolio_url'), summary: strOrNull(fd, 'summary'),
    skills: lines(str(fd, 'skills')), tools: lines(str(fd, 'tools')),
    years_experience: years ? Number(years) : null, min_salary_eur: minSal ? parseInt(minSal, 10) : null,
    salary_expectation: strOrNull(fd, 'salary_expectation'), notice_period: strOrNull(fd, 'notice_period'),
    work_authorization: strOrNull(fd, 'work_authorization'), email_signature: strOrNull(fd, 'email_signature'),
    ai_model: strOrNull(fd, 'ai_model'), updated_at: new Date().toISOString(),
  };
  if (experience !== undefined) patch.experience = experience;
  if (education !== undefined) patch.education = education;
  const { error } = await supabase.from('user_profile').update(patch).eq('id', 1);
  if (error) go('/settings', { err: error.message });
  await logActivity(supabase, 'profile_updated', 'profile', null, null);
  go('/settings', { msg: 'Profile saved.' });
}

export async function saveSearchPrefs(fd: FormData) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from('user_profile').update({
    target_titles: lines(str(fd, 'target_titles').replace(/,/g, '\n')),
    title_keywords: str(fd, 'title_keywords').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
    exclude_keywords: str(fd, 'exclude_keywords').split('\n').map((s) => s.toLowerCase()).filter((s) => s.trim()),
    target_countries: lines(str(fd, 'target_countries')),
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) go('/settings?tab=search', { err: error.message });
  go('/settings?tab=search', { msg: 'Search preferences saved.' });
}

export async function addDoNotContact(fd: FormData) {
  const { supabase } = await requireOwner();
  const email = strOrNull(fd, 'email')?.toLowerCase() ?? null;
  const domain = strOrNull(fd, 'domain')?.toLowerCase().replace(/^@/, '') ?? null;
  if (!email && !domain) go('/settings?tab=dnc', { err: 'Enter an email or a domain.' });
  const { error } = await supabase.from('do_not_contact').insert({ email, domain, reason: strOrNull(fd, 'reason') });
  if (error && !/duplicate/i.test(error.message)) go('/settings?tab=dnc', { err: error.message });
  await logActivity(supabase, 'dnc_added', 'do_not_contact', null, { email, domain });
  go(str(fd, 'return_to') || '/settings?tab=dnc', { msg: `${email ?? domain} added to Do-Not-Contact.` });
}

export async function removeDoNotContact(fd: FormData) {
  const { supabase } = await requireOwner();
  await supabase.from('do_not_contact').delete().eq('id', str(fd, 'id'));
  go('/settings?tab=dnc', { msg: 'Removed from Do-Not-Contact.' });
}
