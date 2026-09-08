import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, ShoppingBag, Sparkles, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { getLoyaltyPromoConfig, getCustomerPurchasesCount } from "@/lib/loyalty";

interface ClienteHistoricoModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any | null;
  storeId: string | undefined;
}

export function ClienteHistoricoModal({ isOpen, onClose, customer, storeId }: ClienteHistoricoModalProps) {
  const navigate = useNavigate();
  const loyaltyConfig = getLoyaltyPromoConfig(storeId);
  const purchasesCount = customer ? getCustomerPurchasesCount(customer.id, customer.phone) : 0;
  const targetPurchases = loyaltyConfig.targetPurchases || 10;
  const hasReward = loyaltyConfig.enabled && purchasesCount >= targetPurchases;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["customer-orders", customer?.id, customer?.phone, customer?.name],
    queryFn: async () => {
      let onlineOrders: any[] = [];
      const cleanPhone = customer?.phone?.replace(/\D/g, "");

      try {
        let query = supabase
          .from("orders")
          .select(`
            *,
            order_items (
              id,
              quantity,
              unit_price,
              subtotal,
              product_name,
              additionals
            )
          `)
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (customer?.id && customer.id !== "manual") {
          query = query.or(`customer_id.eq.${customer.id},customer_name.ilike.%${customer.name}%`);
        } else if (cleanPhone) {
          query = query.or(`customer_phone.ilike.%${cleanPhone}%,customer_name.ilike.%${customer.name}%`);
        } else if (customer?.name) {
          query = query.ilike("customer_name", `%${customer.name}%`);
        }

        const { data, error } = await query;
        if (!error && data) {
          onlineOrders = data;
        }
      } catch (e) {
        console.warn("Erro ao buscar histórico online:", e);
      }

      // Busca também pedidos salvos localmente
      const localKey = `orders_offline_${storeId}`;
      const localOrders: any[] = JSON.parse(localStorage.getItem(localKey) || "[]");
      const matchedLocal = localOrders.filter((o: any) => {
        const phoneMatch = cleanPhone && o.customer_phone?.replace(/\D/g, "")?.includes(cleanPhone);
        const nameMatch = customer?.name && o.customer_name?.toLowerCase()?.includes(customer.name.toLowerCase());
        return phoneMatch || nameMatch;
      }).map((o: any) => ({
        ...o,
        order_items: (o.items || []).map((it: any) => ({
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
          subtotal: it.subtotal || (it.unit_price * it.quantity),
          product_name: it.product_name,
          additionals: it.additionals || []
        }))
      }));

      const onlineIds = new Set(onlineOrders.map(o => o.id));
      const onlyLocal = matchedLocal.filter(o => !onlineIds.has(o.id));

      const all = [...onlineOrders, ...onlyLocal];
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return all;
    },
    enabled: isOpen && !!customer && !!storeId,
  });

  const handleRepeatOrder = (order: any) => {
    try {
      const itemsToDuplicate = (order.order_items || []).map((item: any) => ({
        name: item.product_name || item.product?.name || "Produto",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        price: item.unit_price || 0,
      }));
      
      localStorage.setItem("pdv_duplicate_cart", JSON.stringify({
        items: itemsToDuplicate,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerId: customer.id
      }));

      toast.success("Itens carregados no PDV!");
      navigate("/dashboard/pdv");
    } catch (e) {
      toast.error("Erro ao duplicar pedido.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico: {customer?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Card de Fidelidade */}
          {loyaltyConfig.enabled && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span className="font-bold text-sm text-amber-950">{loyaltyConfig.name || "Programa de Fidelidade"}</span>
                </div>
                <p className="text-xs text-amber-900/80">
                  Prêmio: <strong>{loyaltyConfig.rewardDescription || "Desconto / Brinde"}</strong> a cada {targetPurchases} compras.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-white border border-amber-300 text-amber-900 px-2.5 py-1 rounded-lg shadow-sm">
                  {purchasesCount} / {targetPurchases} compras
                </span>
                {hasReward && (
                  <span className="text-xs bg-emerald-600 text-white font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm animate-pulse">
                    <Award className="h-3.5 w-3.5" /> Prêmio Disponível!
                  </span>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum pedido encontrado para este cliente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="border rounded-lg p-4 bg-gray-50/50 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">
                        Pedido #{order.id.slice(0, 6).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {order.status}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border rounded p-2 text-xs">
                    <ul className="space-y-1">
                      {order.order_items?.map((item: any, i: number) => (
                        <li key={i} className="flex justify-between">
                          <span>{item.quantity}x {item.product_name || item.product?.name || "Produto"}</span>
                          <span className="text-muted-foreground">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal || item.total_price || (item.unit_price * item.quantity) || 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      size="sm" 
                      onClick={() => handleRepeatOrder(order)}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Repetir Pedido no PDV
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
