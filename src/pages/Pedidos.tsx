import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, ChefHat, PackageCheck, XCircle,
  MessageSquare, Send, User, Phone, ChevronDown, ChevronUp,
  ShoppingBag, Bell, RefreshCw, LayoutList, LayoutGrid, Maximize2,
  Printer, FileText, Volume2, VolumeX,
} from "lucide-react";
import { cn, playNotificationSound, getSoundConfig, saveSoundConfig } from "@/lib/utils";
import { isElectron, printToKitchen, buildKitchenReceiptHtml } from "@/lib/electronPrinting";

interface Order {
  id: string;
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  status: string;
  total: number;
  notes?: string;
  payment_method: string;
  created_at: string;
  items?: OrderItem[];
  origin?: string;
  external_id?: string;
  external_code?: string;
  delivery_type?: string;
  delivery_address?: string;
  asaas_invoice_id?: string;
  asaas_invoice_status?: string;
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
  order_id: string;
  sender: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; next?: string; nextLabel?: string; color: string }> = {
  pending:   { label: "Aguardando",  badge: "bg-gray-100 text-gray-700",    next: "accepted",  nextLabel: "✅ Aceitar",       color: "border-gray-200" },
  accepted:  { label: "Confirmado",  badge: "bg-blue-100 text-blue-700",    next: "preparing", nextLabel: "🔥 Preparando",    color: "border-blue-200" },
  preparing: { label: "Preparando",  badge: "bg-amber-100 text-amber-700",  next: "ready",     nextLabel: "🎉 Ficou Pronto",  color: "border-amber-200" },
  ready:     { label: "Pronto",      badge: "bg-emerald-100 text-emerald-700", next: "delivered", nextLabel: "📦 Entregue",  color: "border-emerald-200" },
  delivered: { label: "Entregue",    badge: "bg-emerald-200 text-emerald-800",                                               color: "border-emerald-300" },
  cancelled: { label: "Cancelado",   badge: "bg-red-100 text-red-700",                                                       color: "border-red-200" },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro", pix: "PIX", credit: "Crédito", debit: "Débito", presential: "Pagar na retirada",
};

const fmt = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

async function handlePrintReceipt(order: Order, items: OrderItem[], storeName: string) {
  // Se estiver no Electron e tiver impressora de cozinha configurada → imprime silenciosamente
  if (isElectron()) {
    const html = buildKitchenReceiptHtml(order, items, storeName);
    const ok = await printToKitchen(html);
    if (ok) {
      toast.success('🖨️ Comanda enviada para a impressora de cozinha!');
      return;
    }
    // Se não tiver impressora configurada, cai no fallback abaixo
    toast.info('Impressora de cozinha não configurada. Abrindo janela de impressão...');
  }

  // Fallback: abre janela do navegador (modo web)
  const w = window.open("", "_blank", "width=400,height=700");
  if (!w) return;
  
  const itemsHtml = items.map(item => `
    <div style="margin-bottom: 5px; border-bottom: 1px dashed #eee; padding-bottom: 3px;">
      <div style="display: flex; justify-between: space-between; font-weight: bold;">
        <span>${item.quantity}x ${item.product_name}</span>
        <span style="margin-left: auto;">${fmt(item.subtotal)}</span>
      </div>
      ${item.additionals?.length > 0 ? `
        <div style="font-size: 10px; color: #666; font-style: italic;">
          + ${item.additionals.map((a: any) => a.name).join(", ")}
        </div>
      ` : ""}
    </div>
  `).join("");

  const orderShortId = order.id?.substring(0, 4) || "????";

  w.document.write(`
    <html><head><title>Pedido #${orderShortId}</title>
    <style>
      body { margin: 0; padding: 15px; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.4; color: #000; }
      .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
      .footer { margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; }
      .row { display: flex; justify-content: space-between; }
      .bold { font-weight: bold; }
    </style></head>
    <body onload="window.print(); window.close();">
      <div class="header">
        <div style="font-size: 16px; font-weight: bold;">${storeName}</div>
        <div>PEDIDO: #${orderShortId}</div>
        <div style="font-size: 10px;">${order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "--/--"}</div>
      </div>
      
      <div style="margin-bottom: 10px;">
        <div class="bold">CLIENTE: ${order.customer_name || "Sem nome"}</div>
        ${order.customer_phone ? `<div>TEL: ${order.customer_phone}</div>` : ""}
        <div>ORIGEM: ${order.origin === "public_pdv" ? "Balcão (Mobile)" : order.origin === "pdv" ? "PDV (Caixa)" : order.origin === "ifood" ? "iFood" : "Online"}</div>
        ${order.delivery_type === "entrega" ? `<div class="bold" style="margin-top: 5px;">🛵 ENTREGA</div><div>${order.delivery_address || "Endereço não informado"}</div>` : ""}
        ${order.delivery_type === "retirada" ? `<div class="bold" style="margin-top: 5px;">🚶 RETIRADA</div>` : ""}
        ${order.delivery_type === "local" ? `<div class="bold" style="margin-top: 5px;">🍽️ LOCAL / MESA</div>` : ""}
      </div>

      <div style="margin-bottom: 10px;">
        <div class="bold" style="border-bottom: 1px solid #000; margin-bottom: 5px;">ITENS:</div>
        ${itemsHtml}
      </div>

      <div class="footer">
        <div class="row"><span class="bold">TOTAL:</span> <span class="bold">${fmt(order.total)}</span></div>
        <div class="row"><span>Pagamento:</span> <span>${PAYMENT_LABELS[order.payment_method] || order.payment_method || "---"}</span></div>
      </div>
      
      ${order.notes ? `<div style="margin-top: 10px; font-size: 10px; background: #f0f0f0; padding: 5px;">OBS: ${order.notes}</div>` : ""}
      
      <div style="text-align: center; margin-top: 20px; font-size: 9px;">Obrigado pela preferência!</div>
    </body></html>
  `);
  w.document.close();
}

