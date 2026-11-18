import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Flash, PageHeader, Select } from '@/components/ui';
import { SubmitButton, CopyButton } from '@/components/client';
import { generateLinkedIn } from '../_actions/emails';
import { setLinkedInStatus } from '../_actions/contacts';

export const maxDuration = 60;

export default async function LinkedInPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: contacts } = await supabase.from('hiring_contacts').select('*, companies(id, name, linkedin_url), jobs(id, title)').order('created_at', { ascending: false }).limit(200);
  const { data: msgs } = await supabase.from('email_drafts').select('*').in('kind', ['linkedin_connect', 'linkedin_message']).order('created_at', { ascending: false });
  const byContact = new Map<string, any[]>();
  (msgs ?? []).forEach((m: any) => { const a = byContact.get(m.contact_id) ?? []; a.push(m); byContact.set(m.contact_id, a); });
  const counts = (st: string) => (contacts ?? []).filter((c: any) => c.linkedin_status === st).length;
  return (
    <div>
      <PageHeader title="LinkedIn Outreach" description="LinkedIn does not offer a permitted API for automated messaging, so messages are prepared here and you send them yourself: copy, open the profile, paste. Track the status after sending." />
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-4 text-sm text-muted-foreground">Not contacted {counts('not_contacted')} · Request sent {counts('request_sent')} · Messaged {counts('messaged')} · Replied {counts('replied')}</p>
      {(contacts ?? []).length === 0 ? <Empty title="No contacts yet">Add recruiters from a company page first.</Empty> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(contacts ?? []).map((c: any) => {
            const latest = byContact.get(c.id) ?? [];
            const connect = latest.find((m) => m.kind === 'linkedin_connect');
            const message = latest.find((m) => m.kind === 'linkedin_message');
            const search = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.name} ${c.companies?.name ?? ''}`)}`;
            return (
              <Card key={c.id}>
                <CardHeader title={<span>{c.name} <span className="text-sm font-normal text-muted-foreground">· {c.designation ?? c.role_type}</span></span>} description={<span>{c.companies && <Link className="hover:underline" href={`/companies/${c.companies.id}`}>{c.companies.name}</Link>}{c.jobs ? ` · ${c.jobs.title}` : ''}</span>} action={<Badge tone={c.linkedin_status === 'replied' ? 'green' : c.linkedin_status === 'not_contacted' ? 'gray' : 'blue'}>{c.linkedin_status.replace(/_/g, ' ')}</Badge>} />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <a className="rounded border border-border px-2 py-1 text-xs hover:bg-muted" href={c.linkedin_url || search} target="_blank" rel="noopener noreferrer">{c.linkedin_url ? 'Open profile ↗' : 'Search profile ↗'}</a>
                    {c.companies && <a className="rounded border border-border px-2 py-1 text-xs hover:bg-muted" href={c.companies.linkedin_url || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.companies.name)}`} target="_blank" rel="noopener noreferrer">Company page ↗</a>}
                  </div>
                  {[['Connection note', connect, 'linkedin_connect'], ['Message', message, 'linkedin_message']].map(([label, m, kind]: any) => (
                    <div key={kind} className="rounded-md bg-muted/50 p-2">
                      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium">{label}{m ? ` (${m.body.length} chars)` : ''}</span>
                        <div className="flex gap-1">
                          {m && <CopyButton text={m.body} />}
                          <form action={generateLinkedIn}><input type="hidden" name="contact_id" value={c.id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="job_id" value={c.job_id ?? ''} /><SubmitButton size="sm" variant="outline" pendingText="…">{m ? 'Regenerate' : 'Generate'}</SubmitButton></form>
                        </div>
                      </div>
                      {m && <p className="prose-pre text-xs">{m.body}</p>}
                    </div>
                  ))}
                  <form action={setLinkedInStatus} className="flex gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Select name="linkedin_status" defaultValue={c.linkedin_status} className="h-8 text-xs">
                      <option value="not_contacted">Not contacted</option><option value="request_sent">Connection request sent</option><option value="messaged">Message sent</option><option value="replied">Replied</option><option value="declined">Declined / not interested</option>
                    </Select>
                    <SubmitButton size="sm" variant="outline">Update</SubmitButton>
                  </form>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
