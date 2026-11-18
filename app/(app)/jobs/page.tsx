import { requireOwner } from '@/lib/supabase/server';
import { Card, CardBody, CardHeader, Field, Input, PageHeader, Textarea, Badge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { JobList, type JobSearch } from '@/components/job-list';
import { runDiscovery, importJob, scoreJobs } from '../_actions/jobs';
import { assistedSearchLinks } from '@/lib/jobs/sources';
import { fmtDateTime } from '@/lib/utils';

export const maxDuration = 300;

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobSearch> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: sources } = await supabase.from('job_sources').select('*').order('key');
  const { data: profile } = await supabase.from('user_profile').select('target_titles').eq('id', 1).maybeSingle();
  const firstTitle = sp.title || profile?.target_titles?.[0] || 'QA Engineer';
  return (
    <div>
      <PageHeader
        title="Job Discovery"
        description="Live vacancies from public job APIs and feeds (Remotive, Remote OK, Himalayas, Jobicy, Arbeitnow, We Work Remotely), plus postings you import from LinkedIn, Indeed and other sites. Eligibility labels are rule-based with the evidence shown on each vacancy."
        actions={
          <>
            <form action={runDiscovery}><SubmitButton pendingText="Searching all sources… (up to a minute)">Run discovery now</SubmitButton></form>
            <form action={scoreJobs}><input type="hidden" name="return_to" value="/jobs" /><SubmitButton variant="outline" pendingText="Scoring…">Score 8 unscored with Claude</SubmitButton></form>
          </>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Import a vacancy (user-assisted)" description="For LinkedIn, Indeed, Glassdoor, Wellfound, Welcome to the Jungle, Relocate.me and company career sites — no scraping. Open the job yourself, then paste its URL and description here." />
          <CardBody>
            <form action={importJob} className="grid gap-3 md:grid-cols-2">
              <Field label="Original vacancy URL *"><Input name="url" type="url" required placeholder="https://…" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Company (optional)"><Input name="company" /></Field>
                <Field label="Title (optional)"><Input name="title" /></Field>
              </div>
              <Field label="Location (optional)"><Input name="location" placeholder="e.g. Remote – Worldwide, or Berlin, Germany" /></Field>
              <div className="md:col-span-2"><Field label="Full job description" hint="Claude extracts company, title, salary, deadline and requirements if you leave them empty."><Textarea name="text" rows={5} /></Field></div>
              <div className="md:col-span-2"><SubmitButton pendingText="Importing…">Import vacancy</SubmitButton></div>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sources" description="Status of the last discovery run" />
          <CardBody className="space-y-2 text-sm">
            {(sources ?? []).map((s: any) => (
              <div key={s.key} className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{s.name} {!s.enabled && <Badge>off</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{s.last_run_at ? `${fmtDateTime(s.last_run_at)} · ${s.last_status} · ${s.last_count ?? 0} fetched` : s.kind === 'manual' ? 'Import form' : 'Not run yet'}</p>
                </div>
              </div>
            ))}
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Open searches for “{firstTitle}” (then import):</p>
              <div className="flex flex-wrap gap-1">
                {assistedSearchLinks(firstTitle).map((l) => <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted">{l.name} ↗</a>)}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
      <JobList sp={sp} basePath="/jobs" />
    </div>
  );
}
