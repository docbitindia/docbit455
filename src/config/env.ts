export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
}

export const env: PublicEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  siteUrl: import.meta.env.VITE_SITE_URL ?? 'https://docbit.in'
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export function missingSupabaseVariables(): string[] {
  return [
    !env.supabaseUrl ? 'VITE_SUPABASE_URL' : '',
    !env.supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : ''
  ].filter(Boolean);
}
