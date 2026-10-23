-- ============================================================
-- 1. CONFIGURAÇÃO DE IMPOSTOS POR LOJA (Reforma Tributária 2026)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_tax_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  cbs_rate numeric(5,2) NOT NULL DEFAULT 0.9, -- 0.9% em 2026
  ibs_rate numeric(5,2) NOT NULL DEFAULT 0.1, -- 0.1% em 2026 (Estadual)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.store_tax_config ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
CREATE POLICY "Store members can view tax config" ON public.store_tax_config
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store owners can manage tax config" ON public.store_tax_config
  FOR ALL USING (public.is_store_owner(auth.uid(), store_id));

-- Trigger de updated_at
CREATE TRIGGER tr_store_tax_config_updated_at
  BEFORE UPDATE ON public.store_tax_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. ATUALIZAÇÃO DE PRODUTOS
-- ============================================================

-- Adiciona classificação tributária de 6 dígitos para IBS/CBS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_ibs_cbs_classificacao text;
COMMENT ON COLUMN public.products.tax_ibs_cbs_classificacao IS 'Código de 6 dígitos da tabela oficial IBS/CBS (Ex: 010101)';

-- ============================================================
-- 3. ATUALIZAÇÃO DE ITENS DE VENDA (Audit Trail dos Impostos)
-- ============================================================

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS ibs_cbs_base numeric(10,2);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS aliquota_cbs numeric(5,2);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS valor_cbs numeric(10,2);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS aliquota_ibs numeric(5,2);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS valor_ibs numeric(10,2);

COMMENT ON COLUMN public.sale_items.ibs_cbs_base IS 'Base de cálculo para IBS e CBS';
COMMENT ON COLUMN public.sale_items.aliquota_cbs IS 'Alíquota da CBS em %';
COMMENT ON COLUMN public.sale_items.valor_cbs IS 'Valor calculado da CBS';
COMMENT ON COLUMN public.sale_items.aliquota_ibs IS 'Alíquota do IBS em %';
COMMENT ON COLUMN public.sale_items.valor_ibs IS 'Valor calculado do IBS';

-- ============================================================
-- 4. INICIALIZAÇÃO DE DADOS (Opcional)
-- ============================================================

-- Insere configuração padrão para lojas existentes
INSERT INTO public.store_tax_config (store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;
