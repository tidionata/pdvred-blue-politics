-- ============================================================
-- MULTI-CARDÁPIO E CUSTOMIZAÇÃO — PDVTOTAL
-- ============================================================

-- 1. ADICIONA TIPO DE CARDÁPIO NO PRODUTO
-- morning = Churrascaria (Dia)
-- night = Macarrão (Noite)
-- both = Ambos
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_menu_type') THEN
    CREATE TYPE public.product_menu_type AS ENUM ('morning', 'night', 'both');
  END IF;
END $$;

ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS menu_type public.product_menu_type DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.products.menu_type IS 'Define se o produto aparece no cardápio de Dia, Noite ou Ambos.';
COMMENT ON COLUMN public.products.image_url IS 'URL da foto do produto hospedada no Supabase Storage.';

-- 2. ADICIONA CONFIGURAÇÃO DE CARDÁPIO ATIVO NA LOJA
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS active_menu_type text DEFAULT 'both';

COMMENT ON COLUMN public.stores.active_menu_type IS 'Define qual cardápio está visível no link público: morning, night ou both.';

-- 3. STORAGE BUCKET PARA FOTOS DE PRODUTOS
-- Nota: Isso precisa ser criado via Dashboard ou SQL específico se o Supabase permitir
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
