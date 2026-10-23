-- 20260509_budgets_module.sql
-- Criação da coluna de configuração de orçamentos nas lojas
ALTER TABLE stores ADD COLUMN IF NOT EXISTS config_orcamento boolean DEFAULT false;

-- Tabela principal de orçamentos
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  device_model text,
  device_serial text,
  defect text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Itens do orçamento (peças e serviços)
CREATE TABLE IF NOT EXISTS budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  subtotal numeric(10,2) NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_budgets_store_id ON budgets(store_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget_id ON budget_items(budget_id);

-- Row Level Security
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

-- Políticas públicas de leitura e inserção (para cliente acompanhar via id)
CREATE POLICY "budgets_public_read" ON budgets FOR SELECT USING (true);
CREATE POLICY "budgets_public_insert" ON budgets FOR INSERT WITH CHECK (true);
CREATE POLICY "budget_items_public_read" ON budget_items FOR SELECT USING (true);
CREATE POLICY "budget_items_public_insert" ON budget_items FOR INSERT WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_budgets_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_budgets_updated_at();
