-- Adicionando colunas de configurações de mesa na tabela stores
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS counter_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_counters BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS table_fee NUMERIC(10,2) DEFAULT 0;

-- Adicionando identificador de mesa nas vendas (sales) para tracking
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Opcional: index para buscar rapidamente vendas por mesa
CREATE INDEX IF NOT EXISTS idx_sales_table_name ON public.sales(table_name);
