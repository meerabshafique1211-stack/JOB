import Link from 'next/link';
import { Badge, type Tone } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

export function triTone(v: string | null | undefined): Tone {
  return v === 'yes' ? 'green' : v === 'no' ? 'red' : 'gray';
}

export function displayStatus(job: any): 'active' | 'expired' | 'unverified' {
  if (job.vacancy_status === 'expired') return 'expired';
  if (job.vacancy_status === 'active' && job.verified_at && Date.now() - new Date(job.verified_at).getTime() > 14 * 864e5) return 'unverified';
  return job.vacancy_status ?? 'unverified';
}

export function StatusBadge({ job }: { job: any }) {
  const s = displayStatus(job);
  return <Badge tone={s === 'active' ? 'green' : s === 'expired' ? 'red' : 'amber'}>{s}</Badge>;
}

export function CategoryBadge({ c }: { c: string }) {
  const map: Record<string, [string, Tone]> = { remote: ['Remote (PK eligible)', 'blue'], visa: ['Visa sponsorship', 'violet'], both: ['Remote + Visa', 'green'], other: ['Unconfirmed eligibility', 'gray'] };
  const [l, t] = map[c] ?? map.other;
  return <Badge tone={t}>{l}</Badge>;
}

export function ScoreBadge({ score }: { score?: number | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted-foreground">not scored</span>;
  const tone: Tone = score >= 75 ? 'green' : score >= 55 ? 'amber' : 'red';
  return <Badge tone={tone} className="tabular-nums">{score}/100</Badge>;
}

export function salaryText(j: any) {
  if (j.salary_text) return j.salary_text;
  if (j.salary_min || j.salary_max) return `${[j.salary_min, j.salary_max].filter(Boolean).map((n: number) => Math.round(n).toLocaleString()).join('–')} ${j.salary_currency ?? ''}`.trim();
  return '—';
}

export function JobRowCells({ j, score }: { j: any; score?: number | null }) {
  return (
    <>
      <td>
        <Link href={`/jobs/${j.id}`} className="font-medium text-primary hover:underline">{j.title}</Link>
        <div className="text-xs text-muted-foreground">{j.company_name}</div>
      </td>
      <td className="text-xs">{j.country ?? '—'}<div className="text-muted-foreground">{(j.location ?? '').slice(0, 40)}</div></td>
      <td><CategoryBadge c={j.category} /></td>
      <td className="space-x-1 whitespace-nowrap text-xs">
        <Badge tone={triTone(j.pakistan_eligible)}>PK {j.pakistan_eligible}</Badge>
        <Badge tone={triTone(j.visa_sponsorship)}>Visa {j.visa_sponsorship}</Badge>
      </td>
      <td className="text-xs">{salaryText(j)}</td>
      <td><ScoreBadge score={score} /></td>
      <td><StatusBadge job={j} /><div className="text-xs text-muted-foreground">{j.pipeline_status}</div></td>
      <td className="text-xs text-muted-foreground">{fmtDate(j.posted_at ?? j.created_at)}<div>{j.source_key}</div></td>
    </>
  );
}
