
-- =============================================
-- 1. ENUMS
-- =============================================

CREATE TYPE public.stock_movement_type AS ENUM ('in', 'out');
CREATE TYPE public.sale_status AS ENUM ('completed', 'cancelled', 'pending');
CREATE TYPE public.user_role AS ENUM ('owner', 'manager', 'cashier');
CREATE TYPE public.subscription_plan AS ENUM ('starter', 'pro', 'business');
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');

-- =============================================
-- 2. BASE TABLES
-- =============================================

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url text,
  pix_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'owner',
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  barcode text,
  category text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  stock_total integer NOT NULL DEFAULT 0,
  stock_display integer NOT NULL DEFAULT 0,
  min_display_stock integer NOT NULL DEFAULT 0,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  total numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  discount_type text DEFAULT 'fixed',
  payment_method text NOT NULL DEFAULT 'cash',
  status public.sale_status NOT NULL DEFAULT 'completed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  quantity integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan public.subscription_plan NOT NULL DEFAULT 'starter',
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  current_period_end timestamptz,
  trial_ends_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX idx_profiles_store ON public.profiles(store_id);
CREATE INDEX idx_profiles_auth ON public.profiles(auth_user_id);
CREATE INDEX idx_products_store ON public.products(store_id);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_sales_store ON public.sales(store_id);
CREATE INDEX idx_sales_created ON public.sales(created_at);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_stock_movements_store ON public.stock_movements(store_id);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_subscriptions_store ON public.subscriptions(store_id);

-- =============================================
-- 4. HELPER FUNCTIONS (security definer)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_user_store_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE auth_user_id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = p_user_id AND store_id = p_store_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_id = p_user_id
  );
$$;

-- =============================================
-- 5. ENABLE RLS
-- =============================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. RLS POLICIES
-- =============================================

-- STORES
CREATE POLICY "Members can view own store" ON public.stores
  FOR SELECT USING (public.is_store_member(auth.uid(), id));

CREATE POLICY "Owner can insert store" ON public.stores
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update store" ON public.stores
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete store" ON public.stores
  FOR DELETE USING (owner_id = auth.uid());

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Users can view store profiles" ON public.profiles
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- PRODUCTS
CREATE POLICY "Store members can view products" ON public.products
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can insert products" ON public.products
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can update products" ON public.products
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can delete products" ON public.products
  FOR DELETE USING (public.is_store_member(auth.uid(), store_id));

-- SALES
CREATE POLICY "Store members can view sales" ON public.sales
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can insert sales" ON public.sales
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can update sales" ON public.sales
  FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));

-- SALE ITEMS
CREATE POLICY "Access sale items via sale" ON public.sale_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_id AND public.is_store_member(auth.uid(), sales.store_id))
  );

CREATE POLICY "Insert sale items via sale" ON public.sale_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_id AND public.is_store_member(auth.uid(), sales.store_id))
  );

-- STOCK MOVEMENTS
CREATE POLICY "Store members can view movements" ON public.stock_movements
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Store members can insert movements" ON public.stock_movements
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

-- SUBSCRIPTIONS
CREATE POLICY "Owner can view subscription" ON public.subscriptions
  FOR SELECT USING (public.is_store_owner(auth.uid(), store_id));

CREATE POLICY "Owner can update subscription" ON public.subscriptions
  FOR UPDATE USING (public.is_store_owner(auth.uid(), store_id));

-- =============================================
-- 7. TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER tr_stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 8. AUTO-UPDATE STOCK ON SALE
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_sale_item_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET stock_total = stock_total - NEW.quantity,
      stock_display = stock_display - NEW.quantity
  WHERE id = NEW.product_id;

  INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reason)
  SELECT s.store_id, NEW.product_id, 'out', NEW.quantity, 'Venda #' || s.id::text
  FROM public.sales s WHERE s.id = NEW.sale_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tr_sale_item_stock
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_item_stock();

-- =============================================
-- 9. AUTO-CREATE PROFILE + STORE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_store_id uuid;
BEGIN
  INSERT INTO public.stores (name, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'store_name', 'Minha Loja'), NEW.id)
  RETURNING id INTO new_store_id;

  INSERT INTO public.profiles (auth_user_id, store_id, role, full_name)
  VALUES (NEW.id, new_store_id, 'owner', COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.subscriptions (store_id, plan, status, trial_ends_at)
  VALUES (new_store_id, 'starter', 'trialing', now() + interval '7 days');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 10. ENABLE REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
