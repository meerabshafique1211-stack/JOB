import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Field, Flash, Input, PageHeader, Textarea, buttonClass } from '@/components/ui';
import { SubmitButton, CopyButton } from '@/components/client';
import { saveDocument, deleteDocument } from '../../_actions/documents';
import { lineDiff } from '@/lib/documents';

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: d } = await supabase.from('cv_documents').select('*, jobs(id, title, company_name)').eq('id', id).maybeSingle();
  if (!d) notFound();
  const { data: base } = d.based_on_id ? await supabase.from('cv_documents').select('id, title, content').eq('id', d.based_on_id).maybeSingle() : { data: null };
  const diff = d.kind === 'tailored_cv' && base?.content ? lineDiff(base.content, d.content ?? '') : null;
  return (
    <div>
      <PageHeader title={d.title} description={<span><Badge>{d.kind}</Badge> {d.jobs && <Link className="ml-1 text-primary hover:underline" href={`/jobs/${d.jobs.id}`}>for {d.jobs.title} @ {d.jobs.company_name}</Link>}</span>} actions={
        <>
          {d.storage_path && <a className={buttonClass('outline')} href={`/api/documents/${id}?format=original`}>Download original</a>}
          <a className={buttonClass('outline')} href={`/api/documents/${id}?format=docx`}>Download .docx</a>
          <Link className={buttonClass('ghost')} href="/documents">← Documents</Link>
        </>
      } />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Content" description="Markdown: # name, ## sections, ### roles, - bullets. Edit freely; downloads use this text." action={<CopyButton text={d.content ?? ''} />} />
          <CardBody>
            <form action={saveDocument} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Title"><Input name="title" defaultValue={d.title} /></Field>
              <Textarea name="content" rows={28} defaultValue={d.content ?? ''} className="font-mono text-xs" />
              <div className="flex gap-2">
                <SubmitButton>Save</SubmitButton>
              </div>
            </form>
            <form action={deleteDocument} className="mt-2"><input type="hidden" name="id" value={id} /><SubmitButton variant="ghost" size="sm" confirm="Delete this document?">Delete document</SubmitButton></form>
          </CardBody>
        </Card>
        {diff ? (
          <Card>
            <CardHeader title="Compare with original CV" description={`Base: ${base!.title}. Check that every added line is true.`} />
            <CardBody className="space-y-4 text-xs">
              <div>
                <p className="mb-1 font-medium text-emerald-800">Lines new or reworded in the tailored CV ({diff.added.length})</p>
                <div className="space-y-1">{diff.added.map((l, i) => <p key={i} className="rounded bg-emerald-50 px-2 py-1">+ {l}</p>)}</div>
              </div>
              <div>
                <p className="mb-1 font-medium text-red-800">Original lines not present verbatim ({diff.removed.length})</p>
                <div className="space-y-1">{diff.removed.map((l, i) => <p key={i} className="rounded bg-red-50 px-2 py-1">− {l}</p>)}</div>
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Preview" />
            <CardBody><div className="prose-pre text-sm leading-relaxed">{d.content || 'No text extracted.'}</div></CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
