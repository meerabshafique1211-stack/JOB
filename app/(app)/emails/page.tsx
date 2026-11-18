import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, Table, Textarea } from '@/components/ui';
import { SubmitButton, CheckAll } from '@/components/client';
import { generateEmail } from '../_actions/emails';
import { createBatch } from '../_actions/batches';
import { fmtDateTime } from '@/lib/utils';

export const maxDuration = 60;

const tone = (s: string) => (s === 'sent' ? 'green' : s === 'failed' ? 'red' : s === 'in_batch' || s === 'approved' ? 'blue' : s === 'rejected' || s === 'skipped' || s === 'duplicate' ? 'gray' : 'amber') as any;

export default async function EmailStudio({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  let q = supabase.from('email_drafts').select('*, hiring_contacts(name, designation, email_status), jobs(title, company_name)').in('kind', ['cold', 'followup1', 'followup2']).order('updated_at', { ascending: false }).limit(200);
  if (sp.status) q = q.eq('status', sp.status);
  const { data: drafts } = await q;
  const { data: contacts } = await supabase.from('hiring_contacts').select('id, name, designation, companies(name)').order('created_at', { ascending: false }).limit(300);
  const { data: jobs } = await supabase.from('jobs').select('id, title, company_name').neq('vacancy_status', 'expired').order('created_at', { ascending: false }).limit(300);
  const formId = 'drafts';
  return (
    <div>
      <PageHeader title="Cold Email Studio" description="Generate personalized emails per recipient type, edit and preview them, then group them into a batch for one-click approval." />
      <Flash msg={sp.msg} err={sp.err} />
      <Card className="mb-4">
        <CardHeader title="Generate a new email" />
        <CardBody>
          <form action={generateEmail} className="grid gap-3 md:grid-cols-3">
            <Field label="Recipient">
              <Select name="contact_id" required>
                <option value="">Choose a contact…</option>
                {(contacts ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.designation ?? ''} @ {c.companies?.name ?? ''}</option>)}
              </Select>
            </Field>
            <Field label="Vacancy (optional; defaults to the contact’s vacancy)">
              <Select name="job_id"><option value="">—</option>{(jobs ?? []).map((j: any) => <option key={j.id} value={j.id}>{j.title} @ {j.company_name}</option>)}</Select>
            </Field>
            <Field label="Extra instructions (optional)"><Input name="instructions" placeholder="e.g. mention the Voice Chatbot project" /></Field>
            <div className="md:col-span-3"><SubmitButton pendingText="Writing with Claude…">Generate email</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <form className="mb-3 flex items-center gap-2 text-sm" action="/emails">
        <Select name="status" defaultValue={sp.status ?? ''} className="max-w-[200px]"><option value="">All statuses</option>{['draft', 'in_batch', 'approved', 'sent', 'failed', 'skipped', 'duplicate', 'rejected'].map((s) => <option key={s}>{s}</option>)}</Select>
        <button className="rounded-md border border-border bg-white px-3 py-1.5">Filter</button>
      </form>

      {(drafts ?? []).length === 0 ? <Empty title="No email drafts yet">Generate one above, or from a company or vacancy page.</Empty> : (
        <form id={formId} action={createBatch}>
          <input type="hidden" name="return_to" value="/emails" />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input name="title" placeholder="Batch name (optional)" className="max-w-xs" />
            <SubmitButton size="sm">Add selected drafts to a new batch</SubmitButton>
            <span className="text-xs text-muted-foreground">Only drafts (or failed/skipped items being retried) can be batched.</span>
          </div>
          <Table>
            <thead><tr><th><CheckAll formId={formId} name="draft_ids" /></th><th>Recipient</th><th>Subject</th><th>Vacancy</th><th>Status</th><th>Warnings</th><th>Updated</th></tr></thead>
            <tbody>
              {(drafts ?? []).map((d: any) => (
                <tr key={d.id}>
                  <td>{['draft', 'failed', 'skipped'].includes(d.status) && <input type="checkbox" name="draft_ids" value={d.id} aria-label="select" />}</td>
                  <td><p className="font-medium">{d.hiring_contacts?.name ?? d.to_email}</p><p className="text-xs text-muted-foreground">{d.to_email ?? 'no email'} · {d.hiring_contacts?.designation ?? ''}</p></td>
                  <td><Link className="text-primary hover:underline" href={`/emails/${d.id}`}>{d.subject ?? '(no subject)'}</Link> {d.kind !== 'cold' && <Badge tone="violet">{d.kind}</Badge>}</td>
                  <td className="text-xs">{d.jobs ? `${d.jobs.title} @ ${d.jobs.company_name}` : '—'}</td>
                  <td><Badge tone={tone(d.status)}>{d.status}</Badge>{d.result_message && <p className="max-w-[220px] text-xs text-muted-foreground">{d.result_message}</p>}</td>
                  <td className="max-w-[240px] text-xs text-amber-800">{(d.warnings ?? []).join(' ')}</td>
                  <td className="text-xs text-muted-foreground">{fmtDateTime(d.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </form>
      )}
    </div>
  );
}
