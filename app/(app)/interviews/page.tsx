import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Card, CardBody, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, Table, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { saveInterview, deleteInterview } from '../_actions/tracking';
import { fmtDateTime } from '@/lib/utils';

export default async function Interviews({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('interviews').select('*, jobs(id, title, company_name)').order('scheduled_at', { ascending: true });
  const { data: jobs } = await supabase.from('jobs').select('id, title, company_name').in('pipeline_status', ['Applied', 'Email Sent', 'Recruiter Contacted', 'Response Received', 'Interview Scheduled', 'Follow-Up Due', 'Offer Received']).order('updated_at', { ascending: false });
  return (
    <div>
      <PageHeader title="Interviews" description="Times are Pakistan time (PKT)." />
      <Flash msg={sp.msg} err={sp.err} />
      <Card className="mb-4">
        <CardHeader title="Add interview" />
        <CardBody>
          <form action={saveInterview} className="grid gap-3 md:grid-cols-3">
            <Field label="Vacancy"><Select name="job_id"><option value="">—</option>{(jobs ?? []).map((j: any) => <option key={j.id} value={j.id}>{j.title} @ {j.company_name}</option>)}</Select></Field>
            <Field label="Company (if no vacancy)"><Input name="company_name" /></Field>
            <Field label="Date & time (PKT)"><Input name="scheduled_at" type="datetime-local" /></Field>
            <Field label="Stage"><Select name="kind"><option>Recruiter screen</option><option>HR interview</option><option>Technical interview</option><option>Assessment</option><option>Hiring manager</option><option>Final</option></Select></Field>
            <Field label="Meeting link"><Input name="link" type="url" /></Field>
            <Field label="Outcome"><Select name="outcome"><option value="">Pending</option><option>Passed</option><option>Rejected</option><option>Offer</option></Select></Field>
            <div className="md:col-span-3"><Field label="Notes / preparation"><Textarea name="notes" rows={2} /></Field></div>
            <div><SubmitButton>Save interview</SubmitButton></div>
          </form>
        </CardBody>
      </Card>
      {(data ?? []).length === 0 ? <Empty title="No interviews yet" /> : (
        <Table>
          <thead><tr><th>When (PKT)</th><th>Company / vacancy</th><th>Stage</th><th>Link</th><th>Outcome</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((i: any) => (
              <tr key={i.id}>
                <td className="text-xs">{fmtDateTime(i.scheduled_at)}</td>
                <td className="text-xs">{i.jobs ? <Link className="text-primary hover:underline" href={`/jobs/${i.jobs.id}`}>{i.jobs.title} @ {i.jobs.company_name}</Link> : i.company_name}</td>
                <td className="text-xs">{i.kind}</td>
                <td className="text-xs">{i.link ? <a className="underline" href={i.link} target="_blank" rel="noopener noreferrer">join ↗</a> : '—'}</td>
                <td className="text-xs">{i.outcome ?? 'Pending'}</td>
                <td className="max-w-[260px] text-xs">{i.notes}</td>
                <td><form action={deleteInterview}><input type="hidden" name="id" value={i.id} /><SubmitButton size="sm" variant="ghost" confirm="Delete?">✕</SubmitButton></form></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
