'use server';
import { requireOwner } from '@/lib/supabase/server';
import { callClaudeJSON, profileContext, TRUTH_RULES } from '@/lib/claude';
import { logActivity } from '@/lib/activity';
import { str, strOrNull } from '@/lib/utils';
import { getProfile, getMasterCV, isDoNotContact, previouslyContacted } from './data';
import { go, errMsg, backTo } from './util';

const GUIDANCE: Record<string, string> = {
  'Recruiter': 'A recruiter screens many candidates. Lead with the exact role, years of experience and 2 matching skills. Make it easy to forward. Ask whether remote-from-Pakistan or sponsorship is possible for this role.',
  'Technical Recruiter': 'A technical recruiter wants quick evidence of tool and testing-type match (e.g. Postman, regression, mobile). Keep it scannable; ask about eligibility and next steps.',
  'Talent Acquisition Manager': 'Focus on fit for the vacancy and hiring-process logistics. Be brief; ask about international eligibility and the best way to be considered.',
  'Head of Talent Acquisition': 'Senior TA leader: very short, respectful of time, ask to be pointed to the right recruiter.',
  'HR Manager': 'HR cares about process, eligibility and professionalism. Be clear about location, availability and notice period. Ask about remote/sponsorship policy.',
  'QA Manager': 'A QA manager cares about testing depth: functional/regression/E2E, API testing, AI/chatbot testing, defect quality, release validation. Speak peer-to-peer, mention one concrete testing experience.',
  'Engineering Manager': 'An engineering manager values reliability, collaboration with developers, catching defects before release, clear bug reports. Keep it practical.',
  'Project Manager': 'A project manager values coordination, sprint ceremonies, requirements to user stories, stakeholder updates and release coordination.',
  'CTO': 'A CTO is busy: 4–6 sentences max. Connect her QA/AI testing experience to product quality and delivery speed. No fluff.',
  'Founder': 'A founder values ownership and impact. Very concise; show she can own QA and coordination end-to-end in a small team.',
  'CEO': 'A CEO: extremely short (≤ 90 words), one line on value, polite request to be routed to the hiring owner.',
};

async function buildContext(supabase: any, contactId: string, jobId: string | null) {
  const { data: contact } = await supabase.from('hiring_contacts').select('*, companies(name, country)').eq('id', contactId).single();
  if (!contact) throw new Error('Contact not found');
  const jid = jobId || contact.job_id;
  const { data: job } = jid ? await supabase.from('jobs').select('*').eq('id', jid).single() : { data: null };
  const profile = await getProfile(supabase);
  const cv = await getMasterCV(supabase);
  return { contact, job, profile, cvText: cv?.content ?? '' };
}

function computeWarnings(contact: any, job: any, dnc: boolean, prior: any[]) {
  const w: string[] = [];
  if (!contact.email) w.push('No email address — use LinkedIn outreach instead.');
  else if (!['verified', 'public_source'].includes(contact.email_status)) w.push(`Email status is “${contact.email_status}”. It will be skipped at send time until verified.`);
  if (dnc) w.push('Recipient is on your Do-Not-Contact list — it will be skipped.');
  if (prior.length) w.push(`You already emailed this address ${prior.length} time(s).`);
  if (!job) w.push('Not linked to a specific vacancy.');
  else if (job.vacancy_status === 'expired') w.push('The linked vacancy is marked expired.');
  if (!contact.source_url && !contact.linkedin_url) w.push('No public source recorded for this contact.');
  return w;
}

