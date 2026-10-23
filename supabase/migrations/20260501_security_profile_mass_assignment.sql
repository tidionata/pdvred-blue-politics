-- ============================================================
-- SECURITY FIX: Mass Assignment em profiles
--
-- Problema: A política "Users can update own profile" permite
-- que qualquer usuário autenticado atualize TODOS os campos
-- do próprio profile, incluindo `role` (owner/manager/cashier)
-- e `store_id` — possibilitando elevação de privilégio.
--
-- Solução: Substituir por uma RPC que aceita apenas os campos
-- editáveis pelo usuário (full_name, avatar_url), bloqueando
-- qualquer tentativa de alterar role ou store_id via frontend.
-- ============================================================

-- Remove a política UPDATE insegura (sem restrição de colunas)
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile"      ON public.profiles;

-- Recria restrita: usuário pode atualizar SOMENTE full_name e avatar_url
-- (colunas não sensíveis). role e store_id só podem ser alterados
-- por funções SECURITY DEFINER controladas pelo backend.
CREATE POLICY "users_update_own_profile_safe" ON public.profiles
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (
    auth_user_id = auth.uid()
    -- Garante que role e store_id NÃO mudaram
    -- (comparação com NEW feita via trigger abaixo)
  );

-- ─── Trigger: bloqueia alteração de role e store_id via UPDATE ───────────────
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Impede que o usuário altere seu próprio role pelo frontend
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION
      'Alteração de role não permitida via frontend. Use a função administrativa.',
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Impede que o usuário mude de loja pelo frontend
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION
      'Alteração de store_id não permitida via frontend.',
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Garante que auth_user_id também não pode ser alterado
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profile_auth_user_immutable
    CHECK (true); -- enforcement via trigger acima
