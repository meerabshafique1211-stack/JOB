import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Field, Flash, Input, PageHeader, Select, Textarea, buttonClass } from '@/components/ui';
import { SubmitButton, CopyButton } from '@/components/client';
import { saveDraft, rejectDraft, deleteDraft, generateEmail } from '../../_actions/emails';
import { createBatch } from '../../_actions/batches';

export const maxDuration = 60;

export default async function DraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: d } = await supabase.from('email_drafts').select('*, hiring_contacts(*), jobs(id, title, company_name, url), email_batches(id, status, title)').eq('id', id).maybeSingle();
  if (!d) notFound();
  const { data: docs } = await supabase.from('cv_documents').select('id, title, kind').in('kind', ['master', 'tailored_cv']).order('created_at', { ascending: false });
  const { data: profile } = await supabase.from('user_profile').select('full_name').eq('id', 1).maybeSingle();
  const { data: tok } = await supabase.from('oauth_tokens').select('account_email').eq('provider', 'google').maybeSingle();
  const locked = !['draft', 'rejected', 'failed', 'skipped'].includes(d.status) && !(d.status === 'in_batch' && d.email_batches?.status === 'open');
  const c = d.hiring_contacts;
  return (
    <div>
      <PageHeader title={d.subject ?? 'Email draft'} description={<span>{d.kind} · <Badge>{d.status}</Badge> {d.email_batches && <Link className="text-primary hover:underline" href={`/batches/${d.email_batches.id}`}>in batch “{d.email_batches.title}” ({d.email_batches.status})</Link>}</span>} actions={<Link href="/emails" className={buttonClass('outline')}>← Studio</Link>} />
      <Flash msg={sp.msg} err={sp.err} />
      {d.result_message && <div className="mb-4 rounded-md border border-border bg-white p-3 text-sm"><span className="font-medium">Result:</span> {d.result_message}</div>}
      {(d.warnings ?? []).length > 0 && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{d.warnings.map((w: string) => <p key={w}>⚠ {w}</p>)}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Edit" description={locked ? 'Locked — this email is approved, sent or in an approved batch.' : undefined} />
          <CardBody>
            <form action={saveDraft} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <Field label="To"><Input name="to_email" type="email" defaultValue={d.to_email ?? ''} disabled={locked} /></Field>
              <Field label="Subject"><Input name="subject" defaultValue={d.subject ?? ''} disabled={locked} /></Field>
              <Field label="Body"><Textarea name="body" rows={16} defaultValue={d.body} disabled={locked} /></Field>
              <Field label="Attach CV (optional)">
                <Select name="attachment_doc_id" defaultValue={d.attachment_doc_id ?? ''} disabled={locked}>
                  <option value="">No attachment</option>
                  {(docs ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.kind === 'master' ? 'Master: ' : 'Tailored: '}{x.title}</option>)}
                </Select>
              </Field>
              {!locked && <SubmitButton>Save</SubmitButton>}
            </form>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Preview" action={<CopyButton text={`Subject: ${d.subject ?? ''}\n\n${d.body}`} />} />
            <CardBody className="text-sm">
              <p className="text-xs text-muted-foreground">From: {profile?.full_name} &lt;{tok?.account_email ?? 'Gmail not connected'}&gt;</p>
              <p className="text-xs text-muted-foreground">To: {c?.name} &lt;{d.to_email ?? '—'}&gt; · {c?.designation} · email status <Badge tone={['verified', 'public_source'].includes(c?.email_status) ? 'green' : 'amber'}>{c?.email_status ?? 'n/a'}</Badge></p>
              {c?.source_url && <p className="text-xs text-muted-foreground">Contact source: <a className="underline" href={c.source_url} target="_blank" rel="noopener noreferrer">{c.source_url}</a></p>}
              {d.jobs && <p className="text-xs text-muted-foreground">Vacancy: <Link className="underline" href={`/jobs/${d.jobs.id}`}>{d.jobs.title} @ {d.jobs.company_name}</Link></p>}
              <p className="mt-3 font-medium">{d.subject}</p>
              <div className="prose-pre mt-2 leading-relaxed">{d.body}</div>
            </CardBody>
          </Card>
          {!locked && (
            <Card>
              <CardHeader title="Next steps" />
              <CardBody className="space-y-3">
                <form action={createBatch} className="flex gap-2"><input type="hidden" name="draft_ids" value={id} /><SubmitButton>Add to a new batch</SubmitButton></form>
                {d.kind === 'cold' && d.contact_id && (
                  <form action={generateEmail} className="flex gap-2">
                    <input type="hidden" name="contact_id" value={d.contact_id} /><input type="hidden" name="job_id" value={d.job_id ?? ''} /><input type="hidden" name="draft_id" value={id} /><input type="hidden" name="return_to" value={`/emails/${id}`} />
                    <Input name="instructions" placeholder="How should it change? (optional)" />
                    <SubmitButton variant="outline" pendingText="Rewriting…">Regenerate</SubmitButton>
                  </form>
                )}
                <div className="flex gap-2">
                  <form action={rejectDraft}><input type="hidden" name="id" value={id} /><input type="hidden" name="return_to" value="/emails" /><SubmitButton variant="outline">Reject</SubmitButton></form>
                  <form action={deleteDraft}><input type="hidden" name="id" value={id} /><SubmitButton variant="ghost" confirm="Delete this draft?">Delete</SubmitButton></form>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