export async function generateEmail(fd: FormData) {
  const { supabase } = await requireOwner();
  const contactId = str(fd, 'contact_id');
  const jobId = strOrNull(fd, 'job_id');
  const back = backTo(fd, '/emails');
  const instructions = str(fd, 'instructions');
  const regenerateId = strOrNull(fd, 'draft_id');
  const r = await (async () => {
    const { contact, job, profile, cvText } = await buildContext(supabase, contactId, jobId);
    const rtype = contact.role_type || 'Recruiter';
    const category = job ? (job.category === 'visa' ? 'visa sponsorship / relocation' : job.category === 'remote' ? 'remote from Pakistan' : job.category === 'both' ? 'remote from Pakistan, or relocation with sponsorship' : 'unclear') : 'general interest';
    const { data, model } = await callClaudeJSON<{ subject: string; body: string }>({
      model: profile.ai_model,
      system: `You write short, human, genuinely personalized cold emails for a job seeker. ${TRUTH_RULES}
STYLE: 110–170 words (CEO/CTO/Founder: under 100). Plain text. No buzzwords, no "I hope this email finds you well", no "I am excited/thrilled", no em-dash chains, no bullet lists unless very short. Sound like a thoughtful professional writing one email, not a template.
MUST: professional specific subject line; natural self-introduction; name the vacancy (or hiring need); 1–2 concrete relevant experiences from the CV; why she may fit; say she is based in Lahore, Pakistan; ask about ${category === 'visa sponsorship / relocation' ? 'visa sponsorship and relocation for this role' : 'whether the role can be done remotely from Pakistan'} where appropriate; polite low-pressure call to action; end with the signature block exactly.
RECIPIENT GUIDANCE (${rtype}): ${GUIDANCE[rtype] ?? GUIDANCE['Recruiter']}`,
      prompt: `${profileContext(profile, cvText)}

SIGNATURE BLOCK:
${profile.email_signature ?? profile.full_name}

RECIPIENT: ${contact.name}, ${contact.designation ?? rtype} at ${contact.companies?.name ?? job?.company_name ?? ''}
${job ? `VACANCY: ${job.title} — ${job.location ?? ''}\nURL: ${job.url}\nEligibility evidence: ${JSON.stringify(job.evidence ?? {})}\nDescription:\n${(job.description ?? '').slice(0, 6000)}` : 'No specific vacancy: express interest in QA / project coordination opportunities.'}
${instructions ? `\nEXTRA INSTRUCTIONS FROM CANDIDATE: ${instructions}` : ''}

Return JSON {"subject": "...", "body": "..."}. Address the recipient by first name.`,
      maxTokens: 900,
    });
    const dnc = await isDoNotContact(supabase, contact.email);
    const prior = await previouslyContacted(supabase, contact.email);
    const warnings = computeWarnings(contact, job, dnc, prior);
    const row = {
      contact_id: contact.id, job_id: job?.id ?? null, kind: 'cold', to_email: contact.email, subject: data.subject?.trim(),
      body: data.body?.trim(), status: 'draft', warnings, updated_at: new Date().toISOString(),
    };
    let id = regenerateId;
    if (regenerateId) {
      const { error } = await supabase.from('email_drafts').update(row).eq('id', regenerateId).in('status', ['draft', 'rejected']);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from('email_drafts').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    if (job && ['New', 'Under Review', 'Shortlisted', 'CV Prepared'].includes(job.pipeline_status)) await supabase.from('jobs').update({ pipeline_status: 'Draft Ready' }).eq('id', job.id);
    await logActivity(supabase, regenerateId ? 'email_regenerated' : 'email_generated', 'email_draft', id, { model, recipient_type: rtype });
    return id!;
  })().then((id) => ({ id, e: null as string | null }), (e) => ({ id: null, e: errMsg(e) }));
  if (!r.id) go(back, { err: `Email generation failed: ${r.e}` });
  go(`/emails/${r.id}`, { msg: 'Draft generated. Review, edit, then add it to a batch.' });
}

export async function generateLinkedIn(fd: FormData) {
  const { supabase } = await requireOwner();
  const contactId = str(fd, 'contact_id');
  const kind = str(fd, 'kind') === 'linkedin_message' ? 'linkedin_message' : 'linkedin_connect';
  const back = backTo(fd, '/linkedin');
  const r = await (async () => {
    const { contact, job, profile, cvText } = await buildContext(supabase, contactId, strOrNull(fd, 'job_id'));
    const { data } = await callClaudeJSON<{ body: string }>({
      model: profile.ai_model,
      system: `You write LinkedIn outreach for a job seeker. ${TRUTH_RULES}
${kind === 'linkedin_connect' ? 'This is a CONNECTION REQUEST NOTE: hard limit 280 characters including spaces. One or two sentences. No links.' : 'This is a LinkedIn MESSAGE: 60–110 words, friendly and specific, mention the vacancy, that she is based in Pakistan, and ask about remote eligibility or sponsorship as appropriate.'}
No clichés, no emojis.`,
      prompt: `${profileContext(profile, cvText)}\n\nRECIPIENT: ${contact.name}, ${contact.designation ?? ''} at ${contact.companies?.name ?? ''}\n${job ? `VACANCY: ${job.title} (${job.location ?? ''}) ${job.url}` : ''}\n\nReturn JSON {"body":"..."}`,
      maxTokens: 400,
    });
    let body = (data.body ?? '').trim();
    if (kind === 'linkedin_connect' && body.length > 300) body = body.slice(0, 297).replace(/\s+\S*$/, '') + '…';
    const { data: ins, error } = await supabase.from('email_drafts').insert({ contact_id: contact.id, job_id: job?.id ?? null, kind, body, status: 'draft' }).select('id').single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, 'linkedin_generated', 'email_draft', ins.id, { kind });
    return ins.id as string;
  })().then((id) => ({ id, e: null as string | null }), (e) => ({ id: null, e: errMsg(e) }));
  if (!r.id) go(back, { err: `Generation failed: ${r.e}` });
  go(back, { msg: 'LinkedIn message ready below. Copy it, open the profile and send it yourself.' });
}

export async function saveDraft(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { data: d } = await supabase.from('email_drafts').select('status, contact_id, job_id').eq('id', id).single();
  if (!d || !['draft', 'rejected', 'in_batch', 'failed', 'skipped'].includes(d.status)) go(`/emails/${id}`, { err: 'This draft can no longer be edited (already approved or sent).' });
  if (d!.status === 'in_batch') {
    const { data: b } = await supabase.from('email_drafts').select('email_batches(status)').eq('id', id).single();
    if ((b as any)?.email_batches?.status !== 'open') go(`/emails/${id}`, { err: 'The batch containing this draft is already approved; edits are locked.' });
  }
  const to = strOrNull(fd, 'to_email')?.toLowerCase() ?? null;
  const patch: any = { subject: strOrNull(fd, 'subject'), body: str(fd, 'body'), to_email: to, attachment_doc_id: strOrNull(fd, 'attachment_doc_id'), updated_at: new Date().toISOString() };
  if (['rejected', 'failed', 'skipped'].includes(d!.status)) { patch.status = 'draft'; patch.batch_id = null; }
  const { error } = await supabase.from('email_drafts').update(patch).eq('id', id);
  if (error) go(`/emails/${id}`, { err: error.message });
  go(backTo(fd, `/emails/${id}`), { msg: 'Draft saved.' });
}

export async function rejectDraft(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  await supabase.from('email_drafts').update({ status: 'rejected', batch_id: null }).eq('id', id).in('status', ['draft', 'in_batch']);
  go(backTo(fd, '/emails'), { msg: 'Draft rejected.' });
}

export async function deleteDraft(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = str(fd, 'id');
  const { error } = await supabase.from('email_drafts').delete().eq('id', id).in('status', ['draft', 'rejected']);
  if (error) go(`/emails/${id}`, { err: error.message });
  go(backTo(fd, '/emails'), { msg: 'Draft deleted.' });
}
