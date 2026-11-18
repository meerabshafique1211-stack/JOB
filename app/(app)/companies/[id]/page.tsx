import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Field, Flash, Input, PageHeader, Textarea, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { ContactFields } from '@/components/contact-form';
import { addContact, updateCompany, hunterFindContacts, toggleShortlist, deleteContact } from '../../_actions/contacts';
import { generateEmail } from '../../_actions/emails';
import { integrationStatus } from '@/lib/env';

const PRIORITY = ['Technical Recruiter', 'Talent Acquisition Manager', 'HR Manager', 'QA Manager', 'Engineering Manager', 'Project Manager', 'Head of Talent Acquisition', 'CTO', 'Founder', 'CEO'];

export const maxDuration = 60;

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: c } = await supabase.from('companies').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: jobs }, { data: contacts }] = await Promise.all([
    supabase.from('jobs').select('id, title, category, vacancy_status, pipeline_status, url').eq('company_id', id),
    supabase.from('hiring_contacts').select('*, contact_sources(url, description)').eq('company_id', id).order('created_at'),
  ]);
  const ret = `/companies/${id}`;
  const integ = integrationStatus();
  const enc = encodeURIComponent;
  return (
    <div>
      <PageHeader title={c.name} description={c.domain ?? 'No domain recorded'} actions={
        <form action={toggleShortlist}><input type="hidden" name="id" value={id} /><input type="hidden" name="return_to" value={ret} /><input type="hidden" name="shortlisted" value={c.shortlisted ? 'false' : 'true'} /><SubmitButton variant={c.shortlisted ? 'outline' : 'default'}>{c.shortlisted ? '★ Shortlisted (undo)' : 'Shortlist company'}</SubmitButton></form>
      } />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title={`Hiring contacts (${contacts?.length ?? 0})`} description="Priority: Technical Recruiter → Talent Acquisition → HR → QA/Engineering/Project Manager → Head of TA → CTO → Founder → CEO" action={
              <form action={hunterFindContacts}><input type="hidden" name="company_id" value={id} /><input type="hidden" name="return_to" value={ret} /><SubmitButton size="sm" variant="outline" pendingText="Searching Hunter…">{integ.hunter ? 'Find verified emails (Hunter.io)' : 'Hunter.io (not configured)'}</SubmitButton></form>
            } />
            <CardBody className="space-y-3">
              {(contacts ?? []).length === 0 && <p className="text-sm text-muted-foreground">No contacts yet. Use the search links on the right, then add each person with the URL where you found them.</p>}
              {(contacts ?? []).map((p: any) => (
                <div key={p.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{p.name} <span className="font-normal text-muted-foreground">· {p.designation ?? p.role_type}</span></p>
                      <p className="text-xs">{p.email ?? 'No email'} <Badge tone={['verified', 'public_source'].includes(p.email_status) ? 'green' : p.email_status === 'invalid' ? 'red' : 'amber'}>{p.email_status}</Badge> {p.linkedin_url && <a className="text-primary hover:underline" href={p.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}</p>
                      <p className="text-xs text-muted-foreground">Sources: {[p.source_url, ...(p.contact_sources ?? []).map((s: any) => s.url)].filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).map((u: string) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="mr-2 underline">{(() => { try { return new URL(u).hostname; } catch { return u; } })()}</a>)}</p>
                    </div>
                    <div className="flex gap-1">
                      <form action={generateEmail}><input type="hidden" name="contact_id" value={p.id} /><input type="hidden" name="job_id" value={p.job_id ?? ''} /><input type="hidden" name="return_to" value={ret} /><SubmitButton size="sm" pendingText="Writing…">Cold email</SubmitButton></form>
                      <Link href={`/contacts?edit=${p.id}`} className={buttonClass('outline', 'sm')}>Edit</Link>
                      <form action={deleteContact}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="return_to" value={ret} /><SubmitButton size="sm" variant="ghost" confirm="Delete contact?">✕</SubmitButton></form>
                    </div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Add a contact" description="Never invent people or emails. Record the public page where you found them." />
            <CardBody>
              <form action={addContact} className="space-y-3">
                <input type="hidden" name="company_id" value={id} /><input type="hidden" name="return_to" value={ret} />
                <ContactFields jobs={(jobs ?? []).map((j: any) => ({ id: j.id, title: j.title }))} />
                <SubmitButton>Add contact</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Find decision-makers" description="Opens LinkedIn / Google searches in a new tab (no scraping)." />
            <CardBody className="space-y-1 text-sm">
              {PRIORITY.map((r) => (
                <div key={r} className="flex items-center justify-between gap-2">
                  <span>{r}</span>
                  <span className="flex gap-1">
                    <a className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${enc(`${r} ${c.name}`)}`}>LinkedIn ↗</a>
                    <a className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/search?q=${enc(`site:linkedin.com/in "${c.name}" "${r}"`)}`}>Google ↗</a>
                  </span>
                </div>
              ))}
              <div className="pt-2"><a className="text-xs text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={c.linkedin_url || `https://www.linkedin.com/search/results/companies/?keywords=${enc(c.name)}`}>Company LinkedIn page ↗</a></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Company details" />
            <CardBody>
              <form action={updateCompany} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Domain (for Hunter.io)"><Input name="domain" defaultValue={c.domain ?? ''} placeholder="example.com" /></Field>
                <Field label="Website"><Input name="website" defaultValue={c.website ?? ''} /></Field>
                <Field label="Careers page"><Input name="careers_url" defaultValue={c.careers_url ?? ''} /></Field>
                <Field label="LinkedIn page"><Input name="linkedin_url" defaultValue={c.linkedin_url ?? ''} /></Field>
                <Field label="Country"><Input name="country" defaultValue={c.country ?? ''} /></Field>
                <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={c.notes ?? ''} /></Field>
                <SubmitButton size="sm" variant="outline">Save</SubmitButton>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Vacancies" />
            <CardBody className="space-y-1 text-sm">
              {(jobs ?? []).map((j: any) => <p key={j.id}><Link className="text-primary hover:underline" href={`/jobs/${j.id}`}>{j.title}</Link> <Badge>{j.pipeline_status}</Badge></p>)}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
