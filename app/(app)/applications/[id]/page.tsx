import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Field, Flash, Input, PageHeader, Select, Textarea, buttonClass } from '@/components/ui';
import { SubmitButton, CopyButton } from '@/components/client';
import { updateApplication, setApplicationStatus, confirmSubmitted, grantExtraApproval } from '../../_actions/applications';
import { createBatch } from '../../_actions/batches';
import { PIPELINE_STATUSES, fmtDateTime } from '@/lib/utils';

export default async function AppPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: a } = await supabase.from('applications').select('*, jobs(*)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const { data: docs } = await supabase.from('cv_documents').select('id, title, kind').or(`job_id.eq.${a.job_id},kind.eq.master`).order('created_at', { ascending: false });
  const locked = ['approved', 'submitted', 'in_batch'].includes(a.approval_status);
  const answers: any[] = a.form_answers ?? [];
  const allAnswers = answers.map((x) => `${x.question}\n${x.answer}`).join('\n\n');
  return (
    <div>
      <PageHeader title={`${a.jobs?.title}`} description={<span>{a.jobs?.company_name} · <a className="text-primary hover:underline" href={a.apply_url ?? a.jobs?.url} target="_blank" rel="noopener noreferrer">Open application page ↗</a></span>} actions={<Link href="/applications" className={buttonClass('outline')}>← Applications</Link>} />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge>{a.status}</Badge>
        <Badge tone={a.approval_status === 'submitted' ? 'green' : a.approval_status === 'needs_extra_approval' ? 'amber' : 'blue'}>approval: {a.approval_status}</Badge>
        <Badge>{a.channel === 'email' ? `email application → ${a.apply_email}` : 'employer website form'}</Badge>
        {a.submitted_at && <span className="text-emerald-700">Submitted {fmtDateTime(a.submitted_at)} · {a.confirmation}</span>}
      </div>
      {a.result_message && <div className="mb-4 rounded-md border border-border bg-white p-3 text-sm">{a.result_message}</div>}
      {a.extra_approval_reason && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠ Needs your explicit approval even after batch approval: {a.extra_approval_reason}
        {a.approval_status === 'needs_extra_approval' && <form action={grantExtraApproval} className="mt-2"><input type="hidden" name="id" value={id} /><SubmitButton size="sm" confirm="Confirm you have reviewed the assessment/declaration/sensitive-data request and approve continuing?">I approve this specific step</SubmitButton></form>}
      </div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Form responses" description="Answers use only your verified profile. Anything unknown says NEEDS YOUR INPUT." action={<CopyButton text={allAnswers} label="Copy all" />} />
            <CardBody>
              <form action={updateApplication} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                {answers.map((x, i) => (
                  <div key={i} className={x.needs_input ? 'rounded-md border border-amber-300 p-2' : ''}>
                    <Input name="q" defaultValue={x.question} className="mb-1 font-medium" disabled={locked} />
                    <Textarea name="a" defaultValue={x.answer} rows={2} disabled={locked} />
                  </div>
                ))}
                {!locked && <div><Input name="q" placeholder="Add a question" className="mb-1" /><Textarea name="a" rows={2} placeholder="Answer" /></div>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Apply by email to (leave empty for website form)"><Input name="apply_email" type="email" defaultValue={a.apply_email ?? ''} disabled={locked} /></Field>
                  <Field label="Application URL"><Input name="apply_url" defaultValue={a.apply_url ?? ''} disabled={locked} /></Field>
                  <Field label="CV to use"><Select name="cv_doc_id" defaultValue={a.cv_doc_id ?? ''} disabled={locked}><option value="">—</option>{(docs ?? []).filter((d: any) => d.kind !== 'cover_letter').map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></Field>
                  <Field label="Cover letter"><Select name="cover_doc_id" defaultValue={a.cover_doc_id ?? ''} disabled={locked}><option value="">—</option>{(docs ?? []).filter((d: any) => d.kind === 'cover_letter').map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></Field>
                </div>
                <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={a.notes ?? ''} disabled={locked} /></Field>
                {!locked && <SubmitButton>Save application</SubmitButton>}
              </form>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Documents" />
            <CardBody className="space-y-2 text-sm">
              {a.cv_doc_id ? <p>CV: <Link className="text-primary hover:underline" href={`/documents/${a.cv_doc_id}`}>review</Link> · <a className="underline" href={`/api/documents/${a.cv_doc_id}?format=docx`}>.docx</a></p> : <p className="text-muted-foreground">No CV linked.</p>}
              {a.cover_doc_id ? <p>Cover letter: <Link className="text-primary hover:underline" href={`/documents/${a.cover_doc_id}`}>review</Link> · <a className="underline" href={`/api/documents/${a.cover_doc_id}?format=docx`}>.docx</a></p> : <p className="text-muted-foreground">No cover letter linked.</p>}
              {(a.missing_info ?? []).length > 0 && <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900"><p className="font-medium">Missing information</p><ul className="list-disc pl-4">{a.missing_info.map((m: string) => <li key={m}>{m}</li>)}</ul></div>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Approval & submission" />
            <CardBody className="space-y-3">
              {['none', 'rejected', 'failed'].includes(a.approval_status) && !a.submitted_at && (
                <form action={createBatch}><input type="hidden" name="application_ids" value={id} /><SubmitButton className="w-full">Add to a new batch for approval</SubmitButton></form>
              )}
              {a.approval_status === 'in_batch' && <Link className={buttonClass('outline', 'md', 'w-full')} href={`/batches/${a.batch_id}`}>Open its batch</Link>}
              {a.approval_status === 'approved' && !a.submitted_at && (
                <form action={confirmSubmitted} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <p className="text-xs text-muted-foreground">After submitting on the employer’s site, record the confirmation shown (reference number, page message or confirmation email subject).</p>
                  <Input name="confirmation" placeholder="Confirmation / reference" required />
                  <SubmitButton className="w-full">Mark submitted</SubmitButton>
                </form>
              )}
              <form action={setApplicationStatus} className="flex gap-2 border-t border-border pt-3">
                <input type="hidden" name="id" value={id} />
                <Select name="status" defaultValue={a.status}>{PIPELINE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                <SubmitButton variant="outline" size="sm">Set</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
