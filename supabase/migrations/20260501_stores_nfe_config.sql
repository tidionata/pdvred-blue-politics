-- Adiciona campo de configuração NFe em stores
-- Armazena token, ambiente e dados fiscais por empresa (store)

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS nfe_config jsonb DEFAULT '{}'::jsonb;

-- Garante que só o owner pode ver/editar a config NFe (já protegido pelo RLS de stores)
-- As políticas existentes (owner_id = auth.uid()) já cobrem isso.

COMMENT ON COLUMN public.stores.nfe_config IS
  'Configuração de integração NFe por empresa. Campos: token, ambiente, cnpj, razao_social, inscricao_estadual, regime_tributario';
