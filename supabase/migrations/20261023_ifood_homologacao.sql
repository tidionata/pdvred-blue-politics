-- ============================================================
-- IFOOD — AJUSTES PARA HOMOLOGAÇÃO (Order + Events)
-- Baseado na documentação oficial (pasta /ifood):
--  - Cache de token (renovar só quando expirar)
--  - Deduplicação de eventos
--  - Dados completos do pedido (pagamento, cupons, entrega, código de coleta)
--  - Status do iFood sincronizado e disputas (Plataforma de negociação)
-- ============================================================

-- 1. CAMPOS EXTRAS EM PEDIDOS
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ifood_status text,            -- PLACED, CONFIRMED, PREPARATION_STARTED, READY_TO_PICKUP, DISPATCHED, CONCLUDED, CANCELLED, CANCELLATION_REQUESTED...
  ADD COLUMN IF NOT EXISTS ifood_order_type text,        -- DELIVERY | TAKEOUT | DINE_IN | INDOOR
  ADD COLUMN IF NOT EXISTS ifood_order_timing text,      -- IMMEDIATE | SCHEDULED
  ADD COLUMN IF NOT EXISTS ifood_delivered_by text,      -- IFOOD | MERCHANT
  ADD COLUMN IF NOT EXISTS ifood_details jsonb,          -- resumo do pedido (pagamentos, cupons, códigos, disputa, entregador)
  ADD COLUMN IF NOT EXISTS ifood_last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_origin_status ON public.orders(origin, status);

-- Observação por item (ex: "Retirar cebola")
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS observations text;

-- 2. CACHE DE TOKEN (somente service_role acessa — sem políticas = bloqueado p/ clientes)
CREATE TABLE IF NOT EXISTS public.ifood_auth (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ifood_auth ENABLE ROW LEVEL SECURITY;

-- 3. DEDUPLICAÇÃO DE EVENTOS
-- Remove duplicados antigos (se houver) antes de criar o índice único
DELETE FROM public.ifood_event_logs a
  USING public.ifood_event_logs b
  WHERE a.ctid < b.ctid
    AND a.store_id IS NOT DISTINCT FROM b.store_id
    AND a.event_id = b.event_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ifood_event_logs_store_event
  ON public.ifood_event_logs(store_id, event_id);

CREATE INDEX IF NOT EXISTS idx_ifood_event_logs_order ON public.ifood_event_logs(order_id);

-- 4. VIEW ATUALIZADA
DROP VIEW IF EXISTS public.ifood_active_orders;
CREATE VIEW public.ifood_active_orders
WITH (security_invoker = true) AS
  SELECT
    o.id, o.store_id, o.customer_name, o.status, o.total,
    o.external_id, o.external_code, o.ifood_status,
    o.ifood_order_type, o.ifood_delivered_by, o.created_at
  FROM public.orders o
  WHERE o.origin = 'ifood' AND o.status NOT IN ('delivered', 'cancelled');
