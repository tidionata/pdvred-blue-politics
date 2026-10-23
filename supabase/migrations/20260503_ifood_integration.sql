-- ============================================================
-- IFOOD INTEGRATION — PDVTOTAL
-- ============================================================

-- 1. ADICIONA CAMPOS NA TABELA DE PEDIDOS
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_code text;

CREATE INDEX IF NOT EXISTS idx_orders_external_id ON public.orders(external_id);

COMMENT ON COLUMN public.orders.external_id IS 'ID do pedido no iFood ou outra plataforma externa.';
COMMENT ON COLUMN public.orders.external_code IS 'Código legível do pedido (ex: #1234) no iFood.';

-- 2. ADICIONA CONFIGURAÇÃO DO IFOOD NA TABELA DE SEGREDOS
ALTER TABLE public.store_secrets 
  ADD COLUMN IF NOT EXISTS ifood_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_secrets.ifood_config IS 'Credenciais do iFood: merchant_id, client_id, client_secret, etc.';

-- 3. TABELA DE LOGS DE EVENTOS IFOOD (Para auditoria e troubleshooting)
CREATE TABLE IF NOT EXISTS public.ifood_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  event_id text,
  order_id text,
  event_code text,
  payload jsonb,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS para Logs
ALTER TABLE public.ifood_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ifood_logs_owner_select" ON public.ifood_event_logs;
CREATE POLICY "ifood_logs_owner_select" ON public.ifood_event_logs
  FOR SELECT USING (public.is_store_owner(auth.uid(), store_id));

-- 4. VIEW PARA FACILITAR CONSULTA DE STATUS IFOOD
CREATE OR REPLACE VIEW public.ifood_active_orders AS
  SELECT 
    o.id,
    o.store_id,
    o.customer_name,
    o.status,
    o.total,
    o.external_id,
    o.external_code,
    o.created_at
  FROM public.orders o
  WHERE o.origin = 'ifood' AND o.status NOT IN ('delivered', 'cancelled');
