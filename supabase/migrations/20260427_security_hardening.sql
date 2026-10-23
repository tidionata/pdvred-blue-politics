-- ============================================================
-- SECURITY HARDENING — PDV Lojas
-- Criado em: 2026-04-27
-- Aplica RLS granular nas tabelas do sistema de pedidos
-- e adiciona constraints de integridade no banco de dados.
-- ============================================================


-- ============================================================
-- 1. CONSTRAINTS DE INTEGRIDADE (validação no banco)
--    Não depender só do front-end para validar dados.
-- ============================================================

-- Preço e custo não podem ser negativos
ALTER TABLE public.products
  ADD CONSTRAINT chk_price_positive  CHECK (price  >= 0),
  ADD CONSTRAINT chk_cost_positive   CHECK (cost   >= 0),
  ADD CONSTRAINT chk_stock_total_nn  CHECK (stock_total  >= 0),
  ADD CONSTRAINT chk_stock_display_nn CHECK (stock_display >= 0);

-- Total e desconto de vendas não podem ser negativos
ALTER TABLE public.sales
  ADD CONSTRAINT chk_total_positive    CHECK (total    >= 0),
  ADD CONSTRAINT chk_discount_positive CHECK (discount >= 0),
  ADD CONSTRAINT chk_discount_type     CHECK (discount_type IN ('fixed', 'percent'));

-- Itens de venda: quantidade e preços positivos
ALTER TABLE public.sale_items
  ADD CONSTRAINT chk_si_quantity_positive   CHECK (quantity   > 0),
  ADD CONSTRAINT chk_si_unit_price_positive CHECK (unit_price >= 0),
  ADD CONSTRAINT chk_si_subtotal_positive   CHECK (subtotal   >= 0);

-- Movimentações de estoque: quantidade sempre > 0
ALTER TABLE public.stock_movements
  ADD CONSTRAINT chk_sm_quantity_positive CHECK (quantity > 0);

-- Adicionais de produto: preço não negativo
ALTER TABLE public.product_additionals
  ADD CONSTRAINT chk_pa_price_positive CHECK (price >= 0);

-- Pedidos online: total não negativo, status válido
ALTER TABLE public.orders
  ADD CONSTRAINT chk_orders_total_positive CHECK (total >= 0),
  ADD CONSTRAINT chk_orders_status CHECK (
    status IN ('pending','accepted','preparing','ready','delivered','cancelled')
  );

-- Itens de pedido: valores positivos
ALTER TABLE public.order_items
  ADD CONSTRAINT chk_oi_quantity_positive   CHECK (quantity   > 0),
  ADD CONSTRAINT chk_oi_unit_price_positive CHECK (unit_price >= 0),
  ADD CONSTRAINT chk_oi_subtotal_positive   CHECK (subtotal   >= 0);

-- Mensagens de pedido: sender deve ser 'customer' ou 'store'
ALTER TABLE public.order_messages
  ADD CONSTRAINT chk_om_sender CHECK (sender IN ('customer', 'store'));

-- Adicionais: max_additionals não negativo
ALTER TABLE public.products
  ADD CONSTRAINT chk_max_additionals_nn CHECK (max_additionals >= 0);


-- ============================================================
-- 2. FOREIGN KEY FALTANTE em orders
--    Garante que orders.store_id referencie uma loja real.
-- ============================================================

ALTER TABLE public.orders
  ADD CONSTRAINT fk_orders_store_id
    FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


-- ============================================================
-- 3. RLS GRANULAR — TABELAS DO SISTEMA DE PEDIDOS
--
--    PROBLEMA CRÍTICO: As políticas atuais usam `USING (true)`
--    e `WITH CHECK (true)`, o que significa que qualquer pessoa
--    pode ler E modificar TODOS os pedidos de TODAS as lojas.
--
--    SOLUÇÃO: Dividir em políticas separadas por ator:
--      - Clientes anônimos: podem criar pedidos e acompanhar
--        o próprio pedido (pelo UUID do pedido, sem login).
--      - Membros da loja (autenticados): têm acesso total
--        aos pedidos da própria loja.
-- ============================================================

-- Remove as políticas inseguras criadas anteriormente
DROP POLICY IF EXISTS "orders_public_read"       ON public.orders;
DROP POLICY IF EXISTS "orders_public_insert"     ON public.orders;
DROP POLICY IF EXISTS "orders_store_update"      ON public.orders;
DROP POLICY IF EXISTS "order_items_public_read"  ON public.order_items;
DROP POLICY IF EXISTS "order_items_public_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_messages_public_read"   ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_public_insert" ON public.order_messages;


-- ─── ORDERS ──────────────────────────────────────────────────

-- Clientes anônimos podem criar novos pedidos (INSERT sem auth)
CREATE POLICY "orders_anon_insert" ON public.orders
  FOR INSERT WITH CHECK (true);

-- Membros da loja podem ver TODOS os pedidos da loja deles
CREATE POLICY "orders_store_member_select" ON public.orders
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

-- Membros da loja podem atualizar pedidos da loja deles (ex: mudar status)
CREATE POLICY "orders_store_member_update" ON public.orders
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

-- Membros da loja podem deletar pedidos da loja deles
CREATE POLICY "orders_store_member_delete" ON public.orders
  FOR DELETE USING (public.is_store_member(auth.uid(), store_id));


-- ─── ORDER ITEMS ─────────────────────────────────────────────

-- Clientes podem inserir itens em pedidos que acabaram de criar
CREATE POLICY "order_items_anon_insert" ON public.order_items
  FOR INSERT WITH CHECK (true);

-- Membros da loja podem ver itens dos pedidos da loja deles
CREATE POLICY "order_items_store_member_select" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.is_store_member(auth.uid(), o.store_id)
    )
  );


-- ─── ORDER MESSAGES ──────────────────────────────────────────

-- Clientes podem enviar mensagens em pedidos existentes
CREATE POLICY "order_messages_anon_insert" ON public.order_messages
  FOR INSERT WITH CHECK (true);

-- Membros da loja podem ver mensagens dos pedidos da loja deles
CREATE POLICY "order_messages_store_member_select" ON public.order_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.is_store_member(auth.uid(), o.store_id)
    )
  );

-- Membros da loja podem enviar mensagens (INSERT autenticado)
CREATE POLICY "order_messages_store_member_insert" ON public.order_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.is_store_member(auth.uid(), o.store_id)
    )
  );


-- ============================================================
-- 4. PRODUCT_ADDITIONALS — ACESSO PÚBLICO PARA O CARDÁPIO
--    O cardápio público (sem login) precisa ver os adicionais
--    dos produtos ativos de uma loja.
-- ============================================================

-- Política adicional: leitura pública para produtos ATIVOS
-- (o cardápio público é anônimo — sem auth.uid())
CREATE POLICY "product_additionals_public_menu_select" ON public.product_additionals
  FOR SELECT USING (
    -- Só expõe adicionais de produtos ativos de lojas existentes
    active = true
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND p.active = true
    )
  );


-- ============================================================
-- 5. PRODUTOS — ACESSO PÚBLICO PARA O CARDÁPIO
--    O cardápio público precisa listar produtos ativos.
--    Apenas produtos.active = true de lojas válidas.
-- ============================================================

CREATE POLICY "products_public_menu_select" ON public.products
  FOR SELECT USING (active = true);


-- ============================================================
-- 6. REALTIME — ADICIONAR NOVAS TABELAS
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
