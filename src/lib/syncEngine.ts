import { supabase } from '@/integrations/supabase/client';
import { db } from './db';

export class SyncEngine {
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private storeId: string | null = null;

  constructor() {
    window.addEventListener('online', () => this.sync());
  }

  setStoreId(id: string) {
    this.storeId = id;
  }

  start(intervalMs = 30000) {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
    // Initial sync
    setTimeout(() => this.sync(), 2000);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async sync() {
    if (this.isSyncing || !navigator.onLine || !this.storeId) return;
    
    try {
      this.isSyncing = true;
      console.log('🔄 Iniciando sincronização...');

      // 1. DOWN-SYNC: Puxar do Supabase para o Dexie
      await this.downSyncCategories();
      await this.downSyncProducts();
      await this.downSyncCustomers();

      // 2. UP-SYNC: Enviar alterações locais (vendas) para o Supabase
      await this.upSyncOrders();

      // 3. PROCESSAR FILA: Emitir notas fiscais pendentes, etc
      await this.processSyncQueue();

      console.log('✅ Sincronização concluída!');
    } catch (err) {
      console.error('❌ Erro na sincronização:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  // --- DOWN-SYNC ---

  private async downSyncCategories() {
    const { data, error } = await supabase.from('categories').select('*').eq('store_id', this.storeId!);
    if (error) throw error;
    if (data) {
      const localData = data.map(c => ({ ...c, _sync_status: 'synced' as const }));
      await db.categories.bulkPut(localData);
    }
  }

  private async downSyncProducts() {
    const { data, error } = await supabase.from('products').select('*').eq('store_id', this.storeId!);
    if (error) throw error;
    if (data) {
      const localData = data.map(p => ({ ...p, _sync_status: 'synced' as const }));
      await db.products.bulkPut(localData);
    }
  }

  private async downSyncCustomers() {
    const { data, error } = await supabase.from('customers').select('*').eq('store_id', this.storeId!);
    if (error) throw error;
    if (data) {
      const localData = data.map(c => ({ ...c, _sync_status: 'synced' as const }));
      await db.customers.bulkPut(localData);
    }
  }

  // --- UP-SYNC ---

  private async upSyncOrders() {
    // 1. Buscar todos os pedidos (sales) pendentes de inserção
    const pendingOrders = await db.orders.where('_sync_status').equals('pending_insert').toArray();
    
    for (const order of pendingOrders) {
      try {
        const { _sync_status, ...orderData } = order;
        
        // Inserir no Supabase
        const { error: insertError } = await supabase.from('sales').insert({
          id: orderData.id,
          store_id: orderData.store_id,
          total: orderData.total,
          status: orderData.status,
          origin: orderData.origin,
          payment_method: orderData.payment_method,
          discount: orderData.discount,
          discount_type: orderData.discount_type,
          customer_name: orderData.customer_name,
          notes: orderData.notes,
          table_name: orderData.table_name,
          created_at: orderData.created_at,
          asaas_invoice_id: orderData.asaas_invoice_id,
          asaas_invoice_status: orderData.asaas_invoice_status
        });

        if (insertError) throw insertError;

        // Inserir itens do pedido
        const pendingItems = await db.order_items.where({ sale_id: order.id }).toArray();
        if (pendingItems.length > 0) {
          const itemsData = pendingItems.map(({ _sync_status, ...item }) => ({
            id: item.id,
            sale_id: item.sale_id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal
          }));
          const { error: itemsError } = await supabase.from('sale_items').insert(itemsData);
          if (itemsError) throw itemsError;
          
          // Atualiza status local dos itens
          await db.order_items.where('sale_id').equals(order.id).modify({ _sync_status: 'synced' });
        }

        // Atualiza status local do pedido
        await db.orders.update(order.id, { _sync_status: 'synced' });
        
      } catch (err) {
        console.error(`Erro ao sincronizar pedido ${order.id}:`, err);
      }
    }
    
    // TODO: pending_update (se precisar sincronizar alterações de status como pendente para entregue)
  }

  // --- PROCESS QUEUE (NFC-e) ---

  private async processSyncQueue() {
    const pendingTasks = await db.sync_queue.where('status').equals('pending').toArray();
    
    for (const task of pendingTasks) {
      try {
        await db.sync_queue.update(task.id!, { status: 'processing' });
        
        if (task.action === 'create_nfse') {
          const { data, error } = await supabase.functions.invoke('plugnotas-api', {
            body: { action: 'create_nfse', payload: task.payload }
          });
          
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          const protocolo = data?.protocolo || data?.id;
          if (protocolo) {
            // Atualiza local
            await db.orders.update(task.payload.idExterno.replace('pdv_', ''), {
              asaas_invoice_id: protocolo,
              asaas_invoice_status: 'emitida'
            });
            // Atualiza remoto se já existir
            await supabase.from('sales').update({
              asaas_invoice_id: protocolo,
              asaas_invoice_status: 'emitida'
            }).eq('id', task.payload.idExterno.replace('pdv_', ''));
          }
        }
        
        await db.sync_queue.update(task.id!, { status: 'completed' });
      } catch (err: any) {
        console.error(`Erro na task ${task.id}:`, err);
        await db.sync_queue.update(task.id!, { 
          status: 'failed',
          error: err.message,
          retry_count: task.retry_count + 1
        });
        
        // Volta para pending se tentar novamente depois
        if (task.retry_count < 3) {
          setTimeout(() => {
            db.sync_queue.update(task.id!, { status: 'pending' });
          }, 60000); // Tenta novamente em 1 minuto
        }
      }
    }
  }
}

export const syncEngine = new SyncEngine();
