import { Field, Input, Select, Textarea } from '@/components/ui';
import { RECIPIENT_TYPES } from '@/lib/utils';

export function ContactFields({ c, jobs }: { c?: any; jobs: { id: string; title: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Name *"><Input name="name" required defaultValue={c?.name} /></Field>
      <Field label="Designation"><Input name="designation" defaultValue={c?.designation ?? ''} placeholder="e.g. Technical Recruiter" /></Field>
      <Field label="Recipient type (email style)">
        <Select name="role_type" defaultValue={c?.role_type ?? ''}><option value="">Auto from designation</option>{RECIPIENT_TYPES.map((r) => <option key={r}>{r}</option>)}</Select>
      </Field>
      <Field label="Relevant vacancy">
        <Select name="job_id" defaultValue={c?.job_id ?? ''}><option value="">—</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select>
      </Field>
      <Field label="LinkedIn URL"><Input name="linkedin_url" type="url" defaultValue={c?.linkedin_url ?? ''} /></Field>
      <Field label="Country"><Input name="country" defaultValue={c?.country ?? ''} /></Field>
      <Field label="Public professional email"><Input name="email" type="email" defaultValue={c?.email ?? ''} /></Field>
      <Field label="Email verification status" hint="Only “verified” or “published on a public page” addresses are ever emailed.">
        <Select name="email_status" defaultValue={c?.email_status ?? 'unverified'}>
          <option value="unverified">Unverified</option>
          <option value="public_source">Published on a public page (source URL required)</option>
          <option value="verified">Verified by a verification service</option>
          <option value="guessed">Guessed pattern (never sent)</option>
          <option value="invalid">Invalid / bounced</option>
        </Select>
      </Field>
      <div className="sm:col-span-2"><Field label="Source URL * (where you found this person/email)"><Input name="source_url" type="url" defaultValue={c?.source_url ?? ''} /></Field></div>
      <div className="sm:col-span-2"><Field label="Notes"><Textarea name="notes" rows={2} defaultValue={c?.notes ?? ''} /></Field></div>
    </div>
  );
}
