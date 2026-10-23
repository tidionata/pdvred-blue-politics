-- Adicionar campos do Asaas na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_invoice_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_invoice_status text;

-- Adicionar campo asaas_customer_id na tabela profiles ou customers, se existir
-- O sistema atual não parece ter uma tabela customers separada de forma clara,
-- então a função Edge vai apenas criar um cliente avulso no Asaas com o nome do cliente no pedido.
