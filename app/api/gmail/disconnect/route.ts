import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { logActivity } from '@/lib/activity';

export async function POST(request: NextRequest) {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('oauth_tokens').select('refresh_token_enc').eq('provider', 'google').maybeSingle();
  if (data?.refresh_token_enc) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(data.refresh_token_enc))}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    } catch { /* still delete locally */ }
  }
  await supabase.from('oauth_tokens').delete().eq('provider', 'google');
  await logActivity(supabase, 'gmail_disconnected', 'oauth', null, null);
  return NextResponse.redirect(new URL('/settings?tab=integrations&msg=' + encodeURIComponent('Gmail disconnected and token revoked.'), request.url), { status: 303 });
}
