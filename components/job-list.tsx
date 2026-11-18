import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Button, Card, CardBody, Empty, Flash, Input, Select, Table, buttonClass } from '@/components/ui';
import { SubmitButton, CheckAll } from '@/components/client';
import { JobRowCells } from '@/components/jobs';
import { scoreJobs } from '@/app/(app)/_actions/jobs';
import { PIPELINE_STATUSES } from '@/lib/utils';

export type JobSearch = Record<string, string | undefined>;

export async function JobList({ sp, fixedCategory, basePath }: { sp: JobSearch; fixedCategory?: 'remote' | 'visa'; basePath: string }) {
  const { supabase } = await requireOwner();
  const { data: profile } = await supabase.from('user_profile').select('target_titles, target_countries').eq('id', 1).maybeSingle();
  let q = supabase.from('jobs').select('*, job_matches(score)').order('created_at', { ascending: false }).limit(400);
  if (fixedCategory) q = q.in('category', [fixedCategory, 'both']);
  else if (sp.category) q = q.eq('category', sp.category);
  if (sp.q) q = q.or(`title.ilike.%${sp.q.replace(/[,%()]/g, ' ')}%,company_name.ilike.%${sp.q.replace(/[,%()]/g, ' ')}%`);
  if (sp.title) q = q.ilike('title', `%${sp.title.replace(/[%]/g, '')}%`);
  if (sp.country) q = q.eq('country', sp.country);
  if (sp.status) q = q.eq('vacancy_status', sp.status);
  else q = q.neq('vacancy_status', 'expired');
  if (sp.pk) q = q.eq('pakistan_eligible', sp.pk);
  if (sp.visa) q = q.eq('visa_sponsorship', sp.visa);
  if (sp.relocation) q = q.eq('relocation', sp.relocation);
  if (sp.source) q = q.eq('source_key', sp.source);
  if (sp.pipeline) q = q.eq('pipeline_status', sp.pipeline);
  if (sp.min_salary) q = q.or(`salary_min.gte.${Number(sp.min_salary) || 0},salary_max.gte.${Number(sp.min_salary) || 0}`);
  const { data, error } = await q;
  const score = (j: any) => (Array.isArray(j.job_matches) ? j.job_matches[0]?.score : j.job_matches?.score) ?? null;
  let jobs = (data ?? []).map((j: any) => ({ ...j, _score: score(j) }));
  if (sp.min_score) jobs = jobs.filter((j: any) => (j._score ?? -1) >= Number(sp.min_score));
  if (sp.sort === 'score') jobs.sort((a: any, b: any) => (b._score ?? -1) - (a._score ?? -1));
  if (sp.sort === 'posted') jobs.sort((a: any, b: any) => new Date(b.posted_at ?? 0).getTime() - new Date(a.posted_at ?? 0).getTime());
  const { data: countriesRaw } = await supabase.from('jobs').select('country').not('country', 'is', null).limit(2000);
  const countries = Array.from(new Set([...(profile?.target_countries ?? []), ...(countriesRaw ?? []).map((c: any) => c.country)])).sort();
  const shown = jobs.slice(0, 150);
  const formId = 'jobs-select';

  return (
    <div className="space-y-4">
      <Flash msg={sp.msg} err={sp.err ?? error?.message} />
      <Card>
        <CardBody>
          <form className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8" action={basePath}>
            <Input name="q" placeholder="Search title or company" defaultValue={sp.q} className="col-span-2" />
            <Select name="title" defaultValue={sp.title ?? ''}>
              <option value="">Any target title</option>
              {(profile?.target_titles ?? []).map((t: string) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select name="country" defaultValue={sp.country ?? ''}>
              <option value="">Any country</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            {!fixedCategory && (
              <Select name="category" defaultValue={sp.category ?? ''}>
                <option value="">Any category</option>
                <option value="remote">Remote (Pakistan eligible)</option>
                <option value="visa">Visa sponsorship</option>
                <option value="both">Both</option>
                <option value="other">Unconfirmed</option>
              </Select>
            )}
            <Select name="pk" defaultValue={sp.pk ?? ''}>
              <option value="">PK eligibility: any</option><option value="yes">PK eligible: yes</option><option value="unclear">unclear</option><option value="no">no</option>
            </Select>
            <Select name="visa" defaultValue={sp.visa ?? ''}>
              <option value="">Sponsorship: any</option><option value="yes">Sponsorship: yes</option><option value="unclear">unclear</option><option value="no">no</option>
            </Select>
            <Select name="relocation" defaultValue={sp.relocation ?? ''}>
              <option value="">Relocation: any</option><option value="yes">Relocation: yes</option><option value="unclear">unclear</option><option value="no">no</option>
            </Select>
            <Select name="status" defaultValue={sp.status ?? ''}>
              <option value="">Active + unverified</option><option value="active">Active only</option><option value="unverified">Unverified</option><option value="expired">Expired</option>
            </Select>
            <Select name="pipeline" defaultValue={sp.pipeline ?? ''}>
              <option value="">Any pipeline stage</option>
              {PIPELINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input name="min_score" type="number" min={0} max={100} placeholder="Min score" defaultValue={sp.min_score} />
            <Input name="min_salary" type="number" min={0} placeholder="Min salary (annual)" defaultValue={sp.min_salary} />
            <Select name="source" defaultValue={sp.source ?? ''}>
              <option value="">Any source</option>
              {['remotive', 'remoteok', 'himalayas', 'jobicy', 'arbeitnow', 'wwr', 'manual'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select name="sort" defaultValue={sp.sort ?? ''}>
              <option value="">Newest found</option><option value="posted">Newest posted</option><option value="score">Best match</option>
            </Select>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="flex-1">Filter</Button>
              <Link href={basePath} className={buttonClass('outline')}>Reset</Link>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{jobs.length} vacancies{jobs.length > shown.length ? ` (showing ${shown.length})` : ''}. Salary filters only apply where the posting states a salary.</span>
      </div>

      {shown.length === 0 ? (
        <Empty title="No vacancies match">Run discovery, import a posting, or loosen the filters.</Empty>
      ) : (
        <form id={formId} action={scoreJobs}>
          <input type="hidden" name="return_to" value={basePath} />
          <div className="mb-2 flex gap-2">
            <SubmitButton size="sm" variant="outline" pendingText="Scoring with Claude…">Score selected (max 10)</SubmitButton>
          </div>
          <Table>
            <thead>
              <tr><th><CheckAll formId={formId} name="job_ids" /></th><th>Vacancy</th><th>Country</th><th>Category</th><th>Eligibility</th><th>Salary</th><th>Match</th><th>Status</th><th>Posted / source</th></tr>
            </thead>
            <tbody>
              {shown.map((j: any) => (
                <tr key={j.id}>
                  <td><input type="checkbox" name="job_ids" value={j.id} aria-label={`Select ${j.title}`} /></td>
                  <JobRowCells j={j} score={j._score} />
                </tr>
              ))}
            </tbody>
          </Table>
        </form>
      )}
    </div>
  );
}
