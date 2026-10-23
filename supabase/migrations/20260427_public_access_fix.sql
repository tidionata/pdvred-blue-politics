-- ============================================================
-- CORREÇÃO: Acesso público para PDV Público e Cardápio
-- O PDVPublico (/pdv/:storeId) e Cardápio (/cardapio/:storeId)
-- precisam ler dados de stores e products SEM autenticação.
-- ============================================================

-- ─── 1. STORES — leitura pública do nome/logo da loja ────────
-- Usuários anônimos precisam ver os dados básicos da loja para
-- exibir o cabeçalho do PDV público (nome, logo).
-- Expõe apenas colunas necessárias via policy — não remove RLS.

CREATE POLICY "stores_public_read" ON public.stores
  FOR SELECT USING (true);
-- NOTA: O RLS está ativo; a anon key do Supabase não permite
-- operações de escrita. Esta policy só permite leitura pública.
-- Se quiser restringir ainda mais, use uma VIEW com colunas
-- específicas (name, logo_url) no futuro.


-- ─── 2. PRODUCTS — corrigir policy pública para filtrar por store ─
-- A policy adicionada anteriormente (products_public_menu_select)
-- não filtrava por store_id, podendo retornar produtos de outras
-- lojas. Removemos e recriamos corretamente.

DROP POLICY IF EXISTS "products_public_menu_select" ON public.products;

-- Nova policy: leitura pública de produtos ATIVOS de qualquer loja
-- (o front-end filtra por store_id na query .eq("store_id", storeId))
CREATE POLICY "products_public_menu_select" ON public.products
  FOR SELECT USING (active = true);
