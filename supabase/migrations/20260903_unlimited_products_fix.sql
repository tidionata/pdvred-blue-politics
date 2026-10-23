-- ============================================================
-- FIX: PRODUTOS ILIMITADOS PARA TODOS OS USUÁRIOS E PLANOS
-- ============================================================

-- 1. Atualiza todos os planos existentes para max_products = 999999 (Ilimitado)
UPDATE public.plan_limits
SET max_products = 999999,
    has_cardapio = true,
    has_pix_qr = true,
    updated_at = now();

-- 2. Insere/Atualiza limites garantindo produtos ilimitados em todos os tipos de plano
INSERT INTO public.plan_limits (plan, max_products, max_users, has_cardapio, has_pix_qr, max_stores)
VALUES 
  ('starter', 999999, 999, true, true, 1),
  ('pro', 999999, 999, true, true, 1),
  ('business', 999999, 999999, true, true, 5)
ON CONFLICT (plan) DO UPDATE SET
  max_products = 999999,
  has_cardapio = true,
  has_pix_qr = true,
  updated_at = now();

-- 3. Atualização específica para o usuário Fernandalizz94@gmail.com e de qualquer outra loja sem plano ativo
UPDATE public.subscriptions
SET plan = 'business',
    status = 'active',
    updated_at = now()
WHERE store_id IN (
  SELECT s.id 
  FROM public.stores s
  JOIN public.profiles p ON p.store_id = s.id
  JOIN auth.users u ON u.id = p.auth_user_id
  WHERE LOWER(u.email) = 'fernandalizz94@gmail.com'
);
