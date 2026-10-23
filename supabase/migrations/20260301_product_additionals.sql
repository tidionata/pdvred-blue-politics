-- =============================================
-- PRODUCT ADDITIONALS
-- Adiciona suporte a itens adicionais por produto
-- =============================================

-- 1. Novas colunas na tabela products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_additionals boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_additionals  integer NOT NULL DEFAULT 0;

-- 2. Nova tabela de adicionais do produto
CREATE TABLE public.product_additionals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id    uuid NOT NULL REFERENCES public.stores(id)  ON DELETE CASCADE,
  name        text          NOT NULL,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  active      boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_additionals_product ON public.product_additionals(product_id);
CREATE INDEX idx_product_additionals_store   ON public.product_additionals(store_id);

-- 3. RLS
ALTER TABLE public.product_additionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view additionals" ON public.product_additionals
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can insert additionals" ON public.product_additionals
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can update additionals" ON public.product_additionals
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can delete additionals" ON public.product_additionals
  FOR DELETE USING (public.is_store_member(auth.uid(), store_id));
