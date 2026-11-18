import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { integrationStatus, env } from '@/lib/env';
import { Badge, Card, CardBody, CardHeader, Field, Flash, Input, PageHeader, Table, Textarea, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { saveProfile, saveSearchPrefs, addDoNotContact, removeDoNotContact } from '../_actions/profile';
import { toggleSource } from '../_actions/jobs';
import { fmtDateTime, cn } from '@/lib/utils';

const TABS = [['profile', 'Profile'], ['search', 'Job titles & search'], ['sources', 'Job sources'], ['integrations', 'Integrations'], ['dnc', 'Do-Not-Contact'], ['activity', 'Activity log']] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'profile';
  const { supabase } = await requireOwner();
  const { data: p } = await supabase.from('user_profile').select('*').eq('id', 1).maybeSingle();
  const profile: any = p ?? {};
  const integ = integrationStatus();
  return (
    <div>
      <PageHeader title="Settings" />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([k, l]) => <Link key={k} href={`/settings?tab=${k}`} className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === k ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</Link>)}
      </div>

      {tab === 'profile' && (
        <Card>
          <CardHeader title="Professional profile" description="The authoritative facts used for matching, emails, CVs and form answers. Nothing outside this profile and your master CV is ever claimed." />
          <CardBody>
            <form action={saveProfile} className="grid gap-3 md:grid-cols-2">
              <Field label="Full name"><Input name="full_name" defaultValue={profile.full_name ?? ''} /></Field>
              <Field label="Headline"><Input name="headline" defaultValue={profile.headline ?? ''} /></Field>
              <Field label="Email"><Input name="email" defaultValue={profile.email ?? ''} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={profile.phone ?? ''} /></Field>
              <Field label="Location"><Input name="location" defaultValue={profile.location ?? ''} /></Field>
              <Field label="Years of experience"><Input name="years_experience" type="number" step="0.5" defaultValue={profile.years_experience ?? ''} /></Field>
              <Field label="LinkedIn URL"><Input name="linkedin_url" defaultValue={profile.linkedin_url ?? ''} /></Field>
              <Field label="Portfolio URL"><Input name="portfolio_url" defaultValue={profile.portfolio_url ?? ''} /></Field>
              <div className="md:col-span-2"><Field label="Summary"><Textarea name="summary" rows={3} defaultValue={profile.summary ?? ''} /></Field></div>
              <Field label="Skills (one per line or comma-separated)"><Textarea name="skills" rows={6} defaultValue={(profile.skills ?? []).join('\n')} /></Field>
              <Field label="Tools"><Textarea name="tools" rows={6} defaultValue={(profile.tools ?? []).join('\n')} /></Field>
              <Field label="Work authorization statement" hint="Used verbatim in applications."><Textarea name="work_authorization" rows={2} defaultValue={profile.work_authorization ?? ''} /></Field>
              <Field label="Notice period"><Input name="notice_period" defaultValue={profile.notice_period ?? ''} /></Field>
              <Field label="Salary expectation (text used in forms)" hint="Leave blank to be asked each time."><Input name="salary_expectation" defaultValue={profile.salary_expectation ?? ''} /></Field>
              <Field label="Minimum salary (EUR / year, for matching)"><Input name="min_salary_eur" type="number" defaultValue={profile.min_salary_eur ?? ''} /></Field>
              <Field label="Email signature"><Textarea name="email_signature" rows={4} defaultValue={profile.email_signature ?? ''} /></Field>
              <Field label="Claude model" hint={`Default: ${env.claudeModel}. Example: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5`}><Input name="ai_model" defaultValue={profile.ai_model ?? ''} placeholder={env.claudeModel} /></Field>
              <Field label="Experience (JSON)"><Textarea name="experience_json" rows={10} className="font-mono text-xs" defaultValue={JSON.stringify(profile.experience ?? [], null, 2)} /></Field>
              <Field label="Education (JSON)"><Textarea name="education_json" rows={10} className="font-mono text-xs" defaultValue={JSON.stringify(profile.education ?? [], null, 2)} /></Field>
              <div className="md:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
            </form>
          </CardBody>
        </Card>
      )}

      {tab === 'search' && (
        <Card>
          <CardHeader title="Job titles & search" description="Titles drive filters and search links; keywords decide which fetched listings are kept." />
          <CardBody>
            <form action={saveSearchPrefs} className="grid gap-3 md:grid-cols-2">
              <Field label="Target job titles (one per line)"><Textarea name="target_titles" rows={14} defaultValue={(profile.target_titles ?? []).join('\n')} /></Field>
              <Field label="Priority countries (one per line)"><Textarea name="target_countries" rows={14} defaultValue={(profile.target_countries ?? []).join('\n')} /></Field>
              <Field label="Title keywords to keep (one per line)" hint="A listing is kept if its title contains any of these."><Textarea name="title_keywords" rows={10} defaultValue={(profile.title_keywords ?? []).join('\n')} /></Field>
              <Field label="Title keywords to exclude (one per line)" hint="e.g. senior, lead, principal — listings with these are dropped."><Textarea name="exclude_keywords" rows={10} defaultValue={(profile.exclude_keywords ?? []).join('\n')} /></Field>
              <div className="md:col-span-2"><SubmitButton>Save</SubmitButton></div>
            </form>
          </CardBody>
        </Card>
      )}

      {tab === 'sources' && <Sources />}

      {tab === 'integrations' && <Integrations integ={integ} />}

      {tab === 'dnc' && <DNC />}

      {tab === 'activity' && <Activity />}
    </div>
  );
}

