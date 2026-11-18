import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Empty, Flash, PageHeader, Table } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { draftFollowUp, cancelFollowUp, syncReplies } from '../_actions/tracking';
import { fmtDate } from '@/lib/utils';

export const maxDuration = 120;

export default async function FollowUps({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('follow_ups').select('*, sent_emails(id, to_email, subject, sent_at, delivery_status, hiring_contacts(name), jobs(id, title, company_name)), email_drafts(id, status)').order('due_date');
  const today = new Date().toISOString().slice(0, 10);
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title="Follow-Ups" description="First follow-up is due 5 business days after the initial email; the second 8 business days after the first. Replies, bounces and opt-outs cancel pending follow-ups. Follow-ups are only sent through an approved batch." actions={<form action={syncReplies}><input type="hidden" name="return_to" value="/follow-ups" /><SubmitButton variant="outline" pendingText="Checking Gmail…">Check replies first</SubmitButton></form>} />
      <Flash msg={sp.msg} err={sp.err} />
      {rows.length === 0 ? <Empty title="No follow-ups scheduled">They are created automatically when an initial cold email is sent.</Empty> : (
        <Table>
          <thead><tr><th>Due</th><th>Step</th><th>Recipient</th><th>Original email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((f: any) => {
              const s = f.sent_emails;
              const due = f.due_date <= today && f.status === 'pending';
              return (
                <tr key={f.id} className={due ? 'bg-amber-50/60' : ''}>
                  <td className="text-xs">{fmtDate(f.due_date)} {due && <Badge tone="amber">due</Badge>}</td>
                  <td>#{f.step}</td>
                  <td className="text-xs">{s?.hiring_contacts?.name ?? ''}<div className="text-muted-foreground">{s?.to_email}</div></td>
                  <td className="text-xs">{s?.subject}<div className="text-muted-foreground">sent {fmtDate(s?.sent_at)} · {s?.jobs ? `${s.jobs.title} @ ${s.jobs.company_name}` : ''}</div></td>
                  <td><Badge tone={f.status === 'sent' ? 'green' : f.status === 'cancelled' ? 'gray' : f.status === 'drafted' ? 'blue' : 'amber'}>{f.status}</Badge> {s?.delivery_status !== 'sent' && <Badge tone="gray">{s?.delivery_status}</Badge>}</td>
                  <td className="whitespace-nowrap">
                    {f.status === 'pending' && s?.delivery_status === 'sent' && (
                      <div className="flex gap-1">
                        <form action={draftFollowUp}><input type="hidden" name="id" value={f.id} /><SubmitButton size="sm" pendingText="Writing…">Draft follow-up</SubmitButton></form>
                        <form action={cancelFollowUp}><input type="hidden" name="id" value={f.id} /><SubmitButton size="sm" variant="ghost">Cancel</SubmitButton></form>
                      </div>
                    )}
                    {f.email_drafts && <Link className="text-xs text-primary hover:underline" href={`/emails/${f.email_drafts.id}`}>Draft ({f.email_drafts.status}) →</Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
