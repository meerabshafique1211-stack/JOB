import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errDesc = url.searchParams.get('error_description');
  if (errDesc) return NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(errDesc)}`, url.origin));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