async function Sources() {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('job_sources').select('*').order('key');
  return (
    <Table>
      <thead><tr><th>Source</th><th>Type</th><th>Notes</th><th>Last run</th><th></th></tr></thead>
      <tbody>
        {(data ?? []).map((s: any) => (
          <tr key={s.key}>
            <td className="font-medium">{s.name}</td><td className="text-xs">{s.kind}</td><td className="text-xs">{s.notes}</td>
            <td className="text-xs">{s.last_run_at ? `${fmtDateTime(s.last_run_at)} · ${s.last_status} · ${s.last_count ?? 0}` : '—'}</td>
            <td>{s.kind !== 'manual' && <form action={toggleSource}><input type="hidden" name="key" value={s.key} /><input type="hidden" name="enabled" value={s.enabled ? 'false' : 'true'} /><SubmitButton size="sm" variant="outline">{s.enabled ? 'Disable' : 'Enable'}</SubmitButton></form>}</td>
          </tr>
        ))}
        <tr><td className="font-medium">LinkedIn, Indeed, Glassdoor, Wellfound, Welcome to the Jungle, Relocate.me</td><td className="text-xs">user-assisted</td><td colSpan={3} className="text-xs">No permitted public job API for personal use. Use the search links on Job Discovery and import postings by URL + description.</td></tr>
      </tbody>
    </Table>
  );
}

async function Integrations({ integ }: { integ: ReturnType<typeof integrationStatus> }) {
  const { supabase } = await requireOwner();
  const { data: tok } = await supabase.from('oauth_tokens').select('account_email, scopes, updated_at, refresh_token_enc').eq('provider', 'google').maybeSingle();
  const Row = ({ name, ok, children }: { name: string; ok: boolean; children: React.ReactNode }) => (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-medium">{name} <Badge tone={ok ? 'green' : 'amber'}>{ok ? 'configured' : 'needs setup'}</Badge></p></div>
      <div className="text-sm">{children}</div>
    </div>
  );
  return (
    <Card>
      <CardBody>
        <Row name="Supabase database & storage" ok={integ.supabase}>Connected to {env.supabaseUrl.replace('https://', '')}</Row>
        <Row name="Claude API" ok={integ.claude}>{integ.claude ? `Model: ${env.claudeModel} (override in Profile)` : 'Add ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.'}</Row>
        <Row name="Gmail (Google OAuth)" ok={Boolean(tok?.refresh_token_enc)}>
          {tok?.refresh_token_enc ? (
            <div className="flex items-center gap-2">
              <span>Connected: <b>{tok.account_email}</b> · since {fmtDateTime(tok.updated_at)}</span>
              <form action="/api/gmail/disconnect" method="post"><button className={buttonClass('outline', 'sm')}>Disconnect</button></form>
            </div>
          ) : integ.gmailOAuth ? (
            <a className={buttonClass('default', 'sm')} href="/api/gmail/connect">Connect Gmail</a>
          ) : (
            <span>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel (see SETUP.md), then click Connect.</span>
          )}
        </Row>
        <Row name="Token encryption key" ok={integ.encryption}>{integ.encryption ? 'OAuth tokens are encrypted with AES-256-GCM.' : 'TOKEN_ENCRYPTION_KEY is missing.'}</Row>
        <Row name="Hunter.io (optional)" ok={integ.hunter}>{integ.hunter ? 'Domain search and email verification enabled.' : 'Optional: add HUNTER_API_KEY for verified recruiter emails.'}</Row>
        <p className="pt-3 text-xs text-muted-foreground">Gmail permissions requested: send email, read email metadata (for reply/bounce detection). Your Gmail password is never requested or stored. Requests to Google happen only on the server.</p>
      </CardBody>
    </Card>
  );
}

async function DNC() {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('do_not_contact').select('*').order('created_at', { ascending: false });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Add to Do-Not-Contact" description="Emails to these addresses or domains are always skipped, even inside approved batches." />
        <CardBody>
          <form action={addDoNotContact} className="grid gap-2 md:grid-cols-4">
            <Input name="email" type="email" placeholder="person@company.com" />
            <Input name="domain" placeholder="or domain: company.com" />
            <Input name="reason" placeholder="Reason" />
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardBody>
      </Card>
      <Table>
        <thead><tr><th>Email</th><th>Domain</th><th>Reason</th><th>Added</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((d: any) => (
            <tr key={d.id}><td>{d.email ?? '—'}</td><td>{d.domain ?? '—'}</td><td className="text-xs">{d.reason}</td><td className="text-xs">{fmtDateTime(d.created_at)}</td>
              <td><form action={removeDoNotContact}><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="ghost">Remove</SubmitButton></form></td></tr>
          ))}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground">Empty</td></tr>}
        </tbody>
      </Table>
    </div>
  );
}

async function Activity() {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
  return (
    <Table>
      <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
      <tbody>
        {(data ?? []).map((a: any) => (
          <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</td><td className="text-xs font-medium">{a.action}</td><td className="text-xs">{a.entity_type}</td><td className="max-w-[520px] truncate font-mono text-[11px]">{a.details ? JSON.stringify(a.details) : ''}</td></tr>
        ))}
      </tbody>
    </Table>
  );
}
