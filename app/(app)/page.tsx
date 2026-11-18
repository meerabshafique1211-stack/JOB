import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { integrationStatus } from '@/lib/env';
import { Badge, Card, CardBody, CardHeader, Flash, PageHeader, Stat, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { runDiscovery } from './_actions/jobs';
import { fmtDateTime, fmtDate, PIPELINE_STATUSES } from '@/lib/utils';

export const maxDuration = 300;

export default async function Overview({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const head = { count: 'exact' as const, head: true };
  const today = new Date().toISOString().slice(0, 10);
  const [jobsAll, remote, visa, matches, contacts, drafts, sent, replied, apps, submitted, fuDue, openBatches, interviews, masters, tok, activity, pipeline, top] = await Promise.all([
    supabase.from('jobs').select('id', head).neq('vacancy_status', 'expired'),
    supabase.from('jobs').select('id', head).in('category', ['remote', 'both']).neq('vacancy_status', 'expired'),
    supabase.from('jobs').select('id', head).in('category', ['visa', 'both']).neq('vacancy_status', 'expired'),
    supabase.from('job_matches').select('id', head).gte('score', 70),
    supabase.from('hiring_contacts').select('id', head),
    supabase.from('email_drafts').select('id', head).eq('status', 'draft'),
    supabase.from('sent_emails').select('id', head),
    supabase.from('sent_emails').select('id', head).eq('delivery_status', 'replied'),
    supabase.from('applications').select('id', head),
    supabase.from('applications').select('id', head).not('submitted_at', 'is', null),
    supabase.from('follow_ups').select('id', head).eq('status', 'pending').lte('due_date', today),
    supabase.from('email_batches').select('id, title, status').in('status', ['open', 'approved']),
    supabase.from('interviews').select('id, scheduled_at, company_name, kind').gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(5),
    supabase.from('cv_documents').select('id', head).eq('kind', 'master'),
    supabase.from('oauth_tokens').select('account_email, refresh_token_enc').eq('provider', 'google').maybeSingle(),
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('jobs').select('pipeline_status').neq('pipeline_status', 'New').limit(2000),
    supabase.from('job_matches').select('score, jobs(id, title, company_name, category, vacancy_status)').order('score', { ascending: false }).limit(6),
  ]);
  const integ = integrationStatus();
  const setup = [
    { done: true, label: 'Database, storage and row-level security configured' },
    { done: (masters.count ?? 0) > 0, label: 'Master CV uploaded', href: '/documents' },
    { done: integ.claude, label: 'Claude API key added (matching, emails, CVs)', href: '/settings?tab=integrations' },
    { done: integ.gmailOAuth, label: 'Google OAuth credentials added to Vercel', href: '/settings?tab=integrations' },
    { done: Boolean(tok.data?.refresh_token_enc), label: 'Gmail account connected', href: '/settings?tab=integrations' },
    { done: (jobsAll.count ?? 0) > 0, label: 'First job discovery run', href: '/jobs' },
  ];
  const pipeCounts = PIPELINE_STATUSES.map((s) => [s, (pipeline.data ?? []).filter((j: any) => j.pipeline_status === s).length] as const).filter(([, n]) => n > 0);

  return (
    <div>
      <PageHeader title="Overview" description="Your European remote and visa-sponsored job search at a glance." actions={<form action={runDiscovery}><SubmitButton pendingText="Searching all sources…">Run job discovery</SubmitButton></form>} />
      <Flash msg={sp.msg} err={sp.err} />
      {setup.some((s) => !s.done) && (
        <Card className="mb-6">
          <CardHeader title="Setup checklist" description="Integrations that still need your action. See SETUP.md in the repository for exact steps." />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {setup.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span className={s.done ? 'text-emerald-600' : 'text-amber-600'}>{s.done ? '✓' : '○'}</span>
                {s.href && !s.done ? <Link className="text-primary hover:underline" href={s.href}>{s.label}</Link> : <span className={s.done ? 'text-muted-foreground' : ''}>{s.label}</span>}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Open vacancies" value={jobsAll.count ?? 0} href="/jobs" />
        <Stat label="Remote (PK eligible)" value={remote.count ?? 0} href="/jobs/remote" />
        <Stat label="Visa sponsorship" value={visa.count ?? 0} href="/jobs/visa" />
        <Stat label="Strong matches (≥70)" value={matches.count ?? 0} href="/jobs?sort=score&min_score=70" />
        <Stat label="Hiring contacts" value={contacts.count ?? 0} href="/contacts" />
        <Stat label="Email drafts" value={drafts.count ?? 0} href="/emails?status=draft" />
        <Stat label="Emails sent" value={sent.count ?? 0} href="/outreach" />
        <Stat label="Replies" value={replied.count ?? 0} href="/outreach" />
        <Stat label="Applications" value={apps.count ?? 0} href="/applications" />
        <Stat label="Submitted" value={submitted.count ?? 0} href="/applications?status=Applied" />
        <Stat label="Follow-ups due" value={fuDue.count ?? 0} href="/follow-ups" />
        <Stat label="Batches pending" value={openBatches.data?.length ?? 0} href="/batches" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Top matches" />
          <CardBody className="space-y-2 text-sm">
            {(top.data ?? []).length === 0 && <p className="text-muted-foreground">Score vacancies on Job Discovery to see your best matches.</p>}
            {(top.data ?? []).map((m: any) => m.jobs && (
              <div key={m.jobs.id} className="flex items-center justify-between gap-2">
                <Link className="truncate text-primary hover:underline" href={`/jobs/${m.jobs.id}`}>{m.jobs.title} <span className="text-muted-foreground">@ {m.jobs.company_name}</span></Link>
                <Badge tone={m.score >= 75 ? 'green' : 'amber'}>{m.score}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pipeline" />
          <CardBody className="space-y-1 text-sm">
            {pipeCounts.length === 0 && <p className="text-muted-foreground">No vacancies in progress yet.</p>}
            {pipeCounts.map(([s, n]) => <div key={s} className="flex justify-between"><Link className="hover:underline" href={`/jobs?pipeline=${encodeURIComponent(s)}`}>{s}</Link><span className="tabular-nums">{n}</span></div>)}
            <div className="border-t border-border pt-2">
              {(openBatches.data ?? []).map((b: any) => <p key={b.id}><Link className="text-primary hover:underline" href={`/batches/${b.id}`}>{b.title}</Link> <Badge>{b.status === 'open' ? 'needs review' : 'approved — execute'}</Badge></p>)}
              {(interviews.data ?? []).map((i: any) => <p key={i.id} className="text-xs">📅 {fmtDateTime(i.scheduled_at)} · {i.company_name} · {i.kind}</p>)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Link className={buttonClass('ghost', 'sm')} href="/settings?tab=activity">All</Link>} />
          <CardBody className="space-y-1 text-xs">
            {(activity.data ?? []).length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
            {(activity.data ?? []).map((a: any) => <p key={a.id}><span className="text-muted-foreground">{fmtDate(a.created_at)}</span> {a.action.replace(/_/g, ' ')}</p>)}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
