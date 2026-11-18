'use server';
import { requireOwner } from '@/lib/supabase/server';
import { getAccessToken, GmailNotConnected } from '@/lib/gmail';
import { loadAttachment, sendAndRecord, dedupeKey } from '@/lib/send';
import { logActivity } from '@/lib/activity';
import { str, strOrNull } from '@/lib/utils';
import { getProfile, isDoNotContact } from './data';
import { go, errMsg, backTo } from './util';

export async function createBatch(fd: FormData) {
  const { supabase } = await requireOwner();
  const draftIds = fd.getAll('draft_ids').map(String).filter(Boolean);
  const appIds = fd.getAll('application_ids').map(String).filter(Boolean);
  const back = backTo(fd, '/batches');
  if (!draftIds.length && !appIds.length) go(back, { err: 'Select at least one email or application.' });
  const { data: batch, error } = await supabase.from('email_batches').insert({ title: strOrNull(fd, 'title') ?? `Batch ${new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })}`, status: 'open' }).select('id').single();
  if (error) go(back, { err: error.message });
  let e = 0, a = 0;
  if (draftIds.length) {
    const { data } = await supabase.from('email_drafts').update({ batch_id: batch!.id, status: 'in_batch' })
      .in('id', draftIds).in('status', ['draft', 'failed', 'skipped']).in('kind', ['cold', 'followup1', 'followup2']).select('id, job_id');
    e = data?.length ?? 0;
    const jobIds = Array.from(new Set((data ?? []).map((d: any) => d.job_id).filter(Boolean)));
    if (jobIds.length) await supabase.from('jobs').update({ pipeline_status: 'Awaiting Batch Approval' }).in('id', jobIds).in('pipeline_status', ['New', 'Under Review', 'Shortlisted', 'CV Prepared', 'Draft Ready']);
  }
  if (appIds.length) {
    const { data } = await supabase.from('applications').update({ batch_id: batch!.id, approval_status: 'in_batch', status: 'Awaiting Batch Approval' })
      .in('id', appIds).in('approval_status', ['none', 'rejected', 'failed']).is('submitted_at', null).select('id, job_id');
    a = data?.length ?? 0;
    const jobIds = (data ?? []).map((d: any) => d.job_id);
    if (jobIds.length) await supabase.from('jobs').update({ pipeline_status: 'Awaiting Batch Approval' }).in('id', jobIds);
  }
  if (!e && !a) {
    await supabase.from('email_batches').delete().eq('id', batch!.id);
    go(back, { err: 'None of the selected items could be added (they may already be in another batch, approved or sent).' });
  }
  await logActivity(supabase, 'batch_created', 'batch', batch!.id, { emails: e, applications: a });
  go(`/batches/${batch!.id}`, { msg: `Batch created with ${e} email(s) and ${a} application(s). Review each item, then approve.` });
}

async function assertOpen(supabase: any, batchId: string) {
  const { data } = await supabase.from('email_batches').select('status').eq('id', batchId).single();
  if (data?.status !== 'open') go(`/batches/${batchId}`, { err: 'This batch is already approved. Items can no longer be added, removed or edited — create a new batch instead.' });
}

export async function removeFromBatch(fd: FormData) {
  const { supabase } = await requireOwner();
  const batchId = str(fd, 'batch_id');
  await assertOpen(supabase, batchId);
  const type = str(fd, 'type');
  const id = str(fd, 'id');
  const reject = str(fd, 'reject') === 'true';
  if (type === 'email') await supabase.from('email_drafts').update({ batch_id: null, status: reject ? 'rejected' : 'draft' }).eq('id', id).eq('batch_id', batchId);
  else await supabase.from('applications').update({ batch_id: null, approval_status: reject ? 'rejected' : 'none', status: 'Draft Ready' }).eq('id', id).eq('batch_id', batchId);
  go(`/batches/${batchId}`, { msg: reject ? 'Item rejected and removed from the batch.' : 'Item removed from the batch.' });
}

export async function approveBatch(fd: FormData) {
  const { supabase } = await requireOwner();
  const batchId = str(fd, 'batch_id');
  await assertOpen(supabase, batchId);
  const expectedE = parseInt(str(fd, 'expected_emails') || '-1', 10);
  const expectedA = parseInt(str(fd, 'expected_applications') || '-1', 10);
  const { data: drafts } = await supabase.from('email_drafts').select('id, to_email, subject, contact_id, job_id, kind').eq('batch_id', batchId).eq('status', 'in_batch');
  const { data: apps } = await supabase.from('applications').select('id, job_id, channel, apply_email, apply_url').eq('batch_id', batchId).eq('approval_status', 'in_batch');
  const e = drafts ?? [], a = apps ?? [];
  if (e.length !== expectedE || a.length !== expectedA) go(`/batches/${batchId}`, { err: 'The batch changed since you loaded this page. Review the list again before approving.' });
  if (!e.length && !a.length) go(`/batches/${batchId}`, { err: 'The batch is empty.' });
  const { error } = await supabase.from('batch_approvals').insert({
    batch_id: batchId, email_ids: e.map((d: any) => d.id), application_ids: a.map((x: any) => x.id), snapshot: { emails: e, applications: a },
  });
  if (error) go(`/batches/${batchId}`, { err: error.message });
  await supabase.from('email_batches').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', batchId);
  if (e.length) await supabase.from('email_drafts').update({ status: 'approved' }).in('id', e.map((d: any) => d.id));
  if (a.length) await supabase.from('applications').update({ approval_status: 'approved' }).in('id', a.map((x: any) => x.id));
  await logActivity(supabase, 'batch_approved', 'batch', batchId, { emails: e.length, applications: a.length });
  go(`/batches/${batchId}`, { msg: `Approved ${e.length} email(s) and ${a.length} application(s). Click “Execute approved batch” to send.` });
}

