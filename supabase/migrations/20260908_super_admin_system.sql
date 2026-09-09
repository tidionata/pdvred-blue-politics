-- Migration para suporte a Super Admin, Bloqueio de Lojas e Expiração de Licença

-- 1. Adicionar colunas de controle na tabela stores
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '30 days'),
ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'pro',
ADD COLUMN IF NOT EXISTS master_admin_password text,
ADD COLUMN IF NOT EXISTS block_reason text,
ADD COLUMN IF NOT EXISTS owner_email text;

-- 2. Atualizar stores existentes com o email do owner para facilitar busca no painel master
UPDATE public.stores s
SET owner_email = u.email
FROM auth.users u
WHERE s.owner_id = u.id AND s.owner_email IS NULL;

-- 3. Criar índice para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_stores_status ON public.stores(status);
CREATE INDEX IF NOT EXISTS idx_stores_expires_at ON public.stores(expires_at);

-- 4. Criar tabela de Logs de Auditoria Master
CREATE TABLE IF NOT EXISTS public.super_admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
