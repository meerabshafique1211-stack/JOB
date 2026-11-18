export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  allowedEmail: (process.env.ALLOWED_EMAIL ?? '').toLowerCase(),
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  hunterKey: process.env.HUNTER_API_KEY ?? '',
};

export function integrationStatus() {
  return {
    supabase: Boolean(env.supabaseUrl && env.supabaseAnonKey),
    claude: Boolean(env.anthropicKey),
    gmailOAuth: Boolean(env.googleClientId && env.googleClientSecret && env.tokenKey),
    hunter: Boolean(env.hunterKey),
    encryption: env.tokenKey.length >= 32,
  };
}
