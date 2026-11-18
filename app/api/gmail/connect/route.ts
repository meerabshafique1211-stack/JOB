import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { requireOwner } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { googleAuthUrl } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  await requireOwner();
  const origin = new URL(request.url).origin;
  if (!env.googleClientId || !env.googleClientSecret) {
    return NextResponse.redirect(new URL('/settings?tab=integrations&err=' + encodeURIComponent('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in Vercel yet. Follow SETUP.md step 4.'), origin));
  }
  if (env.tokenKey.length < 32) {
    return NextResponse.redirect(new URL('/settings?tab=integrations&err=' + encodeURIComponent('TOKEN_ENCRYPTION_KEY is missing; tokens cannot be stored securely.'), origin));
  }
  const state = crypto.randomBytes(24).toString('hex');
  const res = NextResponse.redirect(googleAuthUrl(`${origin}/api/gmail/callback`, state));
  res.cookies.set('gmail_oauth_state', state, { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'lax', path: '/api/gmail', maxAge: 600 });
  return res;
}
