import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Field, Flash, Input, PageHeader, Table, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { addCompany } from '../_actions/contacts';

export default async function Companies({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; q?: string; shortlisted?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  let q = supabase.from('companies').select('*, jobs(id, category), hiring_contacts(id)').order('shortlisted', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  if (sp.q) q = q.ilike('name', `%${sp.q.replace(/%/g, '')}%`);
  if (sp.shortlisted) q = q.eq('shortlisted', true);
  const { data } = await q;
  return (
    <div>
      <PageHeader title="Companies" description="Every employer from discovered vacancies. Shortlist a company to research its recruiters and hiring managers." />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <form className="flex gap-2" action="/companies">
              <Input name="q" placeholder="Search companies" defaultValue={sp.q} />
              <label className="flex items-center gap-1 whitespace-nowrap text-sm"><input type="checkbox" name="shortlisted" value="1" defaultChecked={!!sp.shortlisted} /> Shortlisted only</label>
              <button className={buttonClass('outline')}>Filter</button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Add company" />
          <CardBody>
            <form action={addCompany} className="space-y-2">
              <Input name="name" placeholder="Company name" required />
              <Input name="domain" placeholder="Domain, e.g. example.com" />
              <SubmitButton size="sm">Add</SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
      {(data ?? []).length === 0 ? <Empty title="No companies yet">They appear automatically when you run job discovery.</Empty> : (
        <Table>
          <thead><tr><th>Company</th><th>Domain</th><th>Country</th><th>Vacancies</th><th>Contacts</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((c: any) => (
              <tr key={c.id}>
                <td><Link className="font-medium text-primary hover:underline" href={`/companies/${c.id}`}>{c.name}</Link> {c.shortlisted && <Badge tone="amber">★ shortlisted</Badge>}</td>
                <td className="text-xs">{c.domain ?? '—'}</td>
                <td className="text-xs">{c.country ?? '—'}</td>
                <td className="text-xs">{c.jobs?.length ?? 0}{c.jobs?.some((j: any) => j.category !== 'other') ? <Badge tone="green" className="ml-1">eligible</Badge> : null}</td>
                <td className="text-xs">{c.hiring_contacts?.length ?? 0}</td>
                <td><Link className={buttonClass('outline', 'sm')} href={`/companies/${c.id}`}>Research</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
