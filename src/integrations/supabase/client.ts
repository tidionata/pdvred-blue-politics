import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ⚠️  Nunca coloque credenciais diretamente aqui.
//     Use as variáveis de ambiente VITE_SUPABASE_URL e
//     VITE_SUPABASE_PUBLISHABLE_KEY definidas no arquivo .env
//     (que está listado no .gitignore e nunca vai para o Git).
//
//     A anon/publishable key é segura no front-end — ela tem
//     privilégios limitados e respeita integralmente o RLS.
//     A service_role key NUNCA deve chegar aqui.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não definidos. ' +
    'Verifique seu arquivo .env na raiz do projeto.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // localStorage é padrão e aceitável para a anon key.
    // Para áreas altamente sensíveis considere cookies HttpOnly
    // via um backend intermediário para o refresh token.
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Detecta automaticamente a sessão na URL após OAuth/email magic link
    detectSessionInUrl: true,
  },
});