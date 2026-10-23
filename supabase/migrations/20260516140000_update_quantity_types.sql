-- Atualiza o tipo das colunas de quantidade e estoque para suportar valores fracionados (ex: 0.16 kg)
ALTER TABLE public.products
  ALTER COLUMN stock_total TYPE numeric(10,3),
  ALTER COLUMN stock_display TYPE numeric(10,3),
  ALTER COLUMN min_display_stock TYPE numeric(10,3);

ALTER TABLE public.sale_items
  ALTER COLUMN quantity TYPE numeric(10,3);

ALTER TABLE public.stock_movements
  ALTER COLUMN quantity TYPE numeric(10,3);

ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(10,3);

-- Se a tabela de orçamentos já existir, também atualiza ela (usando DO block para evitar erro se não existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_items') THEN
    ALTER TABLE public.budget_items ALTER COLUMN quantity TYPE numeric(10,3);
  END IF;
END
$$;
