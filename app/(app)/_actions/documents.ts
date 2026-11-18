'use server';
import crypto from 'node:crypto';
import { requireOwner } from '@/lib/supabase/server';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, extractText, sniffOk } from '@/lib/documents';
import { callClaude, profileContext, TRUTH_RULES } from '@/lib/claude';
import { logActivity } from '@/lib/activity';
import { str } from '@/lib/utils';
import { getProfile, getMasterCV } from './data';
import { go, errMsg, backTo } from './util';

export async function uploadCV(fd: FormData) {
  const { supabase } = await requireOwner();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) go('/documents', { err: 'Choose a PDF or DOCX file.' });
  const f = file as File;
  const ext = ALLOWED_UPLOAD_TYPES[f.type] ?? (f.name.toLowerCase().endsWith('.docx') ? 'docx' : f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : null);
  if (!ext) go('/documents', { err: 'Only PDF or DOCX files are accepted.' });
  if (f.size > MAX_UPLOAD_BYTES) go('/documents', { err: 'File is larger than 5 MB.' });
  const buf = Buffer.from(await f.arrayBuffer());
  if (!sniffOk(buf, ext!)) go('/documents', { err: 'The file content does not match its type. Upload a genuine PDF or DOCX.' });
  let text = '';
  let extractErr = '';
  try { text = await extractText(buf, ext!); } catch (e) { extractErr = errMsg(e); }
  const path = `cv/${crypto.randomUUID()}.${ext}`;
  const mime = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const { error: upErr } = await supabase.storage.from('documents').upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) go('/documents', { err: `Upload failed: ${upErr.message}` });
  const makePrimary = str(fd, 'primary') === 'on';
  if (makePrimary) await supabase.from('cv_documents').update({ is_primary: false }).eq('kind', 'master');
  const title = str(fd, 'title') || f.name.replace(/\.(pdf|docx)$/i, '');
  const { data, error } = await supabase.from('cv_documents').insert({
    kind: 'master', title, storage_path: path, mime_type: mime, size_bytes: f.size, content: text || null, is_primary: makePrimary,
  }).select('id').single();
  if (error) go('/documents', { err: error.message });
  if (makePrimary && text) await supabase.from('user_profile').update({ cv_text: text }).eq('id', 1);
  await logActivity(supabase, 'cv_uploaded', 'cv_document', data!.id, { title });
  go('/documents', { msg: text ? `Uploaded “${title}” and extracted ${text.length.toLocaleString()} characters of text.` : `Uploaded “${title}”, but text extraction failed (${extractErr}). Paste the CV text into the document editor so matching can use it.` });
}

export async function setPrimaryCV(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  await supabase.from('cv_documents').update({ is_primary: false }).eq('kind', 'master');
  const { data } = await supabase.from('cv_documents').update({ is_primary: true }).eq('id', id).select('content').single();
  if (data?.content) await supabase.from('user_profile').update({ cv_text: data.content }).eq('id', 1);
  go('/documents', { msg: 'Primary master CV updated.' });
}

export async function saveDocument(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { error } = await supabase.from('cv_documents').update({ title: str(fd, 'title'), content: str(fd, 'content') }).eq('id', id);
  if (error) go(`/documents/${id}`, { err: error.message });
  go(`/documents/${id}`, { msg: 'Document saved.' });
}

export async function deleteDocument(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { data: doc } = await supabase.from('cv_documents').select('storage_path').eq('id', id).single();
  const { error } = await supabase.from('cv_documents').delete().eq('id', id);
  if (error) go(`/documents/${id}`, { err: `Cannot delete: ${error.message} (it may be linked to an application or email).` });
  if (doc?.storage_path) await supabase.storage.from('documents').remove([doc.storage_path]);
  go('/documents', { msg: 'Document deleted.' });
}

