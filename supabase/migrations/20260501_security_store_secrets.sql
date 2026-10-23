-- ============================================================
-- SECURITY FIX 1: Isolar segredos da loja em tabela separada
-- O token NFe nunca deve ser exposto a membros comuns.
-- Somente o OWNER da loja pode ler/escrever nesta tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_secrets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  nfe_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.store_secrets ENABLE ROW LEVEL SECURITY;

-- Somente o owner (stores.owner_id = auth.uid()) pode SELECT
CREATE POLICY "store_secrets_owner_select" ON public.store_secrets
  FOR SELECT USING (public.is_store_owner(auth.uid(), store_id));

-- Somente o owner pode INSERT
CREATE POLICY "store_secrets_owner_insert" ON public.store_secrets
  FOR INSERT WITH CHECK (public.is_store_owner(auth.uid(), store_id));

-- Somente o owner pode UPDATE
CREATE POLICY "store_secrets_owner_update" ON public.store_secrets
  FOR UPDATE USING (public.is_store_owner(auth.uid(), store_id));

-- Somente o owner pode DELETE
CREATE POLICY "store_secrets_owner_delete" ON public.store_secrets
  FOR DELETE USING (public.is_store_owner(auth.uid(), store_id));

-- Trigger de updated_at
CREATE TRIGGER tr_store_secrets_updated_at
  BEFORE UPDATE ON public.store_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime (opcional — owner pode observar mudanças)
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_secrets;

-- ============================================================
-- Remove nfe_config de stores (dados sensíveis não ficam aqui)
-- Mantém coluna para retrocompatibilidade mas sem dados
-- ============================================================
-- Nota: A coluna nfe_config na tabela stores continua existindo
-- mas não deve ser usada. O código novo lê de store_secrets.
-- ============================================================
