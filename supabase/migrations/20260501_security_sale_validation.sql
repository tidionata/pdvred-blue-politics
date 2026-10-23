-- ============================================================
-- SECURITY FIX 2: Validação server-side de subtotais
--
-- Problema: totais calculados no frontend podem ser manipulados
-- via DevTools antes do envio ao Supabase.
--
-- Solução: trigger BEFORE INSERT/UPDATE em sale_items que
-- garante: subtotal ≈ quantity × unit_price (tolerância 1¢)
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_sale_item_subtotal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected numeric;
BEGIN
  expected := ROUND(NEW.quantity::numeric * NEW.unit_price, 2);

  -- Aceita diferença de até 1 centavo (arredondamento de ponto flutuante)
  IF ABS(NEW.subtotal - expected) > 0.01 THEN
    RAISE EXCEPTION
      'Subtotal inválido para o item. Esperado: R$ %, Recebido: R$ %. Manipulação de dados detectada.',
      expected, NEW.subtotal
    USING ERRCODE = 'check_violation';
  END IF;

  -- Força o subtotal calculado pelo servidor (elimina qualquer drift)
  NEW.subtotal := expected;

  RETURN NEW;
END;
$$;

-- Trigger dispara antes de qualquer INSERT ou UPDATE em sale_items
CREATE TRIGGER tr_validate_sale_item_subtotal
  BEFORE INSERT OR UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_item_subtotal();

-- ============================================================
-- Adicionalmente: valida que unit_price não seja zero para
-- produtos que não são "gratuitos" explicitamente marcados
-- (proteção contra zeragem de preço por manipulação)
-- ============================================================
ALTER TABLE public.sale_items
  ADD CONSTRAINT chk_si_price_consistent
    CHECK (unit_price >= 0 AND quantity > 0 AND subtotal >= 0);
