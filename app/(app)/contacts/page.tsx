import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Flash, Input, PageHeader, Select, Table, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { ContactFields } from '@/components/contact-form';
import { updateContact, hunterVerifyEmail } from '../_actions/contacts';
import { generateEmail } from '../_actions/emails';

export const maxDuration = 60;

export default async function Contacts({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string; q?: string; status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  let q = supabase.from('hiring_contacts').select('*, companies(id, name), jobs(id, title)').order('created_at', { ascending: false }).limit(400);
  if (sp.q) q = q.or(`name.ilike.%${sp.q.replace(/[,%()]/g, ' ')}%,designation.ilike.%${sp.q.replace(/[,%()]/g, ' ')}%`);
  if (sp.status) q = q.eq('email_status', sp.status);
  const { data } = await q;
  const editing = sp.edit ? (data ?? []).find((c: any) => c.id === sp.edit) : null;
  const { data: jobs } = editing?.company_id ? await supabase.from('jobs').select('id, title').eq('company_id', editing.company_id) : { data: [] };
  return (
    <div>
      <PageHeader title="Hiring Contacts" description="Recruiters and hiring managers with their verified sources. Only verified or publicly published emails are ever sent to." />
      <Flash msg={sp.msg} err={sp.err} />
      {editing && (
        <Card className="mb-4">
          <CardHeader title={`Edit ${editing.name}`} action={<Link className={buttonClass('ghost', 'sm')} href="/contacts">Close</Link>} />
          <CardBody>
            <form action={updateContact} className="space-y-3">
              <input type="hidden" name="id" value={editing.id} /><input type="hidden" name="return_to" value="/contacts" />
              <ContactFields c={editing} jobs={(jobs ?? []) as any} />
              <SubmitButton>Save contact</SubmitButton>
            </form>
          </CardBody>
        </Card>
      )}
      <form className="mb-3 flex gap-2" action="/contacts">
        <Input name="q" placeholder="Search name or designation" defaultValue={sp.q} />
        <Select name="status" defaultValue={sp.status ?? ''} className="max-w-[220px]"><option value="">Any email status</option>{['verified', 'public_source', 'unverified', 'guessed', 'invalid', 'none'].map((s) => <option key={s}>{s}</option>)}</Select>
        <button className={buttonClass('outline')}>Filter</button>
      </form>
      {(data ?? []).length === 0 ? <Empty title="No contacts yet">Open a company and add recruiters or hiring managers.</Empty> : (
        <Table>
          <thead><tr><th>Name</th><th>Company</th><th>Vacancy</th><th>Email</th><th>Source</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((c: any) => (
              <tr key={c.id}>
                <td><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.designation ?? c.role_type}{c.country ? ` · ${c.country}` : ''}</p></td>
                <td className="text-xs">{c.companies ? <Link className="text-primary hover:underline" href={`/companies/${c.companies.id}`}>{c.companies.name}</Link> : '—'}</td>
                <td className="text-xs">{c.jobs ? <Link className="hover:underline" href={`/jobs/${c.jobs.id}`}>{c.jobs.title}</Link> : '—'}</td>
                <td className="text-xs">{c.email ?? '—'}<div><Badge tone={['verified', 'public_source'].includes(c.email_status) ? 'green' : c.email_status === 'invalid' ? 'red' : 'amber'}>{c.email_status}</Badge></div></td>
                <td className="text-xs">{c.source_url ? <a className="underline" href={c.source_url} target="_blank" rel="noopener noreferrer">source ↗</a> : '—'} {c.linkedin_url && <a className="ml-1 underline" href={c.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}</td>
                <td className="whitespace-nowrap">
                  <div className="flex gap-1">
                    <form action={generateEmail}><input type="hidden" name="contact_id" value={c.id} /><input type="hidden" name="job_id" value={c.job_id ?? ''} /><input type="hidden" name="return_to" value="/contacts" /><SubmitButton size="sm" pendingText="Writing…">Email</SubmitButton></form>
                    {c.email && !['verified', 'invalid'].includes(c.email_status) && <form action={hunterVerifyEmail}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="return_to" value="/contacts" /><SubmitButton size="sm" variant="outline" pendingText="…">Verify</SubmitButton></form>}
                    <Link className={buttonClass('ghost', 'sm')} href={`/contacts?edit=${c.id}`}>Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
