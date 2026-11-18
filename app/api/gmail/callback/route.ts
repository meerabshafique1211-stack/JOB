import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/supabase/server';
import { exchangeCode, saveTokens, gmailProfile } from '@/lib/gmail';
import { logActivity } from '@/lib/activity';

export async function GET(request: NextRequest) {
  const { supabase } = await requireOwner();
  const url = new URL(request.url);
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/settings?tab=integrations&${q}`, url.origin));
    r.cookies.delete({ name: 'gmail_oauth_state', path: '/api/gmail' });
    return r;
  };
  const err = url.searchParams.get('error');
  if (err) return back('err=' + encodeURIComponent(`Google authorization was not completed: ${err}`));
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('gmail_oauth_state')?.value;
  if (!state || !expected || state !== expected) return back('err=' + encodeURIComponent('Security check failed (state mismatch). Please try connecting again.'));
  const code = url.searchParams.get('code');
  if (!code) return back('err=' + encodeURIComponent('Missing authorization code.'));
  try {
    const tokens = await exchangeCode(code, `${url.origin}/api/gmail/callback`);
    if (!tokens.scope.includes('gmail.send')) return back('err=' + encodeURIComponent('Gmail send permission was not granted. Tick all requested permissions on the Google consent screen.'));
    if (!tokens.refresh_token) return back('err=' + encodeURIComponent('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.'));
    const profile = await gmailProfile(tokens.access_token);
    await saveTokens(supabase, profile.emailAddress, tokens);
    await logActivity(supabase, 'gmail_connected', 'oauth', null, { email: profile.emailAddress, scopes: tokens.scope });
    return back('msg=' + encodeURIComponent(`Gmail connected: ${profile.emailAddress}`));
  } catch (e) {
    return back('err=' + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
}
