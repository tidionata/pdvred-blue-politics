ALTER TABLE public.store_secrets
ADD COLUMN IF NOT EXISTS asaas_config jsonb NOT NULL DEFAULT '{}'::jsonb;
