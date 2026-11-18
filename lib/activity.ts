import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function logActivity(sb: SupabaseClient, action: string, entityType?: string, entityId?: string | null, details?: unknown) {
  await sb.from('activity_logs').insert({ action, entity_type: entityType ?? null, entity_id: entityId ?? null, details: details ?? null });
}