export async function cancelBatch(fd: FormData) {
  const { supabase } = await requireOwner();
  const batchId = str(fd, 'batch_id');
  const { data: b } = await supabase.from('email_batches').select('status').eq('id', batchId).single();
  if (!b || !['open', 'approved'].includes(b.status)) go(`/batches/${batchId}`, { err: 'Only open or not-yet-executed batches can be cancelled.' });
  await supabase.from('email_drafts').update({ batch_id: null, status: 'draft' }).eq('batch_id', batchId).in('status', ['in_batch', 'approved']);
  await supabase.from('applications').update({ batch_id: null, approval_status: 'none', status: 'Draft Ready' }).eq('batch_id', batchId).in('approval_status', ['in_batch', 'approved']).is('submitted_at', null);
  await supabase.from('email_batches').update({ status: 'cancelled' }).eq('id', batchId);
  await logActivity(supabase, 'batch_cancelled', 'batch', batchId, null);
  go('/batches', { msg: 'Batch cancelled; its items are back in draft.' });
}

export async function executeBatch(fd: FormData) {
  const { supabase } = await requireOwner();
  const batchId = str(fd, 'batch_id');
  const { data: batch } = await supabase.from('email_batches').select('*').eq('id', batchId).single();
  if (!batch || !['approved', 'executing'].includes(batch.status)) go(`/batches/${batchId}`, { err: 'Only an approved batch can be executed.' });
  const { data: approval } = await supabase.from('batch_approvals').select('*').eq('batch_id', batchId).single();
  if (!approval) go(`/batches/${batchId}`, { err: 'No approval record found for this batch.' });
  const profile = await getProfile(supabase);

  let gmail: { token: string; email: string } | null = null;
  let gmailError = '';
  try { gmail = await getAccessToken(supabase); } catch (e) { gmailError = e instanceof GmailNotConnected ? e.message : errMsg(e); }

  await supabase.from('email_batches').update({ status: 'executing' }).eq('id', batchId);
  const tally = { sent: 0, submitted: 0, failed: 0, skipped: 0, duplicate: 0, awaiting: 0 };

  // ---- Emails: only IDs captured at approval time ----
  for (const id of (approval!.email_ids ?? []) as string[]) {
    const { data: claimed } = await supabase.from('email_drafts').update({ status: 'sending' }).eq('id', id).eq('status', 'approved').select('*, hiring_contacts(email, email_status, name)').maybeSingle();
    if (!claimed) continue; // already processed – never send twice
    const d: any = claimed;
    const finish = async (status: string, message: string) => {
      await supabase.from('email_drafts').update({ status, result_message: message, updated_at: new Date().toISOString() }).eq('id', id);
    };
    const to = (d.to_email || d.hiring_contacts?.email || '').toLowerCase();
    const emailStatus = d.hiring_contacts?.email_status ?? (d.parent_sent_id ? 'verified' : 'none');
    if (!to) { await finish('skipped', 'No recipient email address.'); tally.skipped++; continue; }
    if (await isDoNotContact(supabase, to)) { await finish('skipped', 'Recipient is on the Do-Not-Contact list.'); tally.skipped++; continue; }
    if (!d.parent_sent_id && !['verified', 'public_source'].includes(emailStatus)) { await finish('skipped', `Email address is “${emailStatus}”, not verified. Verify it or mark the public source, then include it in a new batch.`); tally.skipped++; continue; }
    if (d.contact_id && d.hiring_contacts?.email && d.hiring_contacts.email.toLowerCase() !== to && !d.parent_sent_id) {
      // Address edited away from the verified one
      await finish('skipped', 'The draft’s address differs from the contact’s verified address.'); tally.skipped++; continue;
    }
    const { data: dup } = await supabase.from('sent_emails').select('id').eq('dedupe_key', dedupeKey(to, d.job_id, d.kind)).maybeSingle();
    if (dup) { await finish('duplicate', 'Duplicate prevented: this message type was already sent to this address for this vacancy.'); tally.duplicate++; continue; }
    if (!gmail) { await supabase.from('email_drafts').update({ status: 'approved', result_message: gmailError }).eq('id', id); tally.failed++; continue; }
    try {
      const att = d.attachment_doc_id ? await loadAttachment(supabase, d.attachment_doc_id, `${profile.full_name ?? 'CV'} CV`) : null;
      const res = await sendAndRecord(supabase, {
        token: gmail.token, fromEmail: gmail.email, fromName: profile.full_name ?? '', to, subject: d.subject ?? '(no subject)', body: d.body,
        kind: d.kind, jobId: d.job_id, contactId: d.contact_id, draftId: d.id, applicationId: null, attachments: att ? [att] : [], parentSentId: d.parent_sent_id,
      });
      await finish('sent', `Sent via Gmail (message ${res.gmailId}).`);
      if (d.job_id) await supabase.from('jobs').update({ pipeline_status: 'Email Sent' }).eq('id', d.job_id).not('pipeline_status', 'in', '("Applied","Response Received","Interview Scheduled","Offer Received","Rejected","Closed")');
      tally.sent++;
    } catch (e) {
      await finish('failed', errMsg(e));
      tally.failed++;
    }
  }

  // ---- Applications ----
  for (const id of (approval!.application_ids ?? []) as string[]) {
    const { data: app } = await supabase.from('applications').select('*, jobs(title, company_name, pipeline_status)').eq('id', id).single();
    if (!app || app.approval_status !== 'approved' || app.submitted_at) continue;
    const setApp = async (patch: any) => { await supabase.from('applications').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); };
    if (app.extra_approval_reason) {
      await setApp({ approval_status: 'needs_extra_approval', result_message: `Stopped for your additional approval: ${app.extra_approval_reason}` });
      tally.awaiting++; continue;
    }
    if ((app.form_answers ?? []).some((x: any) => x.needs_input)) {
      await setApp({ result_message: 'Some form answers still say NEEDS YOUR INPUT. Complete them on the employer site when you submit.' });
    }
    if (app.channel === 'email' && app.apply_email) {
      const to = app.apply_email.toLowerCase();
      if (await isDoNotContact(supabase, to)) { await setApp({ approval_status: 'failed', result_message: 'Application address is on the Do-Not-Contact list.' }); tally.skipped++; continue; }
      const { data: dup } = await supabase.from('sent_emails').select('id').eq('dedupe_key', dedupeKey(to, app.job_id, 'cold:application')).maybeSingle();
      if (dup) { await setApp({ approval_status: 'submitted', result_message: 'Duplicate prevented: an application email was already sent.' }); tally.duplicate++; continue; }
      if (!gmail) { await setApp({ result_message: gmailError }); tally.failed++; continue; }
      try {
        const { data: cover } = app.cover_doc_id ? await supabase.from('cv_documents').select('content').eq('id', app.cover_doc_id).single() : { data: null };
        const atts = [];
        const cvAtt = await loadAttachment(supabase, app.cv_doc_id, `${profile.full_name ?? ''} CV ${app.jobs?.company_name ?? ''}`);
        if (cvAtt) atts.push(cvAtt);
        const clAtt = await loadAttachment(supabase, app.cover_doc_id, `${profile.full_name ?? ''} Cover Letter ${app.jobs?.company_name ?? ''}`);
        if (clAtt) atts.push(clAtt);
        const subject = `Application: ${app.jobs?.title ?? 'Open position'} – ${profile.full_name ?? ''}`;
        const res = await sendAndRecord(supabase, {
          token: gmail.token, fromEmail: gmail.email, fromName: profile.full_name ?? '', to, subject,
          body: cover?.content ?? `Dear Hiring Team,\n\nPlease find attached my CV for the ${app.jobs?.title} position.\n\n${profile.email_signature ?? ''}`,
          kind: 'cold', jobId: app.job_id, contactId: null, draftId: null, applicationId: app.id, attachments: atts,
        });
        await setApp({ approval_status: 'submitted', submitted_at: new Date().toISOString(), confirmation: `Gmail message ${res.gmailId}`, status: 'Applied', result_message: `Application emailed to ${to}.` });
        await supabase.from('jobs').update({ pipeline_status: 'Applied' }).eq('id', app.job_id);
        tally.submitted++;
      } catch (e) {
        await setApp({ approval_status: 'failed', result_message: errMsg(e) });
        tally.failed++;
      }
    } else {
      await setApp({ result_message: 'Approved. This employer uses an online form that cannot be submitted automatically without bypassing its security. Open the vacancy, paste the prepared answers, upload the tailored CV, submit, then click “Mark submitted”.' });
      tally.awaiting++;
    }
  }

  const retryable = !gmail && tally.failed > 0;
  await supabase.from('email_batches').update(retryable ? { status: 'approved' } : { status: 'completed', completed_at: new Date().toISOString() }).eq('id', batchId);
  await logActivity(supabase, 'batch_executed', 'batch', batchId, tally);
  go(`/batches/${batchId}`, {
    msg: `Executed: ${tally.sent} sent, ${tally.submitted} applications submitted, ${tally.failed} failed, ${tally.skipped} skipped, ${tally.duplicate} duplicates prevented, ${tally.awaiting} awaiting your action.${gmailError && (tally.failed > 0) ? ' Gmail: ' + gmailError : ''}`,
  });
}
