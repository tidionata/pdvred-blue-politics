-- ============================================================
-- 1. TABELA DE LIMITES POR PLANO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan public.subscription_plan PRIMARY KEY,
  max_products integer NOT NULL,
  max_users integer NOT NULL,
  has_cardapio boolean NOT NULL DEFAULT false,
  has_pix_qr boolean NOT NULL DEFAULT false,
  max_stores integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Todos podem ver os limites dos planos
CREATE POLICY "Plan limits are public" ON public.plan_limits
  FOR SELECT USING (true);

-- 2. INICIALIZAÇÃO DOS LIMITES (Conforme descrição do Stripe)
INSERT INTO public.plan_limits (plan, max_products, max_users, has_cardapio, has_pix_qr, max_stores)
VALUES 
  ('starter', 999999, 1, false, false, 1),
  ('pro', 999999, 3, true, true, 1),
  ('business', 999999, 999999, true, true, 2)
ON CONFLICT (plan) DO UPDATE SET
  max_products = EXCLUDED.max_products,
  max_users = EXCLUDED.max_users,
  has_cardapio = EXCLUDED.has_cardapio,
  has_pix_qr = EXCLUDED.has_pix_qr,
  max_stores = EXCLUDED.max_stores,
  updated_at = now();

-- 3. VIEW PARA CONSULTAR STATUS DA LOJA COM LIMITES
CREATE OR REPLACE VIEW public.store_subscription_status AS
  SELECT 
    s.id as store_id,
    s.name as store_name,
    sub.plan,
    sub.status,
    sub.trial_ends_at,
    pl.max_products,
    pl.max_users,
    pl.has_cardapio,
    pl.has_pix_qr,
    pl.max_stores
  FROM public.stores s
  LEFT JOIN public.subscriptions sub ON s.id = sub.store_id
  LEFT JOIN public.plan_limits pl ON sub.plan = pl.plan;

-- 4. COMENTÁRIOS PARA DOCUMENTAÇÃO
COMMENT ON TABLE public.plan_limits IS 'Define as restrições técnicas para cada nível de assinatura.';
COMMENT ON COLUMN public.plan_limits.max_products IS 'Quantidade máxima de produtos ativos permitida.';
COMMENT ON COLUMN public.plan_limits.max_users IS 'Quantidade máxima de usuários/perfis vinculados à loja.';
