-- ─── Sistema de Pedidos Online ────────────────────────────────────────────────

-- Pedidos feitos pelo cardápio público
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_name text not null,
  customer_phone text,
  status text not null default 'pending',
  -- pending | accepted | preparing | ready | delivered | cancelled
  total numeric(10,2) not null default 0,
  notes text,
  payment_method text default 'presential',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Itens de cada pedido
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity int not null default 1,
  additionals jsonb default '[]',
  subtotal numeric(10,2) not null
);

-- Chat entre cliente e loja
create table if not exists order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  sender text not null, -- 'customer' | 'store'
  sender_name text,
  message text not null,
  created_at timestamptz default now()
);

-- Índices para performance
create index if not exists idx_orders_store_id on orders(store_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_order_items_order_id on order_items(order_id);
create index if not exists idx_order_messages_order_id on order_messages(order_id);

-- RLS
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_messages enable row level security;

-- Políticas: leitura pública (para cliente acompanhar pelo id)
create policy "orders_public_read" on orders for select using (true);
create policy "orders_public_insert" on orders for insert with check (true);
create policy "orders_store_update" on orders for update using (true);

create policy "order_items_public_read" on order_items for select using (true);
create policy "order_items_public_insert" on order_items for insert with check (true);

create policy "order_messages_public_read" on order_messages for select using (true);
create policy "order_messages_public_insert" on order_messages for insert with check (true);

-- Trigger: atualiza updated_at automaticamente
create or replace function update_orders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger orders_updated_at
  before update on orders
  for each row execute function update_orders_updated_at();
