'use server';
import { requireOwner } from '@/lib/supabase/server';
import { callClaudeJSON, profileContext, TRUTH_RULES } from '@/lib/claude';
import { extraApprovalFlags, extractApplyEmail } from '@/lib/jobs/classify';
import { logActivity } from '@/lib/activity';
import { str, strOrNull } from '@/lib/utils';
import { getProfile, getMasterCV } from './data';
import { generateTailoredDocs } from './documents';
import { go, errMsg, backTo } from './util';

export async function prepareApplication(fd: FormData) {
  const { supabase } = await requireOwner();
  const jobId = str(fd, 'job_id');
  const back = backTo(fd, `/jobs/${jobId}`);
  const { data: existing } = await supabase.from('applications').select('id, submitted_at, approval_status').eq('job_id', jobId).maybeSingle();
  if (existing?.submitted_at) go(`/applications/${existing.id}`, { err: 'You already applied to this vacancy (duplicate prevented).' });
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) go('/jobs', { err: 'Vacancy not found.' });
  if (job!.pipeline_status === 'Applied') go(back, { err: 'This vacancy is already marked Applied (duplicate prevented).' });

  const r = await (async () => {
    const profile = await getProfile(supabase);
    const cv = await getMasterCV(supabase, strOrNull(fd, 'base_cv_id'));
    const docs = await generateTailoredDocs(jobId, cv?.id ?? null, 'both');
    const { data } = await callClaudeJSON<{ answers: { question: string; answer: string; needs_input: boolean }[]; missing: string[] }>({
      model: profile.ai_model,
      system: `You prepare answers for a job application form. ${TRUTH_RULES}
- Answer ONLY from the profile. If the profile does not contain the answer (e.g. salary expectation not set, references, a certification she lacks, a language level not stated), set needs_input=true and answer "NEEDS YOUR INPUT: <what is needed>".
- Never answer yes to legal/eligibility questions she cannot truthfully confirm (e.g. EU work permit). Work authorization must follow the profile.
- Keep answers short and factual.`,
      prompt: `${profileContext(profile, cv?.content ?? '')}

JOB: ${job!.title} at ${job!.company_name} (${job!.location ?? ''})
DESCRIPTION:
${(job!.description ?? '').slice(0, 7000)}

Prepare answers to the screening questions this employer is likely to ask, including: full name, email, phone, LinkedIn, location/country of residence, current job title, years of relevant experience, work authorization / need for sponsorship, willingness to relocate, remote availability and time-zone overlap, notice period, salary expectation, highest education, English level, why this company/role (2–3 sentences), and any questions explicitly mentioned in the posting.
Return JSON {"answers":[{"question":"...","answer":"...","needs_input":false}],"missing":["short list of information she must provide"]}`,
      maxTokens: 2000,
    });
    const flags = extraApprovalFlags(job!.description ?? '');
    const applyEmail = job!.apply_email ?? extractApplyEmail(job!.description ?? '');
    const row = {
      job_id: jobId, status: 'Draft Ready', apply_url: job!.url, cv_doc_id: docs.cvId ?? null, cover_doc_id: docs.coverId ?? null,
      form_answers: data.answers ?? [], missing_info: data.missing ?? [], approval_status: 'none',
      extra_approval_reason: flags.length ? flags.join(' ') : null, channel: applyEmail ? 'email' : 'portal', apply_email: applyEmail,
      updated_at: new Date().toISOString(), result_message: null,
    };
    let appId = existing?.id as string | undefined;
    if (appId) {
      const { error } = await supabase.from('applications').update(row).eq('id', appId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from('applications').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      appId = ins.id;
    }
    for (const d of [docs.cvId, docs.coverId].filter(Boolean)) {
      await supabase.from('application_documents').upsert({ application_id: appId, document_id: d }, { onConflict: 'application_id,document_id', ignoreDuplicates: true });
    }
    await supabase.from('jobs').update({ pipeline_status: 'Draft Ready' }).eq('id', jobId);
    await logActivity(supabase, 'application_prepared', 'application', appId, { job_id: jobId });
    return appId!;
  })().then((id) => ({ id, e: null as string | null }), (e) => ({ id: null, e: errMsg(e) }));
  if (!r.id) go(back, { err: `Preparing the application failed: ${r.e}` });
  go(`/applications/${r.id}`, { msg: 'Application prepared: tailored CV, cover letter and form answers. Review everything, then add it to a batch.' });
}

