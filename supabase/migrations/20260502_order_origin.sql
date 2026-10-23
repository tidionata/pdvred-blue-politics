-- Adiciona coluna de origem para distinguir pedidos do PDV Público de outros (ex: Cardápio Online)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS origin text DEFAULT 'menu';

COMMENT ON COLUMN public.orders.origin IS 'Origem do pedido: menu (padrão), public_pdv, etc.';
