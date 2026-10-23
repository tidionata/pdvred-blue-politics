-- ============================================================
-- 1. TABELA DE COBRANÇAS DE ASSINATURA VIA PIX (ASAAS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plan_id text NOT NULL, -- 'sem_nota' | 'sem_nota_bot' | 'com_nota'
  plan_name text NOT NULL,
  amount numeric(10,2) NOT NULL,
  asaas_payment_id text UNIQUE,
  asaas_customer_id text,
  status text NOT NULL DEFAULT 'PENDING', -- PENDING | RECEIVED | CONFIRMED | OVERDUE
  pix_qr_code text,
  pix_copy_paste text,
  pix_expiration_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.subscription_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_charges_owner" ON public.subscription_charges
  FOR ALL USING (public.is_store_owner(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_subscription_charges_store ON public.subscription_charges(store_id);
CREATE INDEX IF NOT EXISTS idx_subscription_charges_payment ON public.subscription_charges(asaas_payment_id);
