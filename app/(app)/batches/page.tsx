import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Flash, Input, PageHeader, Table } from '@/components/ui';
import { SubmitButton, CheckAll } from '@/components/client';
import { createBatch } from '../_actions/batches';
import { fmtDateTime } from '@/lib/utils';

export default async function Batches({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: batches }, { data: drafts }, { data: apps }] = await Promise.all([
    supabase.from('email_batches').select('*, email_drafts(id, status), applications(id, approval_status)').order('created_at', { ascending: false }).limit(50),
    supabase.from('email_drafts').select('id, subject, to_email, status, warnings, kind, hiring_contacts(name, email_status), jobs(title, company_name)').in('status', ['draft', 'failed', 'skipped']).in('kind', ['cold', 'followup1', 'followup2']).order('updated_at', { ascending: false }),
    supabase.from('applications').select('id, channel, apply_email, approval_status, jobs(title, company_name)').in('approval_status', ['none', 'rejected', 'failed']).is('submitted_at', null).order('updated_at', { ascending: false }),
  ]);
  const formId = 'newbatch';
  return (
    <div>
      <PageHeader title="Batch Approval Center" description="Prepare → Review → Approve once → Execute. Only the exact items listed at approval time are sent or submitted; anything prepared later goes into a new batch." />
      <Flash msg={sp.msg} err={sp.err} />
      <Card className="mb-6">
        <CardHeader title="Create a new batch" description={`${drafts?.length ?? 0} email drafts and ${apps?.length ?? 0} applications are ready to be batched.`} />
        <CardBody>
          {(drafts?.length ?? 0) + (apps?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Nothing ready. Generate emails in the Cold Email Studio or prepare applications from vacancies.</p> : (
            <form id={formId} action={createBatch} className="space-y-3">
              <div className="flex gap-2"><Input name="title" placeholder="Batch name (optional)" className="max-w-xs" /><SubmitButton>Create batch from selected</SubmitButton></div>
              <Table>
                <thead><tr><th><CheckAll formId={formId} name="draft_ids" /></th><th>Email</th><th>Recipient</th><th>Vacancy</th><th>Warnings</th></tr></thead>
                <tbody>
                  {(drafts ?? []).map((d: any) => (
                    <tr key={d.id}>
                      <td><input type="checkbox" name="draft_ids" value={d.id} defaultChecked={!(d.warnings ?? []).length} aria-label="select" /></td>
                      <td><Link className="text-primary hover:underline" href={`/emails/${d.id}`}>{d.subject}</Link> {d.kind !== 'cold' && <Badge tone="violet">{d.kind}</Badge>} {d.status !== 'draft' && <Badge tone="red">retry: {d.status}</Badge>}</td>
                      <td className="text-xs">{d.hiring_contacts?.name} · {d.to_email ?? 'no email'} <Badge tone={['verified', 'public_source'].includes(d.hiring_contacts?.email_status) ? 'green' : 'amber'}>{d.hiring_contacts?.email_status ?? '—'}</Badge></td>
                      <td className="text-xs">{d.jobs ? `${d.jobs.title} @ ${d.jobs.company_name}` : '—'}</td>
                      <td className="max-w-[260px] text-xs text-amber-800">{(d.warnings ?? []).join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {(apps ?? []).length > 0 && (
                <Table>
                  <thead><tr><th><CheckAll formId={formId} name="application_ids" /></th><th>Application</th><th>Channel</th><th>Status</th></tr></thead>
                  <tbody>
                    {(apps ?? []).map((a: any) => (
                      <tr key={a.id}>
                        <td><input type="checkbox" name="application_ids" value={a.id} defaultChecked aria-label="select" /></td>
                        <td><Link className="text-primary hover:underline" href={`/applications/${a.id}`}>{a.jobs?.title} @ {a.jobs?.company_name}</Link></td>
                        <td className="text-xs">{a.channel === 'email' ? `Email → ${a.apply_email}` : 'Employer website (you submit after approval)'}</td>
                        <td><Badge>{a.approval_status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </form>
          )}
        </CardBody>
      </Card>
      <h2 className="mb-2 font-semibold">Batches</h2>
      {(batches ?? []).length === 0 ? <Empty title="No batches yet" /> : (
        <Table>
          <thead><tr><th>Batch</th><th>Status</th><th>Emails</th><th>Applications</th><th>Created</th><th>Approved</th></tr></thead>
          <tbody>
            {(batches ?? []).map((b: any) => (
              <tr key={b.id}>
                <td><Link className="font-medium text-primary hover:underline" href={`/batches/${b.id}`}>{b.title}</Link></td>
                <td><Badge tone={b.status === 'completed' ? 'green' : b.status === 'approved' ? 'blue' : b.status === 'cancelled' ? 'gray' : 'amber'}>{b.status === 'open' ? 'awaiting your review' : b.status}</Badge></td>
                <td className="text-xs">{b.email_drafts?.length ?? 0} ({(b.email_drafts ?? []).filter((d: any) => d.status === 'sent').length} sent)</td>
                <td className="text-xs">{b.applications?.length ?? 0} ({(b.applications ?? []).filter((a: any) => a.approval_status === 'submitted').length} submitted)</td>
                <td className="text-xs">{fmtDateTime(b.created_at)}</td>
                <td className="text-xs">{b.approved_at ? fmtDateTime(b.approved_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
