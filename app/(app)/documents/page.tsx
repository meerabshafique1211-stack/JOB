import Link from 'next/link';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Empty, Field, Flash, Input, PageHeader, Table, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { uploadCV, setPrimaryCV } from '../_actions/documents';
import { fmtDate } from '@/lib/utils';

export const maxDuration = 60;

export default async function Documents({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: docs } = await supabase.from('cv_documents').select('id, kind, title, storage_path, mime_type, size_bytes, is_primary, job_id, created_at, jobs(id, title, company_name)').order('created_at', { ascending: false });
  const masters = (docs ?? []).filter((d: any) => d.kind === 'master');
  const generated = (docs ?? []).filter((d: any) => d.kind !== 'master');
  return (
    <div>
      <PageHeader title="CV and Cover Letters" description="Your master CV is the single source of truth. Tailored CVs and cover letters are generated from it without inventing anything; compare each against the original before using it." />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upload master CV" description="PDF or DOCX, max 5 MB. Stored privately in Supabase Storage." />
          <CardBody>
            <form action={uploadCV} className="space-y-3">
              <Field label="File"><input name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="text-sm" /></Field>
              <Field label="Title (optional)"><Input name="title" placeholder="e.g. SQA Engineer CV – Nov 2026" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="primary" defaultChecked /> Make this my primary CV</label>
              <SubmitButton pendingText="Uploading and extracting text…">Upload</SubmitButton>
            </form>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={`Master CVs (${masters.length})`} />
          <CardBody className="space-y-2">
            {masters.length === 0 && <p className="text-sm text-muted-foreground">No master CV yet.</p>}
            {masters.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <div>
                  <Link className="font-medium text-primary hover:underline" href={`/documents/${d.id}`}>{d.title}</Link> {d.is_primary && <Badge tone="green">primary</Badge>}
                  <p className="text-xs text-muted-foreground">{d.storage_path ? `${d.mime_type?.includes('pdf') ? 'PDF' : 'DOCX'} · ${Math.round((d.size_bytes ?? 0) / 1024)} KB` : 'Text only (imported)'} · {fmtDate(d.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  {d.storage_path && <a className={buttonClass('outline', 'sm')} href={`/api/documents/${d.id}?format=original`}>Download original</a>}
                  {!d.is_primary && <form action={setPrimaryCV}><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="outline">Make primary</SubmitButton></form>}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Generated documents</h2>
      {generated.length === 0 ? <Empty title="No tailored documents yet">Open a vacancy and click “Prepare application” or “Generate”.</Empty> : (
        <Table>
          <thead><tr><th>Document</th><th>Type</th><th>Vacancy</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {generated.map((d: any) => (
              <tr key={d.id}>
                <td><Link className="text-primary hover:underline" href={`/documents/${d.id}`}>{d.title}</Link></td>
                <td><Badge tone={d.kind === 'cover_letter' ? 'violet' : 'blue'}>{d.kind === 'cover_letter' ? 'Cover letter' : 'Tailored CV'}</Badge></td>
                <td className="text-xs">{d.jobs ? <Link className="hover:underline" href={`/jobs/${d.jobs.id}`}>{d.jobs.title} @ {d.jobs.company_name}</Link> : '—'}</td>
                <td className="text-xs">{fmtDate(d.created_at)}</td>
                <td className="whitespace-nowrap"><a className={buttonClass('outline', 'sm')} href={`/api/documents/${d.id}?format=docx`}>.docx</a> <a className={buttonClass('ghost', 'sm')} href={`/api/documents/${d.id}?format=txt`}>.txt</a></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
