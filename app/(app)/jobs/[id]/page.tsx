import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Flash, PageHeader, Select, Input, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { CategoryBadge, ScoreBadge, StatusBadge, triTone, salaryText } from '@/components/jobs';
import { verifyJob, scoreJobs, setJobFields, deleteJob } from '../../_actions/jobs';
import { prepareApplication } from '../../_actions/applications';
import { generateDocsAction } from '../../_actions/documents';
import { toggleShortlist } from '../../_actions/contacts';
import { generateEmail } from '../../_actions/emails';
import { fmtDate, fmtDateTime, PIPELINE_STATUSES } from '@/lib/utils';

export const maxDuration = 120;

export default async function JobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
  if (!job) notFound();
  const [{ data: match }, { data: company }, { data: contacts }, { data: app }, { data: docs }] = await Promise.all([
    supabase.from('job_matches').select('*').eq('job_id', id).maybeSingle(),
    job.company_id ? supabase.from('companies').select('*').eq('id', job.company_id).maybeSingle() : Promise.resolve({ data: null }),
    job.company_id ? supabase.from('hiring_contacts').select('*').eq('company_id', job.company_id) : Promise.resolve({ data: [] }),
    supabase.from('applications').select('id, approval_status, submitted_at').eq('job_id', id).maybeSingle(),
    supabase.from('cv_documents').select('id, title, kind, created_at').eq('job_id', id).order('created_at', { ascending: false }),
  ]);
  const { data: masters } = await supabase.from('cv_documents').select('id, title, is_primary').eq('kind', 'master').order('is_primary', { ascending: false });
  const ev = job.evidence ?? {};
  const ret = `/jobs/${id}`;

  return (
    <div>
      <PageHeader
        title={job.title}
        description={<span>{job.company_name} · {job.location ?? job.country ?? 'Location not stated'} · <a className="text-primary hover:underline" href={job.url} target="_blank" rel="noopener noreferrer">Open original vacancy ↗</a></span>}
        actions={<Link href="/jobs" className={buttonClass('outline')}>← All jobs</Link>}
      />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Eligibility" description="Labels come from the source’s location field and the job text. Only explicit evidence counts." action={<CategoryBadge c={job.category} />} />
            <CardBody className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge job={job} />
                <Badge tone={triTone(job.pakistan_eligible)}>Remote from Pakistan: {job.pakistan_eligible}</Badge>
                <Badge>Remote type: {job.remote_eligibility}</Badge>
                <Badge tone={triTone(job.visa_sponsorship)}>Visa sponsorship: {job.visa_sponsorship}</Badge>
                <Badge tone={triTone(job.relocation)}>Relocation assistance: {job.relocation}</Badge>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Location restriction (source)</dt><dd>{job.location_restriction ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Country</dt><dd>{job.country ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Salary</dt><dd>{salaryText(job)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Employment type</dt><dd>{job.job_type ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Posted</dt><dd>{fmtDate(job.posted_at)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Deadline</dt><dd>{fmtDate(job.deadline)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Required experience</dt><dd>{job.required_experience ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Source · last verified</dt><dd>{job.source_key} · {job.verified_at ? fmtDateTime(job.verified_at) : 'never'}</dd></div>
              </dl>
              {job.required_skills?.length > 0 && <p className="text-xs"><span className="text-muted-foreground">Required skills:</span> {job.required_skills.join(', ')}</p>}
              <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
                <p className="font-medium">Evidence</p>
                {Object.keys(ev).length === 0 && <p className="text-muted-foreground">No explicit eligibility or sponsorship statement was found. Treat as unverified.</p>}
                {Object.entries(ev).map(([k, v]) => <p key={k}><span className="font-medium capitalize">{k}:</span> {String(v)}</p>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={verifyJob}><input type="hidden" name="id" value={id} /><SubmitButton size="sm" variant="outline" pendingText="Checking…">Verify link</SubmitButton></form>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="AI match" description={match ? `Scored ${fmtDateTime(match.created_at)} with ${match.model}` : 'Compare this vacancy against your master CV'} action={
              <form action={scoreJobs}><input type="hidden" name="id" value={id} /><input type="hidden" name="return_to" value={ret} /><SubmitButton size="sm" pendingText="Scoring…">{match ? 'Re-score' : 'Score with Claude'}</SubmitButton></form>
            } />
            {match && (
              <CardBody className="grid gap-3 text-sm md:grid-cols-2">
                <div className="md:col-span-2 flex items-center gap-2"><ScoreBadge score={match.score} /><span className="text-muted-foreground">match score</span></div>
                <div><p className="text-xs font-medium text-muted-foreground">Relevant skills</p><p>{match.relevant_skills?.join(', ') || '—'}</p></div>
                <div><p className="text-xs font-medium text-muted-foreground">Missing requirements</p><p>{match.missing_requirements?.join(', ') || '—'}</p></div>
                {[['Experience', match.experience_fit], ['Education', match.education_fit], ['Remote eligibility', match.remote_fit], ['Sponsorship', match.sponsorship_fit], ['Salary', match.salary_fit]].map(([k, v]) => (
                  <div key={k}><p className="text-xs font-medium text-muted-foreground">{k}</p><p>{v ?? '—'}</p></div>
                ))}
                <div><p className="text-xs font-medium text-muted-foreground">Reasons to apply</p><ul className="list-disc pl-4">{(match.reasons ?? []).map((r: string) => <li key={r}>{r}</li>)}</ul></div>
                <div><p className="text-xs font-medium text-muted-foreground">Concerns</p><ul className="list-disc pl-4">{(match.concerns ?? []).map((r: string) => <li key={r}>{r}</li>)}</ul></div>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Full job description" />
            <CardBody><div className="prose-pre max-h-[600px] overflow-y-auto text-sm leading-relaxed">{job.description || 'No description stored.'}</div></CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="space-y-3">
              {app ? (
                <Link className={buttonClass('default', 'md', 'w-full')} href={`/applications/${app.id}`}>Open application ({app.submitted_at ? 'submitted' : app.approval_status})</Link>
              ) : (
                <form action={prepareApplication} className="space-y-2">
                  <input type="hidden" name="job_id" value={id} />
                  <Select name="base_cv_id">{(masters ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.is_primary ? '★ ' : ''}{m.title}</option>)}</Select>
                  <SubmitButton className="w-full" pendingText="Preparing CV, cover letter and answers… (~40s)">Prepare application</SubmitButton>
                </form>
              )}
              <form action={generateDocsAction} className="flex gap-2">
                <input type="hidden" name="job_id" value={id} />
                <Select name="which" defaultValue="cv"><option value="cv">Tailored CV</option><option value="cover">Cover letter</option><option value="both">Both</option></Select>
                <SubmitButton variant="outline" pendingText="Generating…">Generate</SubmitButton>
              </form>
              {company && (
                <form action={toggleShortlist}>
                  <input type="hidden" name="id" value={company.id} /><input type="hidden" name="job_id" value={id} /><input type="hidden" name="return_to" value={ret} />
                  <input type="hidden" name="shortlisted" value={company.shortlisted ? 'false' : 'true'} />
                  <SubmitButton variant="outline" className="w-full">{company.shortlisted ? '★ Company shortlisted (undo)' : 'Shortlist company'}</SubmitButton>
                </form>
              )}
              <form action={setJobFields} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="id" value={id} />
                <Select name="pipeline_status" defaultValue={job.pipeline_status}>{PIPELINE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                <div className="grid grid-cols-2 gap-2">
                  <Select name="vacancy_status" defaultValue={job.vacancy_status}><option value="active">active</option><option value="unverified">unverified</option><option value="expired">expired</option></Select>
                  <Select name="category" defaultValue={job.category}><option value="remote">remote</option><option value="visa">visa</option><option value="both">both</option><option value="other">other</option></Select>
                  <Select name="pakistan_eligible" defaultValue={job.pakistan_eligible}><option value="yes">PK eligible: yes</option><option value="unclear">PK: unclear</option><option value="no">PK: no</option></Select>
                  <Select name="visa_sponsorship" defaultValue={job.visa_sponsorship}><option value="yes">Visa: yes</option><option value="unclear">Visa: unclear</option><option value="no">Visa: no</option></Select>
                  <Select name="relocation" defaultValue={job.relocation}><option value="yes">Relocation: yes</option><option value="unclear">Relocation: unclear</option><option value="no">Relocation: no</option></Select>
                  <Input name="country" defaultValue={job.country ?? ''} placeholder="Country" />
                </div>
                <Input name="evidence_note" placeholder="Evidence for manual change (quote or URL)" />
                <SubmitButton size="sm" variant="outline">Save changes</SubmitButton>
              </form>
              <form action={deleteJob}><input type="hidden" name="id" value={id} /><SubmitButton size="sm" variant="ghost" confirm="Delete this vacancy?">Delete vacancy</SubmitButton></form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Hiring contacts" description={company ? <Link className="text-primary hover:underline" href={`/companies/${company.id}`}>Manage at {company.name} →</Link> : 'No company record'} />
            <CardBody className="space-y-3 text-sm">
              {(contacts ?? []).length === 0 && <p className="text-muted-foreground">No contacts yet. Open the company page to find recruiters and hiring managers.</p>}
              {(contacts ?? []).map((c: any) => (
                <div key={c.id} className="rounded-md border border-border p-2">
                  <p className="font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.designation}</span></p>
                  <p className="text-xs">{c.email ?? 'no email'} · <Badge tone={c.email_status === 'verified' || c.email_status === 'public_source' ? 'green' : 'amber'}>{c.email_status}</Badge></p>
                  <form action={generateEmail} className="mt-2">
                    <input type="hidden" name="contact_id" value={c.id} /><input type="hidden" name="job_id" value={id} /><input type="hidden" name="return_to" value={ret} />
                    <SubmitButton size="sm" variant="outline" pendingText="Writing…">Generate cold email</SubmitButton>
                  </form>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents for this job" />
            <CardBody className="space-y-1 text-sm">
              {(docs ?? []).length === 0 && <p className="text-muted-foreground">None yet.</p>}
              {(docs ?? []).map((d: any) => <p key={d.id}><Link className="text-primary hover:underline" href={`/documents/${d.id}`}>{d.title}</Link> <span className="text-xs text-muted-foreground">{fmtDate(d.created_at)}</span></p>)}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
