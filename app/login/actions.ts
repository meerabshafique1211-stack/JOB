'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { getOrigin } from '@/lib/origin';
import { str } from '@/lib/utils';

function back(q: string): never {
  redirect(`/login?${q}`);
}

function checkEmail(email: string): void {
  if (!env.allowedEmail) back('err=' + encodeURIComponent('ALLOWED_EMAIL is not configured on the server.'));
  if (email.toLowerCase() !== env.allowedEmail) back('err=' + encodeURIComponent('This is a private application. Only the owner account can sign in.'));
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { login_hint: env.allowedEmail, prompt: 'select_account' } },
  });
  if (error || !data.url) back('err=' + encodeURIComponent(`Google sign-in is not available yet: ${error?.message ?? 'provider not enabled'}. Use email sign-in below, or enable the Google provider in Supabase (see SETUP.md).`));
  redirect(data!.url);
}

export async function signInWithPassword(fd: FormData) {
  const email = str(fd, 'email');
  checkEmail(email);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: str(fd, 'password') });
  if (error) back('err=' + encodeURIComponent(error.message));
  redirect('/');
}

export async function signUpWithPassword(fd: FormData) {
  const email = str(fd, 'email');
  checkEmail(email);
  const password = str(fd, 'password');
  if (password.length < 10) back('err=' + encodeURIComponent('Use a password of at least 10 characters.'));
  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) back('err=' + encodeURIComponent(error.message));
  if (data.session) redirect('/');
  back('msg=' + encodeURIComponent('Account created. Open the confirmation email from Supabase, click the link, then sign in here with your password.'));
}

export async function sendMagicLink(fd: FormData) {
  const email = str(fd, 'email');
  checkEmail(email);
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) back('err=' + encodeURIComponent(error.message));
  back('msg=' + encodeURIComponent('Sign-in link sent. Check your inbox and open the link on this device.'));
}
