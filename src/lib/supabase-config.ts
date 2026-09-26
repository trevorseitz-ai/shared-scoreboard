// Supabase publishable credentials are designed to be included in browser apps.
// All table access remains denied by RLS; capability-checked RPCs control writes.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://konzaspwopgahevxbgmb.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_OjvcI8C7whwRcySgqIz0hA_OV8nmdDD";
