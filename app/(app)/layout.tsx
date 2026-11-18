import { requireOwner } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireOwner();
  const [{ data: tok }, { count }] = await Promise.all([
    supabase.from('oauth_tokens').select('account_email, refresh_token_enc').eq('provider', 'google').maybeSingle(),
    supabase.from('email_batches').select('id', { count: 'exact', head: true }).in('status', ['open', 'approved']),
  ]);
  return (
    <div className="min-h-screen">
      <Sidebar email={user.email ?? ''} gmail={tok?.refresh_token_enc ? tok.account_email : null} pending={count ?? 0} />
      <main className="px-4 py-6 lg:ml-64 lg:px-8">{children}</main>
    </div>
  );
}
