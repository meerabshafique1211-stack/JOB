import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export function go(path: string, opts: { msg?: string; err?: string } = {}): never {
  revalidatePath('/', 'layout');
  const [base, existing] = path.split('?');
  const q = new URLSearchParams(existing ?? '');
  q.delete('msg'); q.delete('err');
  if (opts.msg) q.set('msg', opts.msg);
  if (opts.err) q.set('err', opts.err);
  const qs = q.toString();
  redirect(qs ? `${base}?${qs}` : base);
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function backTo(fd: FormData, fallback: string) {
  const r = fd.get('return_to');
  return typeof r === 'string' && r.startsWith('/') ? r : fallback;
}
