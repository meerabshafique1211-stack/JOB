import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Flash, PageHeader, Select, Stat, Table, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { syncReplies, markSentStatus } from '../_actions/tracking';
import { fmtDateTime } from '@/lib/utils';

export const maxDuration = 120;

export default async function Outreach({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: tok } = await supabase.from('oauth_tokens').select('account_email, scopes, updated_at, refresh_token_enc').eq('provider', 'google').maybeSingle();
  const { data: sent } = await supabase.from('sent_emails').select('*, hiring_contacts(name, designation), jobs(id, title, company_name)').order('sent_at', { ascending: false }).limit(300);
  const s = sent ?? [];
  const count = (st: string) => s.filter((x: any) => x.delivery_status === st).length;
  return (
    <div>
      <PageHeader title="Gmail Inbox / Outreach Tracking" description="Every email sent through the platform, with Gmail thread tracking, reply and bounce detection." actions={
        tok?.refresh_token_enc ? <form action={syncReplies}><input type="hidden" name="return_to" value="/outreach" /><SubmitButton pendingText="Checking Gmail threads…">Check for replies & bounces</SubmitButton></form> : <Link className={buttonClass()} href="/settings?tab=integrations">Connect Gmail</Link>
      } />
      <Flash msg={sp.msg} err={sp.err} />
      <Card className="mb-4"><CardBody className="text-sm">
        {tok?.refresh_token_enc ? <p>Connected Gmail account: <span className="font-medium">{tok.account_email}</span> <Badge tone="green">authorized</Badge> <span className="text-xs text-muted-foreground">· scopes: {tok.scopes}</span></p> : <p className="text-amber-800">Gmail is not connected. Sending, reply detection and bounce tracking are unavailable until you authorize it in Settings → Integrations.</p>}
      </CardBody></Card>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sent" value={s.length} /><Stat label="Awaiting reply" value={count('sent')} /><Stat label="Replied" value={count('replied')} /><Stat label="Bounced" value={count('bounced')} /><Stat label="Opted out" value={count('opted_out')} />
      </div>
      {s.length === 0 ? <Empty title="Nothing sent yet">Approve and execute a batch to send emails through Gmail.</Empty> : (
        <Table>
          <thead><tr><th>Recipient</th><th>Subject</th><th>Vacancy</th><th>Sent</th><th>Status</th><th>Latest reply</th><th>Thread</th><th></th></tr></thead>
          <tbody>
            {s.map((m: any) => (
              <tr key={m.id}>
                <td><p className="font-medium">{m.hiring_contacts?.name ?? m.to_email}</p><p className="text-xs text-muted-foreground">{m.to_email}</p></td>
                <td className="text-xs">{m.subject}<div><Badge>{m.kind}{m.application_id ? ' · application' : ''}</Badge></div></td>
                <td className="text-xs">{m.jobs ? <Link className="hover:underline" href={`/jobs/${m.jobs.id}`}>{m.jobs.title} @ {m.jobs.company_name}</Link> : '—'}</td>
                <td className="text-xs">{fmtDateTime(m.sent_at)}</td>
                <td><Badge tone={m.delivery_status === 'replied' ? 'green' : m.delivery_status === 'bounced' ? 'red' : m.delivery_status === 'opted_out' ? 'gray' : 'blue'}>{m.delivery_status}</Badge><p className="text-[11px] text-muted-foreground">checked {m.last_checked_at ? fmtDateTime(m.last_checked_at) : 'never'}</p></td>
                <td className="max-w-[260px] text-xs">{m.reply_snippet ? <><p className="text-muted-foreground">{m.from_reply}</p><p>{m.reply_snippet}</p></> : '—'}</td>
                <td className="text-xs">{m.gmail_thread_id ? <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://mail.google.com/mail/u/0/#all/${m.gmail_thread_id}`}>Open in Gmail ↗</a> : '—'}</td>
                <td>
                  <form action={markSentStatus} className="flex gap-1">
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="return_to" value="/outreach" />
                    <Select name="delivery_status" defaultValue={m.delivery_status} className="h-8 w-28 text-xs"><option>sent</option><option>replied</option><option>bounced</option><option value="opted_out">opted out</option></Select>
                    <SubmitButton size="sm" variant="outline">Set</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
