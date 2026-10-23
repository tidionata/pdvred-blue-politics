import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, ChefHat, PackageCheck, Truck,
  XCircle, Send, MessageSquare, ShoppingBag, User,
} from "lucide-react";
import { playNotificationSound } from "@/lib/utils";

interface Order {
  id: string;
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  status: string;
  payment_method: string;
  created_at: string;
  notes?: string;
  delivery_type?: string;
  delivery_address?: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  additionals: { name: string; price: number }[];
}

interface OrderMessage {
  id: string;
  sender: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_STEPS = [
  { key: "pending", label: "Recebido", icon: Clock, color: "text-gray-400" },
  { key: "accepted", label: "Confirmado", icon: CheckCircle2, color: "text-blue-500" },
  { key: "preparing", label: "Preparando", icon: ChefHat, color: "text-amber-500" },
  { key: "ready", label: "Pronto!", icon: PackageCheck, color: "text-emerald-500" },
  { key: "delivered", label: "Entregue", icon: Truck, color: "text-emerald-700" },
];

const STATUS_MESSAGES: Record<string, { title: string; subtitle: string; color: string; bg: string }> = {
  pending:   { title: "Aguardando confirmação da loja ⏳", subtitle: "Seu pedido foi recebido. A loja irá confirmar em breve.", color: "text-gray-600", bg: "bg-gray-50" },
  accepted:  { title: "Pedido confirmado! ✅", subtitle: "A loja aceitou seu pedido e logo começará a preparar.", color: "text-blue-700", bg: "bg-blue-50" },
  preparing: { title: "Seu pedido está sendo preparado 🔥", subtitle: "Aguarde, estamos preparando tudo com carinho!", color: "text-amber-700", bg: "bg-amber-50" },
  ready:     { title: "Pronto para retirar! 🎉", subtitle: "Seu pedido está pronto! Pode vir buscar.", color: "text-emerald-700", bg: "bg-emerald-50" },
  delivered: { title: "Pedido entregue! 😊", subtitle: "Obrigado pela preferência! Volte sempre.", color: "text-emerald-800", bg: "bg-emerald-50" },
  cancelled: { title: "Pedido cancelado ❌", subtitle: "Seu pedido foi cancelado. Entre em contato com a loja.", color: "text-red-700", bg: "bg-red-50" },
};

function getStepIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

export default function PedidoStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll ao fundo do chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); });

  // Carregar pedido
  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["order", orderId],
    enabled: !!orderId,
    refetchInterval: 5000, // polling a cada 5s como fallback
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("orders").select("*").eq("id", orderId!).single();
        if (error) throw error;
        return data as Order;
      } catch {
        // fallback offline
        const storeKeys = Object.keys(localStorage).filter(k => k.startsWith("orders_offline_"));
        for (const key of storeKeys) {
          const orders = JSON.parse(localStorage.getItem(key) || "[]");
          const found = orders.find((o: any) => o.id === orderId);
          if (found) return found as Order;
        }
        throw new Error("Pedido não encontrado");
      }
    },
  });

  // Carregar itens
  const { data: items = [] } = useQuery<OrderItem[]>({
    queryKey: ["order-items", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_items").select("*").eq("order_id", orderId!).order("id");
        if (error) throw error;
        return data as OrderItem[];
      } catch {
        // fallback: itens do pedido local
        const storeKeys = Object.keys(localStorage).filter(k => k.startsWith("orders_offline_"));
        for (const key of storeKeys) {
          const orders = JSON.parse(localStorage.getItem(key) || "[]");
          const found = orders.find((o: any) => o.id === orderId);
          if (found?.items) return found.items;
        }
        return [];
      }
    },
  });

  // Carregar mensagens
  const { data: messages = [] } = useQuery<OrderMessage[]>({
    queryKey: ["order-messages", orderId],
    enabled: !!orderId,
    refetchInterval: 3000,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_messages").select("*").eq("order_id", orderId!).order("created_at");
        if (error) throw error;
        return data as OrderMessage[];
      } catch {
        return JSON.parse(localStorage.getItem(`order_messages_${orderId}`) || "[]");
      }
    },
  });

  // Realtime — status do pedido
  useEffect(() => {
    if (!orderId) return;
    try {
      const channel = supabase
        .channel(`order-channel-${orderId}`)
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        })
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}`,
        }, (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["order-messages", orderId] });
          if (payload?.new?.sender === "store") {
            playNotificationSound();
          }
        })
        .on("broadcast", { event: "new_message" }, (payload: any) => {
          if (payload?.payload?.order_id === orderId) {
            queryClient.invalidateQueries({ queryKey: ["order-messages", orderId] });
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    } catch { /* supabase offline */ }
  }, [orderId, queryClient]);

  // Enviar mensagem
  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const newMsg: OrderMessage = {
        id: `msg-${Date.now()}`,
        sender: "customer",
        sender_name: order?.customer_name ?? "Cliente",
        message: msg,
        created_at: new Date().toISOString(),
      };
      
      let sentToDb = false;
      try {
        const { error } = await (supabase as any).from("order_messages").insert({
          order_id: orderId,
          sender: "customer",
          sender_name: order?.customer_name ?? "Cliente",
          message: msg,
        });
        if (!error) {
          sentToDb = true;
          // Broadcast para atualizar instantaneamente qualquer ouvinte conectado
          supabase.channel(`order-channel-${orderId}`).send({
            type: "broadcast",
            event: "new_message",
            payload: { order_id: orderId, message: msg, sender: "customer" },
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("Supabase offline para envio de mensagem:", e);
      }

      // Atualização imediata local do cache
      const existing = JSON.parse(localStorage.getItem(`order_messages_${orderId}`) || "[]");
      localStorage.setItem(`order_messages_${orderId}`, JSON.stringify([...existing, newMsg]));
      queryClient.setQueryData<OrderMessage[]>(["order-messages", orderId],
        old => [...(old ?? []), newMsg]);
    },
    onSuccess: () => {
      setMessage("");
    },
    onError: () => toast.error("Erro ao enviar mensagem"),
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Carregando seu pedido...
      </div>
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-2">
        <XCircle className="h-12 w-12 text-red-400 mx-auto" />
        <p className="font-semibold">Pedido não encontrado</p>
        <p className="text-sm text-muted-foreground">Verifique o link enviado.</p>
      </div>
    </div>
  );

  const statusInfo = STATUS_MESSAGES[order.status] ?? STATUS_MESSAGES["pending"];
  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b shadow-sm px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary" />
          <div>
            <p className="font-bold text-base">Acompanhar Pedido</p>
            <p className="text-xs text-muted-foreground font-mono">#{orderId?.slice(-8).toUpperCase()}</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Status Banner */}
        <div className={`rounded-2xl p-5 ${statusInfo.bg}`}>
          <p className={`font-bold text-lg ${statusInfo.color}`}>{statusInfo.title}</p>
          <p className={`text-sm mt-1 ${statusInfo.color} opacity-80`}>{statusInfo.subtitle}</p>
          {isCancelled && order.notes && order.notes.includes("[Motivo do cancelamento:") && (
            <div className="mt-3 p-3 bg-red-100/80 border border-red-200 rounded-xl">
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Motivo informado pela loja:</p>
              <p className="text-sm font-medium text-red-950 mt-0.5">
                {order.notes.split("[Motivo do cancelamento:")[1]?.replace("]", "").trim()}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Status do Pedido</h3>
            <div className="space-y-3">
              {STATUS_STEPS.map((step, i) => {
                const done = i <= currentStep;
                const active = i === currentStep;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all
                      ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                    </div>
                    {active && (
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                    {done && !active && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resumo do Pedido */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Seu Pedido</h3>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.quantity}x {item.product_name}</span>
                <span className="font-medium">{fmt(item.subtotal)}</span>
              </div>
            ))}
            {order.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 mt-2">
                📝 {order.notes}
              </p>
            )}
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>{fmt(order.total)}</span>
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              <span>{order.customer_name}</span>
              {order.customer_phone && <span>· {order.customer_phone}</span>}
            </div>
            <div className="flex items-center gap-2 font-medium">
              {order.delivery_type === "entrega" && <span className="text-orange-600">🛵 Entrega no endereço:</span>}
              {order.delivery_type === "retirada" && <span className="text-blue-600">🚶 Retirar na loja</span>}
              {order.delivery_type === "local" && <span className="text-purple-600">🍽️ Consumo no local</span>}
            </div>
            {order.delivery_type === "entrega" && order.delivery_address && (
              <div className="pl-5 text-gray-600">
                {order.delivery_address}
              </div>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Conversar com a loja</h3>
          </div>

          <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs text-center">Você pode enviar uma mensagem para a loja aqui.<br />Ex: "Pode tirar a cebola?"</p>
              </div>
            ) : messages.map(msg => (
              <div key={msg.id}
                className={`flex ${msg.sender === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm
                  ${msg.sender === "customer"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-white border shadow-sm rounded-bl-sm"}`}>
                  {msg.sender === "store" && (
                    <p className="text-xs font-semibold text-primary mb-0.5 opacity-70">Loja</p>
                  )}
                  <p>{msg.message}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === "customer" ? "text-white/70" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t flex gap-2">
            <Input
              placeholder="Escreva uma mensagem..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              className="flex-1"
            />
            <Button size="icon" onClick={handleSend} disabled={!message.trim() || sendMutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Atualizando automaticamente a cada 5 segundos
        </p>
      </div>
    </div>
  );
}