export async function updateApplication(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { data: app } = await supabase.from('applications').select('approval_status').eq('id', id).single();
  if (app && ['approved', 'submitted'].includes(app.approval_status)) go(`/applications/${id}`, { err: 'This application is approved/submitted; edits are locked.' });
  const qs = fd.getAll('q').map(String);
  const as = fd.getAll('a').map(String);
  const answers = qs.map((q, i) => ({ question: q, answer: as[i] ?? '', needs_input: /NEEDS YOUR INPUT/i.test(as[i] ?? '') })).filter((x) => x.question);
  const patch: any = {
    form_answers: answers, notes: strOrNull(fd, 'notes'), apply_email: strOrNull(fd, 'apply_email')?.toLowerCase() ?? null,
    apply_url: strOrNull(fd, 'apply_url'), cv_doc_id: strOrNull(fd, 'cv_doc_id'), cover_doc_id: strOrNull(fd, 'cover_doc_id'),
    updated_at: new Date().toISOString(),
  };
  patch.channel = patch.apply_email ? 'email' : 'portal';
  const { error } = await supabase.from('applications').update(patch).eq('id', id);
  if (error) go(`/applications/${id}`, { err: error.message });
  go(`/applications/${id}`, { msg: 'Application saved.' });
}

export async function setApplicationStatus(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  const { data } = await supabase.from('applications').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('job_id').single();
  if (data?.job_id) await supabase.from('jobs').update({ pipeline_status: status }).eq('id', data.job_id);
  await logActivity(supabase, 'application_status', 'application', id, { status });
  go(backTo(fd, `/applications/${id}`), { msg: `Status set to ${status}.` });
}

/** For portal applications: the user submits on the employer site, then records the confirmation here. */
export async function confirmSubmitted(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const confirmation = str(fd, 'confirmation');
  if (!confirmation) go(`/applications/${id}`, { err: 'Enter the confirmation (reference number, confirmation email subject, or what the page said).' });
  const { data: app } = await supabase.from('applications').select('approval_status, submitted_at, job_id').eq('id', id).single();
  if (app?.submitted_at) go(`/applications/${id}`, { err: 'Already recorded as submitted.' });
  if (app?.approval_status !== 'approved') go(`/applications/${id}`, { err: 'Only applications in an approved batch can be marked submitted.' });
  await supabase.from('applications').update({ approval_status: 'submitted', submitted_at: new Date().toISOString(), confirmation, status: 'Applied', result_message: 'Submitted by you on the employer site; confirmation recorded.' }).eq('id', id);
  await supabase.from('jobs').update({ pipeline_status: 'Applied' }).eq('id', app!.job_id);
  await logActivity(supabase, 'application_submitted', 'application', id, { confirmation });
  go(backTo(fd, `/applications/${id}`), { msg: 'Submission recorded.' });
}

export async function grantExtraApproval(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { data: app } = await supabase.from('applications').select('approval_status, extra_approval_reason').eq('id', id).single();
  if (app?.approval_status !== 'needs_extra_approval') go(`/applications/${id}`, { err: 'No extra approval is pending.' });
  await supabase.from('applications').update({ approval_status: 'approved', result_message: `Extra approval granted for: ${app!.extra_approval_reason}. Complete the remaining steps on the employer site, then mark it submitted.` }).eq('id', id);
  await logActivity(supabase, 'extra_approval_granted', 'application', id, { reason: app!.extra_approval_reason });
  go(`/applications/${id}`, { msg: 'Extra approval recorded.' });
}
