-- ============================================================
-- 1. INFRAESTRUTURA DE AUDITORIA (Audit Trail)
-- ============================================================

-- Tabela global de logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   table_name  text NOT NULL,
   record_id   uuid NOT NULL,
   action      text NOT NULL, -- INSERT, UPDATE, DELETE
   old_data    jsonb,
   new_data    jsonb,
   user_id     uuid REFERENCES auth.users(id),
   ip_address  text,
   created_at  timestamptz DEFAULT now()
);

-- Habilita RLS (Apenas owners visualizam logs da sua loja via query complexa, ou admin via dashboard)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all logs" ON public.audit_logs FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');

-- Função que processa os logs
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
BEGIN
   IF (TG_OP = 'DELETE') THEN
     INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
     VALUES (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), auth.uid());
     RETURN OLD;
   ELSIF (TG_OP = 'UPDATE') THEN
     INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
     VALUES (TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
     RETURN NEW;
   ELSIF (TG_OP = 'INSERT') THEN
     INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
     VALUES (TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(NEW), auth.uid());
     RETURN NEW;
   END IF;
   RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativar auditoria em tabelas sensíveis
CREATE TRIGGER tr_audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
CREATE TRIGGER tr_audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
CREATE TRIGGER tr_audit_secrets AFTER INSERT OR UPDATE OR DELETE ON public.store_secrets FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ============================================================
-- 2. HISTÓRICO FISCAL (Guarda de 5 anos)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nfe_logs (
   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   sale_id         uuid REFERENCES public.sales(id) ON DELETE CASCADE,
   store_id        uuid REFERENCES public.stores(id) ON DELETE CASCADE,
   status          text NOT NULL, -- autorizada, erro, cancelada
   chave_acesso    text UNIQUE,
   xml_url         text,
   error_message   text,
   focus_nfe_id    text,
   created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.nfe_logs ENABLE ROW LEVEL SECURITY;

-- Permite que membros da loja vejam seus próprios logs fiscais
CREATE POLICY "Members can view store nfe logs" ON public.nfe_logs
   FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
