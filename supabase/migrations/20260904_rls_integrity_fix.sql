-- ============================================================
-- RLS INTEGRITY & SECURITY FIX — PDV TOTAL
-- Data: 2026-09-04
-- Corrige incompatibilidades e inconsistências nas policies:
-- 1. `customers`: usa `is_store_member(auth.uid(), store_id)` (na migração antiga estava usando store.user_id que não existe).
-- 2. `budgets` / `budget_items`: restringe update/delete e isola por loja.
-- ============================================================

-- ─── 1. CORREÇÃO DE RLS NA TABELA `customers` ───────────────
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own store customers"   ON public.customers;
DROP POLICY IF EXISTS "Users can insert customers to their own store" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own store customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own store customers" ON public.customers;
DROP POLICY IF EXISTS "customers_store_member_select"             ON public.customers;
DROP POLICY IF EXISTS "customers_store_member_insert"             ON public.customers;
DROP POLICY IF EXISTS "customers_store_member_update"             ON public.customers;
DROP POLICY IF EXISTS "customers_store_member_delete"             ON public.customers;

-- Policies corrigidas usando a função canônica do projeto (is_store_member)
CREATE POLICY "customers_store_member_select" ON public.customers
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "customers_store_member_insert" ON public.customers
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "customers_store_member_update" ON public.customers
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "customers_store_member_delete" ON public.customers
  FOR DELETE USING (public.is_store_member(auth.uid(), store_id));


-- ─── 2. CORREÇÃO DE RLS NAS TABELAS `budgets` e `budget_items` ──
ALTER TABLE IF EXISTS public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_public_read"   ON public.budgets;
DROP POLICY IF EXISTS "budgets_public_insert" ON public.budgets;
DROP POLICY IF EXISTS "budgets_store_member_select" ON public.budgets;
DROP POLICY IF EXISTS "budgets_store_member_insert" ON public.budgets;
DROP POLICY IF EXISTS "budgets_store_member_update" ON public.budgets;
DROP POLICY IF EXISTS "budgets_store_member_delete" ON public.budgets;

DROP POLICY IF EXISTS "budget_items_public_read"   ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_public_insert" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_store_member_select" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_store_member_insert" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_store_member_update" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_store_member_delete" ON public.budget_items;

-- Membros da loja gerenciam orçamentos da sua loja
CREATE POLICY "budgets_store_member_select" ON public.budgets
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "budgets_store_member_insert" ON public.budgets
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "budgets_store_member_update" ON public.budgets
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "budgets_store_member_delete" ON public.budgets
  FOR DELETE USING (public.is_store_member(auth.uid(), store_id));

-- Itens do orçamento
CREATE POLICY "budget_items_store_member_select" ON public.budget_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND public.is_store_member(auth.uid(), b.store_id)
    )
  );

CREATE POLICY "budget_items_store_member_insert" ON public.budget_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND public.is_store_member(auth.uid(), b.store_id)
    )
  );

CREATE POLICY "budget_items_store_member_update" ON public.budget_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND public.is_store_member(auth.uid(), b.store_id)
    )
  );

CREATE POLICY "budget_items_store_member_delete" ON public.budget_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND public.is_store_member(auth.uid(), b.store_id)
    )
  );
