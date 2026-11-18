import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/supabase/server';
import { Badge, Card, CardBody, CardHeader, Flash, PageHeader, Stat, buttonClass } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { approveBatch, executeBatch, removeFromBatch, cancelBatch } from '../../_actions/batches';
import { fmtDateTime } from '@/lib/utils';

export const maxDuration = 300;

const emailTone = (s: string) => (s === 'sent' ? 'green' : s === 'failed' ? 'red' : s === 'skipped' || s === 'duplicate' ? 'gray' : 'blue') as any;

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const { data: b } = await supabase.from('email_batches').select('*').eq('id', id).maybeSingle();
  if (!b) notFound();
  const [{ data: drafts }, { data: apps }, { data: approval }, { data: tok }] = await Promise.all([
    supabase.from('email_drafts').select('*, hiring_contacts(name, designation, email, email_status, source_url), jobs(id, title, company_name, category, url, visa_sponsorship, pakistan_eligible), cv_documents(id, title)').eq('batch_id', id).order('created_at'),
    supabase.from('applications').select('*, jobs(id, title, company_name, category, url)').eq('batch_id', id).order('created_at'),
    supabase.from('batch_approvals').select('*').eq('batch_id', id).maybeSingle(),
    supabase.from('oauth_tokens').select('account_email, refresh_token_enc').eq('provider', 'google').maybeSingle(),
  ]);
  const open = b.status === 'open';
  const e = (drafts ?? []).filter((d: any) => (open ? d.status === 'in_batch' : true));
  const a = (apps ?? []).filter((x: any) => (open ? x.approval_status === 'in_batch' : true));
  const emailsBy = (s: string) => (drafts ?? []).filter((d: any) => d.status === s).length;
  const appsBy = (s: string) => (apps ?? []).filter((x: any) => x.approval_status === s).length;
  const awaiting = (apps ?? []).filter((x: any) => (x.approval_status === 'approved' && !x.submitted_at) || x.approval_status === 'needs_extra_approval').length;

  return (
    <div>
      <PageHeader title={b.title ?? 'Batch'} description={<span>Status: <Badge>{b.status === 'open' ? 'awaiting your review' : b.status}</Badge> · created {fmtDateTime(b.created_at)}{b.approved_at ? ` · approved ${fmtDateTime(b.approved_at)}` : ''}</span>} actions={<Link href="/batches" className={buttonClass('outline')}>← All batches</Link>} />
      <Flash msg={sp.msg} err={sp.err} />

      {open && (
        <Card className="mb-4 border-primary/30">
          <CardBody className="space-y-3">
            <p className="text-sm">You are about to approve exactly <b>{e.length} email{e.length === 1 ? '' : 's'}</b> and <b>{a.length} application{a.length === 1 ? '' : 's'}</b> listed below. After approval, the list is locked; newly prepared items will need a new batch.</p>
            {!tok?.refresh_token_enc && e.length > 0 && <p className="text-sm text-amber-800">⚠ Gmail is not connected yet. You can approve now, but sending will fail until you connect Gmail in Settings.</p>}
            <div className="flex flex-wrap gap-2">
              <form action={approveBatch}>
                <input type="hidden" name="batch_id" value={id} /><input type="hidden" name="expected_emails" value={e.length} /><input type="hidden" name="expected_applications" value={a.length} />
                <SubmitButton size="lg" confirm={`Approve ${e.length} emails and ${a.length} applications? They will be sent/submitted when you execute the batch.`}>Approve {e.length} Email{e.length === 1 ? '' : 's'} and {a.length} Application{a.length === 1 ? '' : 's'}</SubmitButton>
              </form>
              <form action={cancelBatch}><input type="hidden" name="batch_id" value={id} /><SubmitButton variant="ghost" confirm="Cancel this batch? Items return to drafts.">Cancel batch</SubmitButton></form>
            </div>
          </CardBody>
        </Card>
      )}

      {(b.status === 'approved' || b.status === 'executing') && (
        <Card className="mb-4 border-primary/30">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Approved {approval?.email_ids?.length ?? 0} email(s) and {approval?.application_ids?.length ?? 0} application(s) at {fmtDateTime(approval?.approved_at)}. Only these will be processed{tok?.account_email ? `, from ${tok.account_email}` : ''}.</p>
            <div className="flex gap-2">
              <form action={executeBatch}><input type="hidden" name="batch_id" value={id} /><SubmitButton size="lg" pendingText="Sending and submitting… do not close this tab">Execute approved batch</SubmitButton></form>
              {b.status === 'approved' && <form action={cancelBatch}><input type="hidden" name="batch_id" value={id} /><SubmitButton variant="ghost" confirm="Cancel before execution?">Cancel</SubmitButton></form>}
            </div>
          </CardBody>
        </Card>
      )}

      {!open && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Successfully sent" value={emailsBy('sent')} />
          <Stat label="Successfully submitted" value={appsBy('submitted')} />
          <Stat label="Failed" value={emailsBy('failed') + appsBy('failed')} />
          <Stat label="Skipped" value={emailsBy('skipped')} />
          <Stat label="Duplicate prevented" value={emailsBy('duplicate')} />
          <Stat label="Awaiting action" value={awaiting + emailsBy('approved')} />
        </div>
      )}

      <h2 className="mb-2 font-semibold">Emails ({e.length})</h2>
      <div className="mb-6 space-y-3">
        {e.map((d: any) => {
          const c = d.hiring_contacts;
          const verified = ['verified', 'public_source'].includes(c?.email_status);
          return (
            <Card key={d.id}>
              <CardHeader
                title={<span>{d.jobs?.company_name ?? '—'} · {d.jobs?.title ?? 'no vacancy'}</span>}
                description={<span>To {c?.name} ({c?.designation ?? d.kind}) · {d.to_email ?? 'no email'} · <Badge tone={verified || d.parent_sent_id ? 'green' : 'amber'}>{d.parent_sent_id ? 'thread reply' : c?.email_status ?? 'n/a'}</Badge> · <Badge>{d.jobs?.category === 'visa' ? 'Visa sponsorship' : d.jobs?.category === 'remote' ? 'Remote' : d.jobs?.category ?? 'general'}</Badge></span>}
                action={<Badge tone={emailTone(d.status)}>{d.status}</Badge>}
              />
              <CardBody className="space-y-2 text-sm">
                <p className="font-medium">{d.subject}</p>
                <div className="prose-pre max-h-60 overflow-y-auto rounded bg-muted/40 p-2 text-sm">{d.body}</div>
                <p className="text-xs text-muted-foreground">Attachment: {d.cv_documents?.title ?? 'none'} · Contact source: {c?.source_url ? <a className="underline" href={c.source_url} target="_blank" rel="noopener noreferrer">{c.source_url}</a> : 'none'}</p>
                {(d.warnings ?? []).length > 0 && <p className="text-xs text-amber-800">⚠ {d.warnings.join(' ')}</p>}
                {d.result_message && <p className="text-xs"><b>Result:</b> {d.result_message}</p>}
                {open && (
                  <div className="flex gap-2">
                    <Link href={`/emails/${d.id}`} className={buttonClass('outline', 'sm')}>Edit</Link>
                    <form action={removeFromBatch}><input type="hidden" name="batch_id" value={id} /><input type="hidden" name="type" value="email" /><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="ghost">Remove</SubmitButton></form>
                    <form action={removeFromBatch}><input type="hidden" name="batch_id" value={id} /><input type="hidden" name="type" value="email" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="reject" value="true" /><SubmitButton size="sm" variant="ghost">Reject</SubmitButton></form>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
        {e.length === 0 && <p className="text-sm text-muted-foreground">No emails in this batch.</p>}
      </div>

      <h2 className="mb-2 font-semibold">Applications ({a.length})</h2>
      <div className="space-y-3">
        {a.map((x: any) => (
          <Card key={x.id}>
            <CardHeader title={<Link className="hover:underline" href={`/applications/${x.id}`}>{x.jobs?.company_name} · {x.jobs?.title}</Link>} description={<span>{x.channel === 'email' ? `Email application → ${x.apply_email}` : <>Employer website: <a className="underline" href={x.apply_url ?? x.jobs?.url} target="_blank" rel="noopener noreferrer">{x.apply_url ?? x.jobs?.url}</a></>} · <Badge>{x.jobs?.category}</Badge></span>} action={<Badge tone={x.approval_status === 'submitted' ? 'green' : x.approval_status === 'failed' ? 'red' : x.approval_status === 'needs_extra_approval' ? 'amber' : 'blue'}>{x.approval_status}</Badge>} />
            <CardBody className="space-y-1 text-sm">
              <p className="text-xs">CV: {x.cv_doc_id ? <Link className="underline" href={`/documents/${x.cv_doc_id}`}>tailored CV</Link> : '—'} · Cover letter: {x.cover_doc_id ? <Link className="underline" href={`/documents/${x.cover_doc_id}`}>view</Link> : '—'} · {(x.form_answers ?? []).length} prepared answers</p>
              {(x.missing_info ?? []).length > 0 && <p className="text-xs text-amber-800">Missing: {x.missing_info.join('; ')}</p>}
              {x.extra_approval_reason && <p className="text-xs text-amber-800">⚠ Will stop for extra approval: {x.extra_approval_reason}</p>}
              {x.result_message && <p className="text-xs"><b>Result:</b> {x.result_message}</p>}
              {open && (
                <div className="flex gap-2 pt-1">
                  <form action={removeFromBatch}><input type="hidden" name="batch_id" value={id} /><input type="hidden" name="type" value="application" /><input type="hidden" name="id" value={x.id} /><SubmitButton size="sm" variant="ghost">Remove</SubmitButton></form>
                  <form action={removeFromBatch}><input type="hidden" name="batch_id" value={id} /><input type="hidden" name="type" value="application" /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="reject" value="true" /><SubmitButton size="sm" variant="ghost">Reject</SubmitButton></form>
                </div>
              )}
              {!open && x.approval_status === 'approved' && !x.submitted_at && <Link href={`/applications/${x.id}`} className={buttonClass('default', 'sm')}>Submit on employer site → mark submitted</Link>}
            </CardBody>
          </Card>
        ))}
        {a.length === 0 && <p className="text-sm text-muted-foreground">No applications in this batch.</p>}
      </div>
    </div>
  );
}
