import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export type AuthSession = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  localId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  expiresAt: number;
};

export function toAuthSession(session: any): AuthSession | null {
  if (!session?.access_token || !session.user) return null;
  const user = session.user;
  return {
    idToken: session.access_token,
    accessToken: session.access_token,
    refreshToken: session.refresh_token || '',
    localId: user.id,
    email: user.email || '',
    displayName: user.user_metadata?.full_name || user.user_metadata?.name || undefined,
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || undefined,
    expiresAt: (session.expires_at || 0) * 1000
  };
}

