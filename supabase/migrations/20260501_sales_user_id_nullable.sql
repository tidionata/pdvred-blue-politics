-- Torna user_id nullable em sales para não bloquear vendas quando o perfil
-- ainda não carregou ou há falha temporária de conexão.
-- A rastreabilidade da venda é garantida pelo store_id.

ALTER TABLE public.sales ALTER COLUMN user_id DROP NOT NULL;
