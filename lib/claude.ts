import 'server-only';
import { env } from '@/lib/env';

export class ClaudeNotConfigured extends Error {
  constructor() { super('Claude API key is not configured. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.'); }
}

export async function callClaude(opts: { system: string; prompt: string; maxTokens?: number; model?: string | null }) {
  if (!env.anthropicKey) throw new ClaudeNotConfigured();
  const model = opts.model || env.claudeModel;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  return { text, model };
}

export async function callClaudeJSON<T = any>(opts: { system: string; prompt: string; maxTokens?: number; model?: string | null }): Promise<{ data: T; model: string }> {
  const { text, model } = await callClaude({ ...opts, system: opts.system + '\nRespond with a single valid JSON object only. No markdown fences, no commentary.' });
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Claude did not return JSON');
  return { data: JSON.parse(text.slice(start, end + 1)) as T, model };
}

export const TRUTH_RULES = `STRICT FACT RULES:
- Use ONLY facts present in the candidate profile and CV text provided. Never invent employers, dates, titles, degrees, certifications, metrics, tools, achievements or personal details.
- If a job requirement is not supported by the CV, do not claim it. You may say the candidate is willing to learn only if phrased as an intention, not as experience.
- The candidate is based in Lahore, Pakistan. Never imply she has EU/UK work authorization.`;

export function profileContext(profile: any, cvText: string) {
  return `CANDIDATE PROFILE (authoritative):
Name: ${profile?.full_name ?? ''}
Headline: ${profile?.headline ?? ''}
Location: ${profile?.location ?? ''}
Years of experience: ${profile?.years_experience ?? ''}
Work authorization: ${profile?.work_authorization ?? ''}
Notice period: ${profile?.notice_period ?? ''}
Salary expectation: ${profile?.salary_expectation ?? 'not provided'}
Skills: ${(profile?.skills ?? []).join(', ')}
Tools: ${(profile?.tools ?? []).join(', ')}
Experience: ${JSON.stringify(profile?.experience ?? [])}
Education: ${JSON.stringify(profile?.education ?? [])}
LinkedIn: ${profile?.linkedin_url ?? ''}  Portfolio: ${profile?.portfolio_url ?? ''}

MASTER CV TEXT:
${(cvText || '').slice(0, 12000)}`;
}
