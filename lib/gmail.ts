import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { encrypt, decrypt } from '@/lib/crypto';

export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export function googleAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (env.allowedEmail) p.set('login_hint', env.allowedEmail);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.googleClientId, client_secret: env.googleClientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token exchange failed: ${data.error_description || data.error || res.status}`);
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

export async function saveTokens(sb: SupabaseClient, email: string, t: { access_token: string; refresh_token?: string; expires_in: number; scope: string }) {
  const row: any = {
    provider: 'google',
    account_email: email,
    access_token_enc: encrypt(t.access_token),
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    scopes: t.scope,
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token) row.refresh_token_enc = encrypt(t.refresh_token);
  const { error } = await sb.from('oauth_tokens').upsert(row, { onConflict: 'provider' });
  if (error) throw new Error(error.message);
}

export async function getGmailAccount(sb: SupabaseClient) {
  const { data } = await sb.from('oauth_tokens').select('account_email, scopes, expires_at, updated_at, refresh_token_enc').eq('provider', 'google').maybeSingle();
  if (!data || !data.refresh_token_enc) return null;
  return { email: data.account_email as string, scopes: data.scopes as string, updatedAt: data.updated_at as string };
}

export class GmailNotConnected extends Error {
  constructor(msg = 'Gmail is not connected. Open Settings → Integrations and connect your Google account.') { super(msg); }
}

export async function getAccessToken(sb: SupabaseClient): Promise<{ token: string; email: string }> {
  const { data } = await sb.from('oauth_tokens').select('*').eq('provider', 'google').maybeSingle();
  if (!data || !data.refresh_token_enc) throw new GmailNotConnected();
  if (data.access_token_enc && data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 30_000) {
    return { token: decrypt(data.access_token_enc), email: data.account_email };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId, client_secret: env.googleClientSecret,
      refresh_token: decrypt(data.refresh_token_enc), grant_type: 'refresh_token',
    }),
  });
  const t = await res.json();
  if (!res.ok) {
    throw new GmailNotConnected(`Gmail authorization expired or was revoked (${t.error || res.status}). Reconnect Gmail in Settings.`);
  }
  await sb.from('oauth_tokens').update({
    access_token_enc: encrypt(t.access_token),
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('provider', 'google');
  return { token: t.access_token, email: data.account_email };
}

async function gmail(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data;
}

export async function gmailProfile(token: string) {
  return gmail(token, 'profile') as Promise<{ emailAddress: string }>;
}

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeader(s: string) {
  return /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=` : s;
}

export interface Attachment { filename: string; mimeType: string; content: Buffer }

export function buildMime(opts: {
  from: string; to: string; subject: string; body: string;
  inReplyTo?: string | null; references?: string | null; attachments?: Attachment[];
}) {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
  ];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);
  const textPart = Buffer.from(opts.body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  if (!opts.attachments?.length) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + textPart;
  }
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  let out = headers.join('\r\n') + '\r\n\r\n';
  out += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${textPart}\r\n`;
  for (const a of opts.attachments) {
    out += `--${boundary}\r\nContent-Type: ${a.mimeType}; name="${a.filename}"\r\nContent-Disposition: attachment; filename="${a.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    out += a.content.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
  }
  out += `--${boundary}--`;
  return out;
}

export async function sendGmail(token: string, mime: string, threadId?: string | null) {
  const body: any = { raw: b64url(Buffer.from(mime, 'utf8')) };
  if (threadId) body.threadId = threadId;
  const sent = await gmail(token, 'messages/send', { method: 'POST', body: JSON.stringify(body) });
  // Look up the RFC Message-ID so follow-ups can thread correctly
  let rfcId: string | null = null;
  try {
    const meta = await gmail(token, `messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
    rfcId = meta.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'message-id')?.value ?? null;
  } catch { /* non-fatal */ }
  return { id: sent.id as string, threadId: sent.threadId as string, rfcId };
}

export async function getThread(token: string, threadId: string) {
  return gmail(token, `threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
}

export async function searchMessages(token: string, q: string, max = 20) {
  const data = await gmail(token, `messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  return (data.messages ?? []) as { id: string; threadId: string }[];
}

export async function getMessageMeta(token: string, id: string) {
  return gmail(token, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To`);
}
