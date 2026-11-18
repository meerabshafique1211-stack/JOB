import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getProfile(sb: SupabaseClient) {
  const { data } = await sb.from('user_profile').select('*').eq('id', 1).maybeSingle();
  return data ?? {};
}

export async function getMasterCV(sb: SupabaseClient, id?: string | null) {
  if (id) {
    const { data } = await sb.from('cv_documents').select('*').eq('id', id).maybeSingle();
    if (data) return data;
  }
  const { data } = await sb.from('cv_documents').select('*').eq('kind', 'master').order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function isDoNotContact(sb: SupabaseClient, email: string | null | undefined) {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = e.split('@')[1] ?? '';
  const { data } = await sb.from('do_not_contact').select('email, domain');
  return (data ?? []).some((r: any) => (r.email && r.email.toLowerCase() === e) || (r.domain && domain && r.domain.toLowerCase() === domain));
}

export async function previouslyContacted(sb: SupabaseClient, email: string | null | undefined) {
  if (!email) return [];
  const { data } = await sb.from('sent_emails').select('id, subject, sent_at, kind').ilike('to_email', email);
  return data ?? [];
}
