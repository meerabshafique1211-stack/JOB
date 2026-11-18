import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMime, sendGmail, type Attachment } from '@/lib/gmail';
import { markdownToDocx, safeFilename } from '@/lib/documents';
import { addBusinessDays, toDateStr } from '@/lib/utils';

export async function loadAttachment(sb: SupabaseClient, docId: string | null | undefined, fallbackName: string): Promise<Attachment | null> {
  if (!docId) return null;
  const { data: doc } = await sb.from('cv_documents').select('*').eq('id', docId).maybeSingle();
  if (!doc) return null;
  if (doc.storage_path) {
    const { data, error } = await sb.storage.from('documents').download(doc.storage_path);
    if (error || !data) throw new Error(`Could not load attachment “${doc.title}”: ${error?.message ?? 'missing'}`);
    const ext = doc.storage_path.split('.').pop();
    return { filename: `${safeFilename(fallbackName || doc.title)}.${ext}`, mimeType: doc.mime_type ?? 'application/octet-stream', content: Buffer.from(await data.arrayBuffer()) };
  }
  if (doc.content) {
    return {
      filename: `${safeFilename(fallbackName || doc.title)}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: await markdownToDocx(doc.content),
    };
  }
  return null;
}

export function dedupeKey(to: string, jobId: string | null, kind: string) {
  return `${to.toLowerCase()}|${jobId ?? 'nojob'}|${kind}`;
}

/** Sends through Gmail and records the result. Caller must have claimed the item first. */
export async function sendAndRecord(sb: SupabaseClient, opts: {
  token: string; fromEmail: string; fromName: string; to: string; subject: string; body: string;
  kind: string; jobId: string | null; contactId: string | null; draftId: string | null; applicationId: string | null;
  attachments: Attachment[]; parentSentId?: string | null;
}) {
  let threadId: string | null = null;
  let inReplyTo: string | null = null;
  if (opts.parentSentId) {
    const { data: parent } = await sb.from('sent_emails').select('gmail_thread_id, rfc_message_id').eq('id', opts.parentSentId).maybeSingle();
    threadId = parent?.gmail_thread_id ?? null;
    inReplyTo = parent?.rfc_message_id ?? null;
  }
  const mime = buildMime({
    from: `${opts.fromName} <${opts.fromEmail}>`, to: opts.to, subject: opts.subject, body: opts.body,
    inReplyTo, references: inReplyTo, attachments: opts.attachments,
  });
  const res = await sendGmail(opts.token, mime, threadId);
  const { data: sent, error } = await sb.from('sent_emails').insert({
    draft_id: opts.draftId, contact_id: opts.contactId, job_id: opts.jobId, application_id: opts.applicationId,
    to_email: opts.to.toLowerCase(), subject: opts.subject, body: opts.body, kind: opts.kind,
    gmail_message_id: res.id, gmail_thread_id: res.threadId, rfc_message_id: res.rfcId,
    dedupe_key: dedupeKey(opts.to, opts.jobId, opts.kind + (opts.applicationId ? ':application' : '')),
  }).select('id').single();
  if (error) throw new Error(`Sent (Gmail id ${res.id}) but failed to record: ${error.message}`);

  // Follow-up scheduling
  const now = new Date();
  if (opts.kind === 'cold' && !opts.applicationId) {
    await sb.from('follow_ups').upsert({ sent_email_id: sent.id, step: 1, due_date: toDateStr(addBusinessDays(now, 5)), status: 'pending' }, { onConflict: 'sent_email_id,step', ignoreDuplicates: true });
  } else if (opts.kind === 'followup1' && opts.parentSentId) {
    await sb.from('follow_ups').update({ status: 'sent' }).eq('sent_email_id', opts.parentSentId).eq('step', 1);
    await sb.from('follow_ups').upsert({ sent_email_id: opts.parentSentId, step: 2, due_date: toDateStr(addBusinessDays(now, 8)), status: 'pending' }, { onConflict: 'sent_email_id,step', ignoreDuplicates: true });
  } else if (opts.kind === 'followup2' && opts.parentSentId) {
    await sb.from('follow_ups').update({ status: 'sent' }).eq('sent_email_id', opts.parentSentId).eq('step', 2);
  }
  return { gmailId: res.id, sentId: sent.id as string };
}