function OrderCard({ order, storeId, compact, storeName }: { order: Order; storeId: string, compact?: boolean, storeName: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(order.status === "pending" && !compact);
  const [message, setMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); });

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["pending"];

  // Itens do pedido
  const { data: items = [] } = useQuery<OrderItem[]>({
    queryKey: ["order-items", order.id],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_items").select("*").eq("order_id", order.id).order("id");
        if (error) throw error;
        return data as OrderItem[];
      } catch {
        return order.items ?? [];
      }
    },
  });

  // Mensagens
  const { data: messages = [] } = useQuery<OrderMessage[]>({
    queryKey: ["order-messages", order.id],
    enabled: expanded,
    refetchInterval: expanded ? 3000 : false,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_messages").select("*").eq("order_id", order.id).order("created_at");
        if (error) throw error;
        return data as OrderMessage[];
      } catch {
        return JSON.parse(localStorage.getItem(`order_messages_${order.id}`) || "[]");
      }
    },
  });

  // Sincronizar status com iFood
  const ifoodMutation = useMutation({
    mutationFn: async ({ orderId, externalId, action }: { orderId: string, externalId: string, action: string }) => {
      const { data, error } = await supabase.functions.invoke("ifood-manager", {
        body: { action, storeId, orderId: externalId }
      });
      if (error) throw error;
      return data;
    },
    onError: (e) => toast.error(`Erro iFood: ${e.message}`),
  });

  // Emitir Nota Fiscal — PlugNotas
  const plugnotasMutation = useMutation({
    mutationFn: async () => {
      // Busca o CNPJ do prestador salvo nas configurações da loja
      const { data: secretsData } = await (supabase as any)
        .from('store_secrets')
        .select('nfe_config')
        .eq('store_id', storeId)
        .maybeSingle();

      const cnpjPrestador = (secretsData?.nfe_config as any)?.cnpj?.replace(/\D/g, '');

      const { data, error } = await supabase.functions.invoke('plugnotas-api', {
        body: {
          action: 'create_nfse',
          payload: {
            cnpjPrestador,
            nomeCliente: order.customer_name || 'Consumidor Final',
            valorTotal: order.total,
            descricaoServico: `Venda de produtos — Pedido #${order.id.substring(0, 8).toUpperCase()}`,
            idExterno: `pdv_${order.id}`,
          },
        },
      });

      if (error) throw error;
      if (data?.error) {
        throw new Error(`${data.error}. ${data.details ? JSON.stringify(data.details) : ''}`);
      }

      // Salva o protocolo retornado pelo PlugNotas no pedido
      const protocolo = data?.protocolo || data?.id;
      if (protocolo) {
        await (supabase as any).from('orders').update({
          asaas_invoice_id: protocolo,
          asaas_invoice_status: 'emitida',
        }).eq('id', order.id);
      }
      return data;
    },
    onSuccess: () => {
      toast.success('✅ Nota fiscal solicitada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['store-orders', storeId] });
    },
    onError: (e: any) => toast.error(`Erro ao emitir nota: ${e.message}`),
  });

  // Avançar status
  const advanceMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      try {
        // Se for iFood, avisa a API antes de atualizar localmente
        if (order.origin === "ifood" && order.external_id) {
          let ifoodAction = "";
          if (newStatus === "accepted") ifoodAction = "confirm_order";
          if (newStatus === "preparing") ifoodAction = "confirm_order"; // No iFood preparar costuma ser o confirmar
          if (newStatus === "ready") ifoodAction = "ready_order";
          if (newStatus === "delivered") ifoodAction = "dispatch_order";
          
          if (ifoodAction) {
            await ifoodMutation.mutateAsync({ orderId: order.id, externalId: order.external_id, action: ifoodAction });
          }
        }

        const { error } = await (supabase as any)
          .from("orders").update({ status: newStatus }).eq("id", order.id);
        if (error) throw error;
      } catch {
        // offline: atualiza localStorage
        const storeKeys = Object.keys(localStorage).filter(k => k.startsWith("orders_offline_"));
        for (const key of storeKeys) {
          const orders = JSON.parse(localStorage.getItem(key) || "[]");
          const idx = orders.findIndex((o: any) => o.id === order.id);
          if (idx !== -1) { orders[idx].status = newStatus; localStorage.setItem(key, JSON.stringify(orders)); }
        }
        queryClient.setQueryData<Order[]>(["store-orders", storeId],
          old => old?.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] }); },
  });

  // Cancelar com motivo
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const updatedNotes = reason?.trim()
        ? (order.notes ? `${order.notes} | [Motivo do cancelamento: ${reason.trim()}]` : `[Motivo do cancelamento: ${reason.trim()}]`)
        : order.notes;

      try {
        const { error } = await (supabase as any)
          .from("orders")
          .update({ 
            status: "cancelled",
            notes: updatedNotes,
          })
          .eq("id", order.id);
        if (error) throw error;
      } catch {
        // offline
        const storeKeys = Object.keys(localStorage).filter(k => k.startsWith("orders_offline_"));
        for (const key of storeKeys) {
          const orders = JSON.parse(localStorage.getItem(key) || "[]");
          const idx = orders.findIndex((o: any) => o.id === order.id);
          if (idx !== -1) { 
            orders[idx].status = "cancelled"; 
            orders[idx].notes = updatedNotes;
            localStorage.setItem(key, JSON.stringify(orders)); 
          }
        }
        queryClient.setQueryData<Order[]>(["store-orders", storeId],
          old => old?.map(o => o.id === order.id ? { ...o, status: "cancelled", notes: updatedNotes } : o));
      }
    },
    onSuccess: () => { 
      toast.success("Pedido recusado/cancelado.");
      setCancelDialogOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] }); 
    },
    onError: (e: any) => toast.error(`Erro ao cancelar: ${e.message}`),
  });

  // Enviar mensagem (como loja)
  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const newMsg: OrderMessage = {
        id: `msg-store-${Date.now()}`,
        order_id: order.id,
        sender: "store",
        sender_name: "Loja",
        message: msg,
        created_at: new Date().toISOString(),
      };
      
      try {
        const { error } = await (supabase as any).from("order_messages").insert({
          order_id: order.id, 
          sender: "store", 
          sender_name: "Loja", 
          message: msg,
        });
        if (!error) {
          // Broadcast para o cliente receber sem atraso
          supabase.channel(`order-channel-${order.id}`).send({
            type: "broadcast",
            event: "new_message",
            payload: { order_id: order.id, message: msg, sender: "store" },
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("Supabase offline ao enviar mensagem da loja:", e);
      }

      // Atualiza cache local imediatamente
      const existing = JSON.parse(localStorage.getItem(`order_messages_${order.id}`) || "[]");
      localStorage.setItem(`order_messages_${order.id}`, JSON.stringify([...existing, newMsg]));
      queryClient.setQueryData<OrderMessage[]>(["order-messages", order.id],
        old => [...(old ?? []), newMsg]);
    },
    onSuccess: () => {
      setMessage("");
    },
  });

  const unreadCount = (messages || []).filter(m => m.sender === "customer").length;
  const minutesAgo = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) : 0;

  return (
    <div className={cn("bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all flex flex-col justify-between", cfg.color,
      order.status === "pending" && "ring-2 ring-amber-400 ring-offset-1")}>

      {/* Card Header */}
      <div className={cn(compact ? "p-3" : "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col gap-0.5 w-full">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground"># {order.id?.substring(0, 4) || "????"}</span>
                {order.origin === "public_pdv" ? (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-blue-50 text-blue-600 border-blue-100 font-bold">📱 Balcão</Badge>
                ) : order.origin === "pdv" ? (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-teal-50 text-teal-600 border-teal-100 font-bold">🛒 PDV</Badge>
                ) : order.origin === "ifood" ? (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-red-50 text-red-600 border-red-100 font-bold">🛵 iFood {order.external_code}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-purple-50 text-purple-600 border-purple-100 font-bold">🌐 Online</Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <User className={cn("text-muted-foreground shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
                <span className={cn("font-bold truncate", compact ? "text-xs" : "text-sm")}>{order.customer_name || "Sem nome"}</span>
              </div>

              {!compact && order.customer_phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 ml-5">
                  <Phone className="h-3 w-3" />{order.customer_phone}
                </span>
              )}

              <div className={cn("flex items-center gap-2 text-muted-foreground", compact ? "text-[10px] ml-4" : "text-xs ml-6")}>
                <Clock className={cn("shrink-0", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
                <span>{minutesAgo <= 0 ? "Agora" : `${minutesAgo}m`}</span>
                {!compact && (
                  <>
                    <span>·</span>
                    <span className="truncate">{PAYMENT_LABELS[order.payment_method] ?? order.payment_method ?? "Outro"}</span>
                  </>
                )}
              </div>
              <div className={cn("mt-1 flex items-center gap-1", compact ? "text-[10px] ml-4" : "text-xs ml-6")}>
                {order.delivery_type === "entrega" && <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px] px-1.5 h-4">🛵 Entrega</Badge>}
                {order.delivery_type === "retirada" && <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px] px-1.5 h-4">🚶 Retirada</Badge>}
                {order.delivery_type === "local" && <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] px-1.5 h-4">🍽️ Local</Badge>}
              </div>
            </div>
          </div>

          {!compact && (
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", cfg.badge)}>
                {cfg.label}
              </span>
              <span className="font-bold text-sm">{fmt(order.total || 0)}</span>
              <button onClick={() => setExpanded(e => !e)} className="p-1 rounded hover:bg-muted">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>

        {compact && (
           <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="font-bold text-xs">{fmt(order.total || 0)}</span>
              <Badge className={cn("text-[9px] h-4 px-1.5", cfg.badge)}>{cfg.label}</Badge>
           </div>
        )}

        {/* Itens resumidos */}
        <div className={cn("mt-2 flex flex-wrap gap-1", !compact && "ml-6")}>
          {(items || []).map((item, i) => (
            <span key={i} className={cn("bg-muted rounded-full px-2 py-0.5 font-medium border", compact ? "text-[9px]" : "text-xs")}>
              {item.quantity}x {item.product_name}
            </span>
          ))}
        </div>

        {!compact && order.notes && (
          <p className="mt-2 ml-6 text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            📝 {order.notes}
          </p>
        )}

        {!compact && order.delivery_type === "entrega" && order.delivery_address && (
          <p className="mt-2 ml-6 text-xs text-muted-foreground bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
            📍 <strong>Endereço:</strong> {order.delivery_address}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className={cn("flex gap-1.5 px-3 pb-3", !expanded && "pb-3")}>
        {order.status !== "delivered" && order.status !== "cancelled" && cfg.next && (
            <Button size="sm" className={cn("flex-1", compact ? "h-7 text-[10px]" : "h-9")}
              disabled={advanceMutation.isPending || ifoodMutation.isPending}
              onClick={() => advanceMutation.mutate(cfg.next!)}>
              {advanceMutation.isPending || ifoodMutation.isPending ? "..." : cfg.nextLabel}
            </Button>
          )}
          {order.origin === "ifood" && order.status === "ready" && (
            <Button size="sm" className={cn("flex-1 bg-emerald-600 hover:bg-emerald-700", compact ? "h-7 text-[10px]" : "h-9")}
              disabled={ifoodMutation.isPending}
              onClick={() => advanceMutation.mutate("delivered")}>
              {ifoodMutation.isPending ? "..." : "🚚 Despachar"}
            </Button>
          )}
          <Button size="sm" variant="outline" className={cn("gap-1 h-9", compact && "h-7 text-[10px]")}
            onClick={() => handlePrintReceipt(order, items, storeName)}>
            <Printer className="h-4 w-4" />
            {!compact && "Imprimir"}
          </Button>
          {order.asaas_invoice_id ? (
             <Button size="sm" variant="outline" className={cn("gap-1 h-9 text-blue-600 border-blue-200 hover:bg-blue-50", compact && "h-7 text-[10px]")}
               onClick={async () => {
                 try {
                   toast.info('Baixando PDF da nota...');
                   const { data, error } = await supabase.functions.invoke('plugnotas-api', {
                     body: { action: 'get_pdf_url', payload: { protocolo: order.asaas_invoice_id } }
                   });
                   if (error) throw error;
                   if (data?.pdf_base64) {
                     // Abre o PDF em nova aba a partir do base64
                     const byteChars = atob(data.pdf_base64);
                     const byteArr = new Uint8Array(byteChars.length);
                     for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                     const blob = new Blob([byteArr], { type: 'application/pdf' });
                     window.open(URL.createObjectURL(blob), '_blank');
                   } else {
                     toast.info(`Protocolo da nota: ${order.asaas_invoice_id}`);
                   }
                 } catch {
                   toast.info(`Protocolo da nota: ${order.asaas_invoice_id}`);
                 }
               }}>
               <FileText className="h-4 w-4" />
               {!compact && "Ver Nota PDF"}
             </Button>
          ) : (
             <Button size="sm" variant="outline" className={cn("gap-1 h-9", compact && "h-7 text-[10px]")}
               disabled={plugnotasMutation.isPending}
               onClick={() => plugnotasMutation.mutate()}>
               <FileText className="h-4 w-4" />
               {!compact && (plugnotasMutation.isPending ? "Emitindo..." : "Emitir Nota")}
             </Button>
          )}
          {order.status === "pending" && (
            <Button size="sm" variant="outline" 
              className={cn("text-destructive border-destructive/30 hover:bg-red-50", compact ? "h-7 px-2" : "h-9")}
              disabled={cancelMutation.isPending}
              onClick={() => setCancelDialogOpen(true)}>
              <XCircle className={cn(compact ? "h-3 w-3" : "h-4 w-4 mr-1")} />
              {!compact && " Recusar"}
            </Button>
          )}
      </div>

      {/* Modal de Motivo de Cancelamento / Recusa */}
      {cancelDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-red-600 font-bold">
                <XCircle className="h-5 w-5" />
                <span>Recusar / Cancelar Pedido</span>
              </div>
              <button onClick={() => setCancelDialogOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Motivo do cancelamento (opcional):</p>
              <p className="text-xs text-muted-foreground mb-2">Este motivo ficará visível para o cliente no acompanhamento do pedido.</p>
              <textarea
                placeholder="Ex: Ingredientes esgotados, fora da área de entrega, loja fechando..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full h-24 p-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(false)}
                disabled={cancelMutation.isPending}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelReason)}
              >
                {cancelMutation.isPending ? "Recusando..." : "Confirmar Recusa"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded: Itens detalhados + Chat */}
      {expanded && (
        <div className="border-t">
          {/* Itens detalhados */}
          <div className="p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens do Pedido</p>
            {(items || []).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.quantity}× {item.product_name}</span>
                <span className="font-medium">{fmt(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t pt-1.5 flex justify-between font-bold text-sm">
              <span>Total</span><span>{fmt(order.total || 0)}</span>
            </div>
          </div>

          {/* Chat */}
          <div className="border-t">
            <div className="px-4 py-2 flex items-center gap-2 bg-muted/30">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chat com cliente</span>
              {unreadCount > 0 && (
                <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-bold">
                  {unreadCount} msg
                </span>
              )}
            </div>

            <div className="h-40 overflow-y-auto p-3 space-y-2 bg-gray-50/50">
              {(messages || []).length === 0 ? (
                <p className="text-xs text-center text-muted-foreground pt-4">Nenhuma mensagem ainda</p>
              ) : (messages || []).map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === "store" ? "justify-end" : "justify-start"}`}>
                  <div className={cn("max-w-[80%] rounded-xl px-3 py-2 text-xs",
                    msg.sender === "store"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-white border shadow-sm rounded-bl-sm")}>
                    {msg.sender === "customer" && (
                      <p className="font-semibold text-primary opacity-70 text-[10px] mb-0.5">{msg.sender_name ?? "Cliente"}</p>
                    )}
                    <p>{msg.message}</p>
                    <p className={cn("text-[10px] mt-0.5", msg.sender === "store" ? "text-white/60" : "text-muted-foreground")}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-2 border-t flex gap-1.5">
              <Input placeholder="Responder cliente..."
                value={message} onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) sendMutation.mutate(message.trim()); } }}
                className="h-8 text-xs flex-1" />
              <Button size="icon" className="h-8 w-8"
                disabled={!message.trim() || sendMutation.isPending}
                onClick={() => { if (message.trim()) sendMutation.mutate(message.trim()); }}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Pedidos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("active");
  const [layout, setLayout] = useState<"list" | "grid" | "compact">("list");
  const [soundEnabled, setSoundEnabled] = useState(() => getSoundConfig().enabled);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveSoundConfig({ enabled: next });
    if (next) {
      playNotificationSound();
      toast.success("🔊 Alertas sonoros ativados!");
    } else {
      toast.info("🔇 Alertas sonoros silenciados!");
    }
  };

  // Pegar storeId do usuário
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("profiles")
          .select("store_id").eq("auth_user_id", user!.id).single();
        if (error) throw error;
        return data;
      } catch { return null; }
    },
  });

  const storeId = profile?.store_id ?? user?.id ?? "test-store";

  // Buscar nome da loja para o cupom
  const { data: store } = useQuery({
    queryKey: ["store-info", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("name").eq("id", storeId).single();
      if (error) throw error;
      return data;
    },
  });

  // Carregar pedidos (Online + Offline)
  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["store-orders", storeId],
    refetchInterval: 5000,
    queryFn: async () => {
      let onlineOrders: Order[] = [];
      try {
        const { data, error } = await (supabase as any)
          .from("orders").select("*")
          .eq("store_id", storeId).order("created_at", { ascending: false });
        if (!error && data) {
          onlineOrders = data as Order[];
        }
      } catch (e) {
        console.warn("Erro ao buscar pedidos online:", e);
      }

      // Busca também pedidos locais (offline) e junta sem duplicar
      const key = `orders_offline_${storeId}`;
      const offlineOrders: Order[] = JSON.parse(localStorage.getItem(key) || "[]");
      
      // Filtra os que já estão no online pelo ID
      const onlineIds = new Set(onlineOrders.map(o => o.id));
      const onlyOffline = offlineOrders.filter(o => !onlineIds.has(o.id));

      const all = [...onlineOrders, ...onlyOffline];
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return all;
    },
  });

  // Realtime: novos pedidos e mensagens de clientes
  useEffect(() => {
    if (!storeId) return;
    try {
      const channel = supabase
        .channel(`store-orders-global-${storeId}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] });
          toast("🔔 Novo pedido recebido!", { duration: 4000 });
          playNotificationSound();
        })
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "order_messages",
        }, (payload: any) => {
          if (payload?.new?.sender === "customer") {
            const orderId = payload.new.order_id;
            queryClient.invalidateQueries({ queryKey: ["order-messages", orderId] });
            toast.info(`💬 Nova mensagem do cliente (${payload.new.sender_name || 'Cliente'}): "${payload.new.message}"`, {
              duration: 5000,
            });
            playNotificationSound();
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    } catch { /* offline */ }
  }, [storeId, queryClient]);

  // Sincronizar status com iFood (Global)
  const ifoodMutation = useMutation({
    mutationFn: async ({ orderId, externalId, action }: { orderId?: string, externalId?: string, action: string }) => {
      const { data, error } = await supabase.functions.invoke("ifood-manager", {
        body: { action, storeId, orderId: externalId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] });
      toast.success("Sincronização iFood concluída");
    },
    onError: (e) => toast.error(`Erro iFood: ${e.message}`),
  });

  const filtered = orders.filter(o => {
    if (!o) return false;
    if (filter === "active") {
      // Ativos: Não entregues/cancelados E que NÃO sejam do Balcão Mobile
      return !["delivered", "cancelled"].includes(o.status) && o.origin !== "public_pdv";
    }
    if (filter === "done") return ["delivered", "cancelled"].includes(o.status);
    if (filter === "public_pdv") return o.origin === "public_pdv";
    if (filter === "pdv") return o.origin === "pdv";
    if (filter === "ifood") return o.origin === "ifood";
    if (filter === "menu") return o.origin === "menu" || !o.origin;
    return true;
  });

  const pendingCount = orders.filter(o => o?.status === "pending").length;
  const activeCount = orders.filter(o => o && !["delivered", "cancelled"].includes(o.status)).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" /> Pedidos
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                <Bell className="h-3 w-3" /> {pendingCount} novo{pendingCount > 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">{activeCount} pedido{activeCount !== 1 ? "s" : ""} ativo{activeCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center bg-white border rounded-lg p-0.5 shadow-sm mr-2">
            <button onClick={() => setLayout("list")} 
              className={cn("p-1.5 rounded-md transition-all", layout === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <LayoutList className="h-4 w-4" title="Lista" />
            </button>
            <button onClick={() => setLayout("grid")} 
              className={cn("p-1.5 rounded-md transition-all", layout === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <LayoutGrid className="h-4 w-4" title="Grade" />
            </button>
            <button onClick={() => setLayout("compact")} 
              className={cn("p-1.5 rounded-md transition-all", layout === "compact" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <Maximize2 className="h-4 w-4 rotate-45" title="Compacto" />
            </button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleSound} 
            title={soundEnabled ? "Silenciar notificações de som" : "Ativar notificações de som"}
            className={cn("gap-1.5", soundEnabled ? "text-emerald-600 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100" : "text-muted-foreground")}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-rose-500" />}
            <span className="hidden sm:inline">{soundEnabled ? "Som Ativo" : "Silenciado"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
            onClick={() => ifoodMutation.mutate({ orderId: "", externalId: "", action: "poll_events" })}
            disabled={ifoodMutation.isPending}
          >
            <ShoppingBag className="h-4 w-4" />
            {ifoodMutation.isPending ? "Sincronizando..." : "Sincronizar iFood"}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "active",     label: "Ativos" },
          { key: "pdv",        label: "🛒 PDV" },
          { key: "public_pdv", label: "📱 Balcão (Mobile)" },
          { key: "ifood",      label: "🛵 iFood" },
          { key: "menu",       label: "🌐 Online" },
          { key: "all",        label: "Todos" },
          { key: "done",       label: "Concluídos" },
        ].map(f => (
          <button 
            key={f.key} 
            onClick={() => setFilter(f.key as any)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
              filter === f.key 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-white text-muted-foreground hover:bg-muted border-border"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando pedidos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <ShoppingBag className="h-12 w-12 opacity-20" />
          <p className="font-medium">Nenhum pedido {filter === "active" ? "ativo" : ""}</p>
          <p className="text-sm text-center max-w-xs">
            Quando clientes fizerem pedidos pelo catálogo online, eles aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className={cn("gap-4 pb-8 grid", 
          layout === "list" ? "grid-cols-1" : 
          layout === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : 
          "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6")}>
          {filtered.map(order => (
            <OrderCard 
              key={order.id} 
              order={order} 
              storeId={storeId} 
              compact={layout === "compact"} 
              storeName={store?.name ?? "Nossa Loja"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
