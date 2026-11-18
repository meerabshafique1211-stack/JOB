import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Empty, Flash, Input, PageHeader, Select, Table, buttonClass } from '@/components/ui';
import { SubmitButton, CheckAll } from '@/components/client';
import { createBatch } from '../_actions/batches';
import { PIPELINE_STATUSES, fmtDate } from '@/lib/utils';

export default async function Applications({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  let q = supabase.from('applications').select('*, jobs(id, title, company_name, country, category, url)').order('updated_at', { ascending: false });
  if (sp.status) q = q.eq('status', sp.status);
  const { data: apps } = await q;
  const formId = 'apps';
  const counts = PIPELINE_STATUSES.map((s) => [s, (apps ?? []).filter((a: any) => a.status === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div>
      <PageHeader title="Applications" description="Prepared and submitted applications. Each vacancy can have only one application (duplicates are blocked by company, title, job ID and canonical URL)." />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">{counts.map(([s, n]) => <Link key={s} href={`/applications?status=${encodeURIComponent(s)}`}><Badge>{s}: {n}</Badge></Link>)}{sp.status && <Link href="/applications" className="text-primary">clear</Link>}</div>
      {(apps ?? []).length === 0 ? <Empty title="No applications yet">Open a vacancy and click “Prepare application”.</Empty> : (
        <form id={formId} action={createBatch}>
          <input type="hidden" name="return_to" value="/applications" />
          <div className="mb-2 flex gap-2"><Input name="title" placeholder="Batch name (optional)" className="max-w-xs" /><SubmitButton size="sm">Add selected to a new batch</SubmitButton></div>
          <Table>
            <thead><tr><th><CheckAll formId={formId} name="application_ids" /></th><th>Vacancy</th><th>Channel</th><th>Status</th><th>Approval</th><th>Missing info</th><th>Submitted</th></tr></thead>
            <tbody>
              {(apps ?? []).map((a: any) => (
                <tr key={a.id}>
                  <td>{['none', 'rejected', 'failed'].includes(a.approval_status) && !a.submitted_at && <input type="checkbox" name="application_ids" value={a.id} aria-label="select" />}</td>
                  <td><Link className="font-medium text-primary hover:underline" href={`/applications/${a.id}`}>{a.jobs?.title}</Link><p className="text-xs text-muted-foreground">{a.jobs?.company_name} · {a.jobs?.country ?? ''}</p></td>
                  <td className="text-xs">{a.channel === 'email' ? `Email → ${a.apply_email}` : 'Employer site'}</td>
                  <td><Badge>{a.status}</Badge></td>
                  <td><Badge tone={a.approval_status === 'submitted' ? 'green' : a.approval_status === 'failed' ? 'red' : a.approval_status === 'needs_extra_approval' ? 'amber' : 'blue'}>{a.approval_status}</Badge>{a.extra_approval_reason && <p className="max-w-[200px] text-xs text-amber-800">⚠ {a.extra_approval_reason}</p>}</td>
                  <td className="max-w-[220px] text-xs">{(a.missing_info ?? []).join('; ') || '—'}</td>
                  <td className="text-xs">{a.submitted_at ? fmtDate(a.submitted_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </form>
      )}
    </div>
  );
}
