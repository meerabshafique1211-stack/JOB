'use server';
import { requireOwner } from '@/lib/supabase/server';
import { getAccessToken, getThread, searchMessages, getMessageMeta, GmailNotConnected } from '@/lib/gmail';
import { callClaudeJSON, profileContext, TRUTH_RULES } from '@/lib/claude';
import { logActivity } from '@/lib/activity';
import { str, strOrNull } from '@/lib/utils';
import { getProfile, getMasterCV } from './data';
import { go, errMsg, backTo } from './util';

const OPT_OUT = /\b(unsubscribe|remove me|stop (emailing|contacting)|do not contact|don't contact|not interested|no longer interested|please don't email)\b/i;
const REJECTION = /\b(unfortunately|not (be )?moving forward|decided to (move|proceed) with other|position has been filled|not a fit at this time)\b/i;

export async function syncReplies(fd: FormData) {
  const { supabase } = await requireOwner();
  const back = backTo(fd, '/outreach');
  let gmail!: { token: string; email: string };
  try {
    gmail = await getAccessToken(supabase);
  } catch (e) {
    go(back, { err: e instanceof GmailNotConnected ? e.message : errMsg(e) });
  }
  const me = gmail!.email.toLowerCase();
  const { data: sent } = await supabase.from('sent_emails').select('*').in('delivery_status', ['sent']).not('gmail_thread_id', 'is', null).order('sent_at', { ascending: false }).limit(60);
  let replies = 0, bounces = 0, optOuts = 0, checked = 0;
  const errors: string[] = [];
  for (const s of sent ?? []) {
    try {
      const t = await getThread(gmail!.token, s.gmail_thread_id);
      checked++;
      const sentTime = new Date(s.sent_at).getTime();
      for (const m of t.messages ?? []) {
        if (Number(m.internalDate) <= sentTime) continue;
        const from = (m.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === 'from')?.value ?? '';
        if (from.toLowerCase().includes(me)) continue;
        const snippet = m.snippet ?? '';
        if (/mailer-daemon|postmaster|mail delivery (subsystem|system)/i.test(from)) {
          await supabase.from('sent_emails').update({ delivery_status: 'bounced', reply_snippet: snippet.slice(0, 300), last_checked_at: new Date().toISOString() }).eq('id', s.id);
          if (s.contact_id) await supabase.from('hiring_contacts').update({ email_status: 'invalid' }).eq('id', s.contact_id);
          await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('sent_email_id', s.id).eq('status', 'pending');
          bounces++;
        } else {
          const optOut = OPT_OUT.test(snippet);
          await supabase.from('sent_emails').update({ delivery_status: optOut ? 'opted_out' : 'replied', replied_at: new Date(Number(m.internalDate)).toISOString(), reply_snippet: snippet.slice(0, 300), from_reply: from.slice(0, 200), last_checked_at: new Date().toISOString() }).eq('id', s.id);
          await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('sent_email_id', s.id).eq('status', 'pending');
          if (optOut) {
            await supabase.from('do_not_contact').insert({ email: s.to_email, reason: `Opted out in reply: “${snippet.slice(0, 120)}”` });
            optOuts++;
          }
          if (s.job_id) await supabase.from('jobs').update({ pipeline_status: REJECTION.test(snippet) ? 'Rejected' : 'Response Received' }).eq('id', s.job_id);
          replies++;
        }
        break;
      }
      await supabase.from('sent_emails').update({ last_checked_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      errors.push(errMsg(e));
    }
  }
  // Bounces that arrive outside the original thread
  try {
    const msgs = await searchMessages(gmail!.token, 'from:(mailer-daemon OR postmaster) newer_than:30d', 20);
    for (const m of msgs) {
      const meta = await getMessageMeta(gmail!.token, m.id);
      const snip = (meta.snippet ?? '').toLowerCase();
      for (const s of sent ?? []) {
        if (s.delivery_status === 'sent' && snip.includes(s.to_email.toLowerCase())) {
          await supabase.from('sent_emails').update({ delivery_status: 'bounced', reply_snippet: (meta.snippet ?? '').slice(0, 300) }).eq('id', s.id).eq('delivery_status', 'sent');
          await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('sent_email_id', s.id).eq('status', 'pending');
          bounces++;
        }
      }
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  await logActivity(supabase, 'gmail_sync', 'sent_emails', null, { checked, replies, bounces, optOuts, errors: errors.slice(0, 3) });
  go(back, { msg: `Checked ${checked} threads: ${replies} replies, ${bounces} bounces, ${optOuts} opt-outs.${errors.length ? ` ${errors.length} error(s): ${errors[0]}` : ''}` });
}

export async function draftFollowUp(fd: FormData) {
  const { supabase } = await requireOwner();
  const fuId = str(fd, 'id');
  const back = backTo(fd, '/follow-ups');
  const r = await (async () => {
    const { data: fu } = await supabase.from('follow_ups').select('*, sent_emails(*)').eq('id', fuId).single();
    if (!fu) throw new Error('Follow-up not found');
    if (fu.status !== 'pending') throw new Error('A follow-up draft already exists or it was cancelled.');
    const s: any = fu.sent_emails;
    if (s.delivery_status !== 'sent') throw new Error(`Not drafting: the original email status is “${s.delivery_status}”.`);
    const profile = await getProfile(supabase);
    const cv = await getMasterCV(supabase);
    const { data: job } = s.job_id ? await supabase.from('jobs').select('title, company_name, vacancy_status').eq('id', s.job_id).single() : { data: null };
    const { data } = await callClaudeJSON<{ body: string }>({
      model: profile.ai_model,
      system: `You write brief, polite follow-up emails (${fu.step === 1 ? '50–80' : '40–60'} words) replying in the same thread. ${TRUTH_RULES}
${fu.step === 1 ? 'First follow-up: gently resurface the original message, add one new relevant detail from the CV, ask if they had a chance to consider it.' : 'Second and final follow-up: short, gracious, offer to provide anything needed, and say you will not follow up again.'}
No guilt-tripping, no "just bumping this". End with the signature block.`,
      prompt: `${profileContext(profile, cv?.content ?? '')}\n\nSIGNATURE:\n${profile.email_signature ?? profile.full_name}\n\nORIGINAL EMAIL (sent ${s.sent_at}) to ${s.to_email}:\nSubject: ${s.subject}\n${s.body}\n\n${job ? `Vacancy: ${job.title} at ${job.company_name} (status ${job.vacancy_status})` : ''}\n\nReturn JSON {"body":"..."}`,
      maxTokens: 500,
    });
    const subject = s.subject?.startsWith('Re:') ? s.subject : `Re: ${s.subject ?? ''}`;
    const { data: draft, error } = await supabase.from('email_drafts').insert({
      contact_id: s.contact_id, job_id: s.job_id, kind: fu.step === 1 ? 'followup1' : 'followup2', to_email: s.to_email,
      subject, body: data.body.trim(), status: 'draft', parent_sent_id: s.id, warnings: [],
    }).select('id').single();
    if (error) throw new Error(error.message);
    await supabase.from('follow_ups').update({ status: 'drafted', draft_id: draft.id }).eq('id', fuId);
    await logActivity(supabase, 'followup_drafted', 'email_draft', draft.id, { step: fu.step });
    return draft.id as string;
  })().then((id) => ({ id, e: null as string | null }), (e) => ({ id: null, e: errMsg(e) }));
  if (!r.id) go(back, { err: r.e! });
  go(`/emails/${r.id}`, { msg: 'Follow-up drafted. Add it to a batch to send — follow-ups are never sent without batch approval.' });
}

export async function cancelFollowUp(fd: FormData) {
  const { supabase } = await requireOwner();
  await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('id', str(fd, 'id'));
  go(backTo(fd, '/follow-ups'), { msg: 'Follow-up cancelled.' });
}

export async function markSentStatus(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const status = str(fd, 'delivery_status');
  const { data: s } = await supabase.from('sent_emails').update({ delivery_status: status, replied_at: status === 'replied' ? new Date().toISOString() : null }).eq('id', id).select('to_email, job_id').single();
  if (status !== 'sent') await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('sent_email_id', id).eq('status', 'pending');
  if (status === 'opted_out' && s) await supabase.from('do_not_contact').insert({ email: s.to_email, reason: 'Marked opted-out manually' });
  if (status === 'replied' && s?.job_id) await supabase.from('jobs').update({ pipeline_status: 'Response Received' }).eq('id', s.job_id);
  go(backTo(fd, '/outreach'), { msg: 'Updated.' });
}

export async function saveInterview(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = strOrNull(fd, 'id');
  const jobId = strOrNull(fd, 'job_id');
  let company = strOrNull(fd, 'company_name');
  if (jobId && !company) {
    const { data: j } = await supabase.from('jobs').select('company_name').eq('id', jobId).single();
    company = j?.company_name ?? null;
  }
  const when = strOrNull(fd, 'scheduled_at');
  const row = {
    job_id: jobId, company_name: company, scheduled_at: when ? new Date(when + ':00+05:00').toISOString() : null,
    kind: strOrNull(fd, 'kind'), link: strOrNull(fd, 'link'), notes: strOrNull(fd, 'notes'), outcome: strOrNull(fd, 'outcome'),
  };
  const { error } = id ? await supabase.from('interviews').update(row).eq('id', id) : await supabase.from('interviews').insert(row);
  if (error) go('/interviews', { err: error.message });
  if (jobId) {
    const status = row.outcome === 'Offer' ? 'Offer Received' : row.outcome === 'Rejected' ? 'Rejected' : 'Interview Scheduled';
    await supabase.from('jobs').update({ pipeline_status: status }).eq('id', jobId);
    await supabase.from('applications').update({ status }).eq('job_id', jobId);
  }
  await logActivity(supabase, id ? 'interview_updated' : 'interview_added', 'interview', id, row);
  go('/interviews', { msg: 'Interview saved.' });
}

export async function deleteInterview(fd: FormData) {
  const { supabase } = await requireOwner();
  await supabase.from('interviews').delete().eq('id', str(fd, 'id'));
  go('/interviews', { msg: 'Interview deleted.' });
}