export async function generateTailoredDocs(jobId: string, baseCvId: string | null, which: 'cv' | 'cover' | 'both') {
  const { supabase } = await requireOwner();
  const profile = await getProfile(supabase);
  const base = await getMasterCV(supabase, baseCvId);
  if (!base?.content) throw new Error('No master CV text found. Upload your CV in “CV & Cover Letters”.');
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) throw new Error('Job not found');
  const ctx = profileContext(profile, base.content);
  const jobCtx = `TARGET JOB\nCompany: ${job.company_name}\nTitle: ${job.title}\nLocation: ${job.location ?? ''}\nDescription:\n${(job.description ?? '').slice(0, 9000)}`;
  const out: { cvId?: string; coverId?: string } = {};
  const tasks: Promise<void>[] = [];
  if (which !== 'cover') {
    tasks.push((async () => {
      const { text, model } = await callClaude({
        model: profile.ai_model,
        system: `You tailor CVs for ATS systems. ${TRUTH_RULES}
- Keep every employer, job title, date and degree exactly as in the master CV.
- You may reorder bullets, re-word them for clarity, choose which skills to emphasize, and rewrite the summary using only true facts.
- Mirror the job's terminology only where the CV genuinely supports it.
- Output clean markdown only: "# Name", a contact line, "## Professional Summary", "## Core Skills" (bullets), "## Professional Experience" ("### Title — Company | dates" then bullets), "## Education", optional "## Tools". No tables, no images, no commentary.`,
        prompt: `${ctx}\n\n${jobCtx}\n\nWrite the tailored CV now.`,
        maxTokens: 3500,
      });
      const { data, error } = await supabase.from('cv_documents').insert({
        kind: 'tailored_cv', title: `CV – ${job.company_name} – ${job.title}`.slice(0, 150), mime_type: 'text/markdown',
        content: text.replace(/^```(markdown)?\n?|```$/g, '').trim(), job_id: job.id, based_on_id: base.id,
      }).select('id').single();
      if (error) throw new Error(error.message);
      out.cvId = data.id;
      await logActivity(supabase, 'cv_tailored', 'cv_document', data.id, { job_id: job.id, model });
    })());
  }
  if (which !== 'cv') {
    tasks.push((async () => {
      const { text, model } = await callClaude({
        model: profile.ai_model,
        system: `You write concise, specific cover letters (220–320 words). ${TRUTH_RULES}
- Plain, warm, professional English. No clichés ("I am thrilled", "perfect fit", "dynamic"), no exaggeration.
- Mention 2–3 concrete, true experiences that map to the job's needs.
- State plainly that she is based in Lahore, Pakistan, and (as appropriate for the job) available to work remotely or would need visa sponsorship to relocate.
- Output plain text with paragraphs, starting with "Dear Hiring Team," (or a named person if given) and ending with the signature block provided.`,
        prompt: `${ctx}\n\nSignature block:\n${profile.email_signature ?? profile.full_name}\n\n${jobCtx}\n\nWrite the cover letter now.`,
        maxTokens: 1200,
      });
      const { data, error } = await supabase.from('cv_documents').insert({
        kind: 'cover_letter', title: `Cover letter – ${job.company_name} – ${job.title}`.slice(0, 150), mime_type: 'text/plain',
        content: text.trim(), job_id: job.id, based_on_id: base.id,
      }).select('id').single();
      if (error) throw new Error(error.message);
      out.coverId = data.id;
      await logActivity(supabase, 'cover_letter_generated', 'cv_document', data.id, { job_id: job.id, model });
    })());
  }
  const res = await Promise.allSettled(tasks);
  const failed = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed && !out.cvId && !out.coverId) throw failed.reason;
  if (job.pipeline_status === 'New' || job.pipeline_status === 'Under Review' || job.pipeline_status === 'Shortlisted') {
    await supabase.from('jobs').update({ pipeline_status: 'CV Prepared' }).eq('id', job.id);
  }
  return out;
}

export async function generateDocsAction(fd: FormData) {
  await requireOwner();
  const jobId = str(fd, 'job_id');
  const which = (str(fd, 'which') || 'both') as 'cv' | 'cover' | 'both';
  const back = backTo(fd, `/jobs/${jobId}`);
  const r = await generateTailoredDocs(jobId, str(fd, 'base_cv_id') || null, which).then((o) => ({ o, e: null as string | null }), (e) => ({ o: null, e: errMsg(e) }));
  if (!r.o) go(back, { err: r.e! });
  go(back, { msg: `Generated ${[r.o!.cvId && 'a tailored CV', r.o!.coverId && 'a cover letter'].filter(Boolean).join(' and ')}. Review them in CV & Cover Letters before using.` });
}
