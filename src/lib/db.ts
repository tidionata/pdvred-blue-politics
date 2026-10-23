import Dexie, { type Table } from 'dexie';

// Interfaces for our models (similar to Supabase definitions)

export interface LocalProduct {
  id: string;
  store_id: string;
  name: string;
  price: number;
  barcode?: string;
  category_id?: string;
  stock_quantity?: number;
  image_url?: string;
  created_at?: string;
  // Extra fields to track offline changes
  _sync_status?: 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
}

export interface LocalCategory {
  id: string;
  store_id: string;
  name: string;
  _sync_status?: 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
}

export interface LocalCustomer {
  id: string;
  store_id: string;
  name: string;
  phone?: string;
  cpf?: string;
  _sync_status?: 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
}

export interface LocalOrder {
  id: string;
  store_id: string;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'completed';
  origin: string; // 'pdv', 'ifood', etc
  payment_method?: string;
  discount?: number;
  discount_type?: string;
  customer_name?: string;
  notes?: string; // used for holding pending carts in pdv
  table_name?: string;
  created_at: string;
  asaas_invoice_id?: string;
  asaas_invoice_status?: string;
  _sync_status?: 'synced' | 'pending_insert' | 'pending_update';
}

export interface LocalOrderItem {
  id: string;
  sale_id: string;
  product_id?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  _sync_status?: 'synced' | 'pending_insert';
}

export interface SyncQueueTask {
  id?: number;
  action: 'create_nfse' | 'update_ifood'; // any async task we need to process when online
  payload: any;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retry_count: number;
  error?: string;
  created_at: string;
}

export class PdvDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  categories!: Table<LocalCategory, string>;
  customers!: Table<LocalCustomer, string>;
  orders!: Table<LocalOrder, string>;
  order_items!: Table<LocalOrderItem, string>;
  sync_queue!: Table<SyncQueueTask, number>;
  caixa_sessions!: Table<any, string>;
  promissorias!: Table<any, string>;

  constructor() {
    super('PdvDatabase');
    this.version(1).stores({
      products: 'id, store_id, category_id, _sync_status',
      categories: 'id, store_id, _sync_status',
      customers: 'id, store_id, _sync_status',
      orders: 'id, store_id, status, origin, _sync_status',
      order_items: 'id, sale_id, product_id, _sync_status',
      sync_queue: '++id, action, status, created_at'
    });
    this.version(2).stores({
      products: 'id, store_id, category_id, _sync_status',
      categories: 'id, store_id, _sync_status',
      customers: 'id, store_id, _sync_status',
      orders: 'id, store_id, status, origin, _sync_status',
      order_items: 'id, sale_id, product_id, _sync_status',
      sync_queue: '++id, action, status, created_at',
      caixa_sessions: 'id, storeId, status, openedAt, closedAt',
      promissorias: 'id, storeId, customerId, status, createdAt'
    });
  }
}

export const db = new PdvDatabase();
