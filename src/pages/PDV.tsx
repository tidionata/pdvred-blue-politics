import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, CreditCard,
  Banknote, QrCode, Receipt, Percent, DollarSign, X, Printer,
  CheckCircle2, Image as ImageIcon, UtensilsCrossed, Edit2, Pencil,
  History, Ban, RotateCcw, AlertTriangle, Sparkles, Award, Gift,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { printToKitchen, buildKitchenReceiptHtml } from "@/lib/electronPrinting";
import { db } from "@/lib/db";
import { CustomerSearchModal } from "@/components/Clientes/CustomerSearchModal";
import { ClienteFormModal } from "@/components/Clientes/ClienteFormModal";
import { getLoyaltyPromoConfig, getCustomerPurchasesCount, addCustomerPurchaseStamp, setCustomerPurchasesCount } from "@/lib/loyalty";

type Product = Tables<"products">;

interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  selectedAdditionals?: { name: string; price: number }[];
  unitPrice: number;
}

// ─── Ticket de Dados para o Cupom ───────────────────────────────────────────
interface SaleTicket {
  saleId: string;
  senha: number;
  items: CartItem[];
  subtotal: number;
  discountValue: number;
  total: number;
  paymentMethod: string;
  cashierName: string;
  storeName: string;
  storeCnpj: string;
  storeAddress: string;
  storeCity: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  createdAt: Date;
  nfceKey?: string;
  nfceUrl?: string;
  trackingUrl?: string;
  sellerName?: string;
  sellerCommission?: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtQty = (v: number) => {
  if (Number.isInteger(v)) {
    return v.toString();
  }
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const paymentLabel: Record<string, string> = {
  cash: "DINHEIRO",
  credit: "CARTÃO CRÉDITO",
  debit: "CARTÃO DÉBITO",
  pix: "PIX",
};

// ─── Componente Cupom (só para impressão + visualização) ─────────────────────
function Cupom({ ticket, printRef }: { ticket: SaleTicket; printRef: React.RefObject<HTMLDivElement> }) {
  const dateStr = ticket.createdAt.toLocaleString("pt-BR");
  const totalItems = ticket.items.reduce((s, i) => s + i.quantity, 0);
  const isFiscalEnabled = localStorage.getItem("pdv_enable_fiscal") === "true" && !!ticket.nfceKey;

  return (
    <div
      ref={printRef}
      className="bg-white text-black font-mono text-[11px] leading-tight p-2 sm:p-4 w-full max-w-[300px] mx-auto select-text"
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {/* 1. Acompanhe seu pedido (Topo) */}
      {ticket.trackingUrl && (
        <div className="flex flex-col items-center text-center space-y-1 mb-3">
          <div className="border border-black p-2 rounded-sm w-full mb-1">
            <p className="text-[13px] font-bold">ACOMPANHE SEU PEDIDO</p>
            <p className="text-[12px]">ATRAVÉS DO CELULAR</p>
            <p className="text-[10px]">É SÓ LER O QRCODE</p>
          </div>
          <QRCodeSVG value={ticket.trackingUrl} size={110} level="M" />
        </div>
      )}

      {/* 2. Cabeçalho (Senha, Loja) */}
      <div className="text-center space-y-0.5 mb-2">
        <p className="text-[16px] font-bold tracking-widest uppercase mb-1">
          SENHA: {String(ticket.senha).padStart(3, "0")}
        </p>
        <p className="font-bold text-[12px] uppercase">{ticket.storeName}</p>
        {ticket.storeCnpj && (
          <p className="text-[10px] uppercase">
            CNPJ: {ticket.storeCnpj} {isFiscalEnabled ? (ticket.nfceKey ? "IE: CONFERIR" : "IE: 000000000000") : ""}
          </p>
        )}
        {ticket.storeAddress && <p className="text-[10px] uppercase">{ticket.storeAddress}</p>}
        {ticket.storeCity && <p className="text-[10px] uppercase">{ticket.storeCity}</p>}
        <p className="text-[10px] mt-1 font-semibold uppercase">
          {isFiscalEnabled
            ? "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica"
            : "Comprovante de Venda Não Fiscal"}
        </p>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* 3. Itens */}
      <table className="w-full text-[10px] mb-2 border-collapse">
        <thead>
          <tr>
            <th className="text-left font-bold pb-1" colSpan={4}>Cód. Descrição</th>
          </tr>
          <tr className="border-b border-black border-dashed">
            <th className="text-left font-bold pb-1 w-[20%]">Qtd</th>
            <th className="text-left font-bold pb-1 w-[20%]">UN</th>
            <th className="text-right font-bold pb-1 w-[30%]">Vl Unit</th>
            <th className="text-right font-bold pb-1 w-[30%]">Vl Total</th>
          </tr>
        </thead>
          {ticket.items.map((item, idx) => {
            const itemTotal = item.unitPrice * item.quantity;
            return (
              <tbody key={item.product.id}>
                <tr>
                  <td colSpan={4} className="text-left uppercase font-medium pt-1">
                    {String(idx + 1).padStart(3, "0")} - {item.product.name}
                    {item.selectedAdditionals && item.selectedAdditionals.length > 0 && (
                      <div className="text-[9px] text-gray-700 font-normal ml-2">
                        + {item.selectedAdditionals.map((a) => a.name).join(", ")}
                      </div>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="text-left pb-1">{fmtQty(item.quantity)}</td>
                  <td className="text-left uppercase pb-1">{(item.product as any).unit ?? "UN"}</td>
                  <td className="text-right pb-1">{item.unitPrice.toFixed(2).replace(".", ",")}</td>
                  <td className="text-right font-semibold pb-1">{itemTotal.toFixed(2).replace(".", ",")}</td>
                </tr>
              </tbody>
            );
          })}
      </table>
      <div className="border-t border-dashed border-black my-1" />

      {/* 4. Totais */}
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span>Qtd. Total de itens</span>
          <span>{totalItems}</span>
        </div>
        <div className="flex justify-between">
          <span>Valor Total dos Itens R$</span>
          <span>{ticket.subtotal.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between">
          <span>Valor Descontos R$</span>
          <span>{ticket.discountValue.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Valor Total a Pagar R$</span>
          <span>{ticket.total.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between uppercase">
          <span>{paymentLabel[ticket.paymentMethod] ?? ticket.paymentMethod}</span>
          <span>{ticket.total.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* 5. Tributos (Apenas se emitido com NFC-e) */}
      {isFiscalEnabled && (
        <>
          <div className="text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Informação dos Tributos Totais</span>
              <span>{(ticket.total * 0.12).toFixed(2).replace(".", ",")}</span>
            </div>
            <p>Incidentes (Lei Federal 12.741/2012)</p>
          </div>
          <div className="border-t border-dashed border-black my-1" />
        </>
      )}

      {/* 6. Operador e Consumidor */}
      <div className="text-center text-[10px] space-y-0.5 uppercase">
        <p>CX: CAIXA1 &nbsp;&nbsp;&nbsp; OP: {ticket.cashierName}</p>
        <p className="font-bold text-[12px]">VND: {String(ticket.saleId?.slice(-4) ?? "0000")}</p>
        <p className="font-bold text-[12px]">SENHA: {String(ticket.senha).padStart(3, "0")}</p>
        <p className="text-[9px] text-gray-700">{dateStr}</p>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      <div className="text-[9px] text-center space-y-0.5 my-1">
        <p>CONSUMIDOR: {ticket.customerName ? `${ticket.customerName} ${ticket.customerPhone ? `- ${ticket.customerPhone}` : ""}` : "Consumidor não identificado"}</p>
        {ticket.deliveryAddress && <p>ENDEREÇO: {ticket.deliveryAddress}</p>}
        {ticket.deliveryNotes && <p>OBS: {ticket.deliveryNotes}</p>}
      </div>

      {/* 7. NFC-e Info (Apenas se emitido com chave real autorizada) */}
      {isFiscalEnabled ? (
        <div className="text-[9px] text-center space-y-1 mt-2">
          <div className="border-t border-dashed border-black my-1" />
          <p>Consulte pela Chave de Acesso em</p>
          <p>http://www.nfce.sefaz.gov.br/consulta</p>
          <p className="break-all my-1 font-mono">{ticket.nfceKey}</p>
          <p>NFC-e n°{String(ticket.saleId?.slice(-4) ?? "0000")} Serie:1 {dateStr} Via Consumidor</p>
          <p className="font-bold uppercase mt-1">EMITIDA EM CONTINGÊNCIA</p>
          <p className="font-bold uppercase mb-2">Pendente de autorização</p>
          
          <div className="flex justify-center mt-2 mb-2">
            {ticket.nfceUrl ? (
              <QRCodeSVG value={ticket.nfceUrl} size={110} level="M" />
            ) : (
              <QRCodeSVG value={`https://www.sefaz.gov.br/nfce/qrcode?chNFe=${ticket.nfceKey}`} size={110} level="M" />
            )}
          </div>
          <p className="text-[8px] mt-2">Trib. Aprox.: {(ticket.total * 0.05).toFixed(2).replace(".", ",")} Fed, {(ticket.total * 0.07).toFixed(2).replace(".", ",")} Est, FONTE: IBPT</p>
        </div>
      ) : (
        <div className="text-[9px] text-center space-y-0.5 mt-2 text-gray-700">
          <p className="font-semibold">*** OBRIGADO PELA PREFERÊNCIA! ***</p>
          <p>Documento auxiliar de conferência de pedido.</p>
        </div>
      )}
    </div>
  );
}

// ─── Modal de Cupom ──────────────────────────────────────────────────────────
function CupomModal({
  ticket,
  open,
  onClose,
}: {
  ticket: SaleTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [emittingNfe, setEmittingNfe] = useState(false);

  useEffect(() => {
    if (open && localStorage.getItem("pdv_autoprint") === "true") {
      // Pequeno atraso para garantir que o DOM do cupom foi renderizado
      const timer = setTimeout(handlePrint, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleEmitNFe = async () => {
    if (!ticket) return;
    try {
      setEmittingNfe(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      const { data: userData } = await supabase.from('profiles').select('store_id').eq('id', userId).single();
      const storeId = userData?.store_id;

      if (!storeId) throw new Error("Loja não encontrada");

      const itemsDesc = ticket.items.map(i => `${i.quantity}x ${i.product.name}`).join(", ");

      const nfePayload = {
        action: 'create_invoice',
        storeId: storeId,
        payload: {
          customerName: ticket.customerName || 'Consumidor Final',
          customerCpfCnpj: '', 
          value: ticket.total,
          serviceDescription: `Venda PDV - Itens: ${itemsDesc}`
        }
      };

      const { data, error } = await supabase.functions.invoke('asaas-api', {
        body: nfePayload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success("NF-e emitida com sucesso no Asaas!");
    } catch (err: any) {
      toast.error("Erro ao emitir NF-e: " + err.message);
    } finally {
      setEmittingNfe(false);
    }
  };

  const handlePrint = async () => {
    const content = printRef.current;
    if (!content) return;

    const htmlContent = `
      <html>
        <head>
          <title>Cupom Fiscal</title>
          <style>
            @page { 
              size: 80mm auto; 
              margin: 0mm; 
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              color: #000000 !important;
            }
            html, body { 
              margin: 0 auto !important; 
              padding: 0 !important; 
              width: 100% !important; 
              max-width: 72mm !important;
              font-family: 'Courier New', Courier, monospace !important; 
              font-size: 10px !important; 
              line-height: 1.25 !important; 
              color: #000000 !important; 
              background: #ffffff !important;
              font-weight: 600 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .items-center { align-items: center; }
            .justify-between { justify-content: space-between; }
            .justify-center { justify-content: center; }
            .text-center { text-align: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            
            .p-2 { padding: 4px; }
            .p-4 { padding: 8px; }
            .pl-1 { padding-left: 2px; }
            .pl-8 { padding-left: 16px; }
            .pr-1 { padding-right: 2px; }
            .pb-1 { padding-bottom: 2px; }
            .pt-1 { padding-top: 2px; }
            .ml-2 { margin-left: 4px; }
            .m-0 { margin: 0; }
            .mb-0\\.5 { margin-bottom: 2px; }
            .mb-1 { margin-bottom: 3px; }
            .mb-1\\.5 { margin-bottom: 4px; }
            .mb-2 { margin-bottom: 6px; }
            .mb-3 { margin-bottom: 8px; }
            .mt-1 { margin-top: 3px; }
            .mt-2 { margin-top: 6px; }
            .my-1 { margin-top: 3px; margin-bottom: 3px; }
            .my-2 { margin-top: 6px; margin-bottom: 6px; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .space-y-0\\.5 > * + * { margin-top: 2px; }
            .space-y-1 > * + * { margin-top: 3px; }
            
            .w-8 { width: 24px; }
            .w-10 { width: 32px; }
            .w-12 { width: 40px; }
            .w-16 { width: 52px; }
            .w-24 { width: 75px; }
            .w-28 { width: 90px; }
            .w-full { width: 100% !important; max-width: 100% !important; }
            .w-\\[20\\%\\] { width: 18%; }
            .w-\\[30\\%\\] { width: 32%; }
            .w-\\[40\\%\\] { width: 40%; }
            .h-24 { height: 80px; }
            .h-28 { height: 90px; }
            .flex-1 { flex: 1 1 0%; }
            
            .text-\\[8px\\] { font-size: 8px !important; line-height: 10px !important; }
            .text-\\[9px\\] { font-size: 8.5px !important; line-height: 11px !important; }
            .text-\\[10px\\] { font-size: 9.5px !important; line-height: 12px !important; }
            .text-\\[11px\\] { font-size: 10px !important; line-height: 13px !important; }
            .text-\\[12px\\] { font-size: 11px !important; line-height: 14px !important; }
            .text-\\[13px\\] { font-size: 11.5px !important; line-height: 15px !important; }
            .text-\\[15px\\] { font-size: 13px !important; line-height: 16px !important; }
            .text-\\[16px\\] { font-size: 14px !important; line-height: 18px !important; }
            .font-bold { font-weight: 800 !important; }
            .font-semibold { font-weight: 700 !important; }
            .font-medium { font-weight: 600 !important; }
            .font-normal { font-weight: 400 !important; }
            .font-mono { font-family: 'Courier New', Courier, monospace !important; }
            .uppercase { text-transform: uppercase; }
            .tracking-widest { letter-spacing: 0.05em; }
            .leading-tight { line-height: 1.2; }
            .break-all { word-break: break-all; }
            
            .border { border: 1px solid #000 !important; }
            .border-t { border-top: 1px dashed #000 !important; }
            .border-b { border-bottom: 1px dashed #000 !important; }
            .border-dashed { border-style: dashed !important; }
            .border-black { border-color: #000 !important; }
            .rounded-sm { border-radius: 2px; }
            .bg-white { background-color: #fff; }
            
            table { width: 100% !important; table-layout: fixed; }
            .border-collapse { border-collapse: collapse; }
            th, td { word-wrap: break-word; overflow: hidden; }
            
            svg { max-width: 100px !important; max-height: 100px !important; height: auto !important; }
            
            .text-gray-700, .bg-gray-100, .border-gray-300 { 
              color: #000000 !important; 
              border-color: #000000 !important; 
            }
          </style>
        </head>
        <body>
          <div style="width: 100%; max-width: 72mm; margin: 0 auto; padding: 2px 4px;">
            ${content.innerHTML}
          </div>
        </body>
      </html>
    `;

    // @ts-ignore
    if (window.electronAPI) {
      const printerCaixa = localStorage.getItem('pdv_printer_caixa');
      try {
        // @ts-ignore
        await window.electronAPI.printHtml({ 
          html: htmlContent, 
          printer: printerCaixa || undefined,
          silent: true 
        });
        toast.success("Cupom impresso com sucesso!");
        return;
      } catch (e: any) {
        toast.error("Erro ao imprimir: " + e.message);
      }
    }

    // Fallback para Web
    const printWindow = window.open("", "_blank", "width=400,height=700");
    if (!printWindow) return;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            Venda Finalizada!
          </DialogTitle>
        </DialogHeader>

        {/* Cupom Preview */}
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <Cupom ticket={ticket} printRef={printRef} />
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1 flex-wrap">
          {localStorage.getItem("pdv_enable_fiscal") === "true" && (
            <Button onClick={handleEmitNFe} disabled={emittingNfe} className="flex-1 min-w-[120px] gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {emittingNfe ? "Gerando NF-e..." : "Emitir NF-e (Asaas)"}
            </Button>
          )}
          <Button onClick={handlePrint} className="flex-1 min-w-[120px] gap-2 bg-gray-900 hover:bg-gray-700">
            <Printer className="h-4 w-4" />
            Imprimir Cupom
          </Button>
          <Button onClick={onClose} variant="outline" className="flex-1 min-w-[120px]">
            Nova Venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}



// ─── PDV Principal ────────────────────────────────────────────────────────────
export default function PDV({ isDeliveryMode = false }: { isDeliveryMode?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const searchRef = useRef<HTMLInputElement>(null);
  const [cupomOpen, setCupomOpen] = useState(false);
  const [lastTicket, setLastTicket] = useState<SaleTicket | null>(null);
  const [saleCounter, setSaleCounter] = useState(1);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);

  // ── Vendedoras ───────────────────────────────────────────────────────────────
  const sellers: { name: string; commission: number }[] = JSON.parse(
    localStorage.getItem("pdv_sellers") || "[]"
  );
  const [selectedSeller, setSelectedSeller] = useState<{ name: string; commission: number } | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearchModalOpen, setCustomerSearchModalOpen] = useState(false);
  const [customerFormModalOpen, setCustomerFormModalOpen] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"local" | "retirada" | "entrega">(isDeliveryMode ? "entrega" : "local");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // Modal de Produto (Peso e Adicionais)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalQty, setModalQty] = useState<number | string>(1);
  const [modalPrice, setModalPrice] = useState<number | string>("");
  const [selectedAdds, setSelectedAdds] = useState<any[]>([]);

  // ── Histórico de Vendas & Cancelamento ──────────────────────────────────────
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [cancelingSaleId, setCancelingSaleId] = useState<string | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [selectedSaleToCancel, setSelectedSaleToCancel] = useState<any | null>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const duplicateData = localStorage.getItem("pdv_duplicate_cart");
    if (duplicateData) {
      try {
        const { items, customerName, customerPhone, customerId } = JSON.parse(duplicateData);
        if (items && items.length > 0) {
          setCart(items.map((i: any) => ({
            cartItemId: `dup-${Date.now()}-${Math.random()}`,
            product: i.product || { id: i.id || "manual", name: i.name, price: i.unit_price || i.price, active: true },
            unitPrice: i.unit_price || i.price || i.product?.price || 0,
            quantity: i.quantity || 1,
            selectedAdditionals: [],
          })));
        }
        if (customerName) setCustomerName(customerName);
        if (customerPhone) setCustomerPhone(customerPhone);
        if (customerId) setCustomerId(customerId);
      } catch (e) {
        console.error("Error parsing duplicate cart", e);
      }
      localStorage.removeItem("pdv_duplicate_cart");
    }
  }, []);

  // Profile / store
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    retry: 3,
    retryDelay: 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, store_id, full_name")
        .eq("auth_user_id", user!.id)
        .single();
      if (error) {
        console.error("[PDV] Erro ao carregar perfil:", error.message);
        throw error;
      }
      return data;
    },
  });

  // Usa store_id do perfil ou, em modo offline, usa o próprio user.id
  const storeId = profile?.store_id ?? user?.id ?? "test-store";
  // sales.user_id referencia profiles(id) — NUNCA use auth user.id aqui
  const profileId = profile?.id;

  const isValidUUID = (s?: string) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);


  // Store info
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (store && (!store.table_count || Number(store.table_count) <= 0) && deliveryType === "local" && !isDeliveryMode) {
      setDeliveryType("retirada");
    }
  }, [store, deliveryType, isDeliveryMode]);

  // Busca vendas pendentes para as mesas
  const { data: pendingSales = [], refetch: refetchPending } = useQuery({
    queryKey: ["sales_pending", storeId],
    enabled: !!storeId && isValidUUID(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, table_name, total, notes")
        .eq("store_id", storeId)
        .eq("status", "pending")
        .not("table_name", "is", null);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000
  });

  // Busca histórico recente de vendas para cancelamento e reimpressão
  const { data: recentSales = [], refetch: refetchRecentSales, isLoading: loadingSales } = useQuery({
    queryKey: ["recent_sales_pdv", storeId],
    enabled: !!storeId && isValidUUID(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          id, total, discount, payment_method, status, notes, created_at,
          sale_items (
            id, product_id, quantity, unit_price, subtotal
          )
        `)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data || [];
    },
  });

  // Cancelar / Estornar Venda com devolução de estoque
  const cancelSaleMutation = useMutation({
    mutationFn: async ({ saleId, reason, items }: { saleId: string; reason: string; items?: any[] }) => {
      const formattedReason = reason?.trim() ? `[Cancelado no PDV: ${reason.trim()}]` : "[Cancelado no PDV]";

      // 1. Atualiza o status da venda para cancelled
      const { error: updateError } = await supabase
        .from("sales")
        .update({
          status: "cancelled",
          notes: formattedReason,
        })
        .eq("id", saleId);

      if (updateError) throw updateError;

      // 2. Se a venda possuía itens, devolve a quantidade ao estoque dos produtos
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.product_id && isValidUUID(item.product_id)) {
            // Busca o produto atual para somar o estoque
            const { data: prod } = await supabase
              .from("products")
              .select("stock_quantity")
              .eq("id", item.product_id)
              .single();

            if (prod && prod.stock_quantity !== null) {
              const restoredStock = Number(prod.stock_quantity) + Number(item.quantity);
              await supabase
                .from("products")
                .update({ stock_quantity: restoredStock })
                .eq("id", item.product_id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Venda cancelada e estoque estornado com sucesso!");
      setSelectedSaleToCancel(null);
      setCancelReasonInput("");
      refetchRecentSales();
      queryClient.invalidateQueries({ queryKey: ["products", storeId] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao cancelar venda: " + err.message);
    }
  });

  // Products — lê do Dexie (banco local) quando offline, faz sync quando online
  const { data: products = [] } = useQuery({
    queryKey: ["products", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      // 1. Tenta buscar do Supabase (online)
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("store_id", storeId!)
            .eq("active", true)
            .order("name");
          if (error) throw error;
          // Salva no banco local para usar offline depois
          const localData = (data as Product[]).map(p => ({ ...p, _sync_status: 'synced' as const }));
          await db.products.bulkPut(localData);
          return data as Product[];
        } catch (err) {
          console.warn("[PDV] Supabase indisponível, usando banco local.", err);
        }
      }
      // 2. Offline: lê do Dexie
      const localProducts = await db.products
        .where("store_id").equals(storeId!)
        .toArray();
      if (localProducts.length > 0) {
        toast.info("📦 Usando produtos do banco local (modo offline)");
        return localProducts.filter(p => (p as any).active !== false) as unknown as Product[];
      }
      // 3. Último recurso: localStorage
      try {
        const list: Product[] = JSON.parse(
          localStorage.getItem(`products_offline_${storeId}`) || "[]"
        );
        return list.filter(p => p.active);
      } catch { return []; }
    },
  });


  // Filtered products
  const filtered = useMemo(() => {
    const activeMenu = (store as any)?.active_menu_type || 'both';
    
    const menuFiltered = (products || []).filter(p => {
      if (!p || !p.name) return false;
      if (activeMenu === 'both') return true;
      const prodMenu = (p as any).menu_type || 'both';
      return prodMenu === 'both' || prodMenu === activeMenu;
    });

    if (!search.trim()) return menuFiltered;
    
    const q = search.toLowerCase();
    return menuFiltered.filter(
      (p) =>
        p && p.name && (
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
        )
    );
  }, [products, search, store]);

  // Additionals for modal
  const { data: productAdditionals = [] } = useQuery({
    queryKey: ["product_additionals_pdv", selectedProduct?.id],
    enabled: !!selectedProduct && !!(selectedProduct as any).has_additionals,
    queryFn: async () => {
      // Se for produto offline e tiver os dados salvos nele
      if ((selectedProduct as any).additionals_data) {
        return (selectedProduct as any).additionals_data;
      }
      // Se for um ID local, não tenta buscar no banco
      if (selectedProduct!.id.startsWith("local-")) {
        return [];
      }
      const { data } = await (supabase as any)
        .from("product_additionals")
        .select("*")
        .eq("product_id", selectedProduct!.id)
        .eq("active", true)
        .order("created_at");
      return (data || []) as any[];
    }
  });

  // Cart helpers
  const handleProductClick = (p: Product) => {
    const hasAdds = (p as any).has_additionals;
    const isWeight = (p as any).unit === "KG" || (p as any).unit === "G" || (p as any).unit === "L";
    
    if (hasAdds || isWeight) {
      setSelectedProduct(p);
      setModalQty(isWeight ? "" : 1);
      setModalPrice(isWeight ? "" : p.price);
      setSelectedAdds([]);
      setProductModalOpen(true);
    } else {
      addToCart(p, 1, [], p.price);
    }
  };

  const addToCart = (product: Product, quantity: number, adds: any[], unitPrice: number) => {
    if (quantity <= 0) return;
    
    setCart((prev) => {
      // Verifica se é o mesmo produto com os MESMOS adicionais para mesclar
      const addsStr = JSON.stringify(adds);
      const existing = prev.find((i) => i.product.id === product.id && JSON.stringify(i.selectedAdditionals) === addsStr);
      
      if (existing) {
        if (existing.quantity + quantity > product.stock_display) {
          toast.error("Estoque insuficiente em exposição");
          return prev;
        }
        return prev.map((i) =>
          i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      
      if (quantity > product.stock_display) {
        toast.error("Produto sem estoque suficiente em exposição");
        return prev;
      }
      
      return [...prev, { cartItemId: Math.random().toString(36).substring(7), product, quantity, selectedAdditionals: adds, unitPrice }];
    });
    setSearch("");
    searchRef.current?.focus();
    setProductModalOpen(false);
  };

  const updateQty = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.cartItemId !== cartItemId) return i;
          const newQty = i.quantity + delta;
          if (newQty > i.product.stock_display) {
            toast.error("Estoque insuficiente");
            return i;
          }
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (cartItemId: string) => setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));

  const updateItemPrice = (cartItemId: string, newPrice: number) => {
    setCart((prev) => prev.map((i) => (i.cartItemId === cartItemId ? { ...i, unitPrice: newPrice } : i)));
  };

  const clearCart = () => { setCart([]); setDiscount(0); };

  // Totals
  const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const discountValue = discountType === "percent" ? subtotal * (discount / 100) : discount;
  const total = Math.max(0, subtotal - discountValue);

  // Finalize sale
  const saleMutation = useMutation({
    mutationFn: async (opts?: { pendingOnly?: boolean }) => {
      const isPending = opts?.pendingOnly === true;
      if (cart.length === 0) throw new Error("Carrinho vazio");
      if (deliveryType === "entrega" && !deliveryAddress.trim()) throw new Error("Informe o endereço de entrega");
      if (isDeliveryMode && !customerName.trim() && !customerId) {
        throw new Error("O nome do cliente é obrigatório para pedidos de Delivery/WhatsApp.");
      }

      let saleId: string;
      const statusToSave = isPending ? "pending" : "completed";
      const notesToSave = isPending ? JSON.stringify(cart) : null;

      const saveOffline = async () => {
        if (isPending) throw new Error("Não é possível salvar mesa no modo offline.");

        const offlineId = crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}`;
        const now = new Date().toISOString();

        // Salva a venda no banco local
        await db.orders.add({
          id: offlineId,
          store_id: storeId,
          total,
          status: 'completed',
          origin: 'pdv',
          payment_method: paymentMethod,
          discount: discountValue,
          discount_type: discountType,
          customer_name: customerName.trim() || 'Consumidor Final',
          table_name: selectedTable ?? undefined,
          created_at: now,
          _sync_status: 'pending_insert'
        });

        // Salva os itens da venda no banco local
        const offlineItems = cart.map(i => ({
          id: crypto.randomUUID ? crypto.randomUUID() : `offline-item-${Date.now()}-${Math.random()}`,
          sale_id: offlineId,
          product_id: isValidUUID(i.product.id) ? i.product.id : undefined,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          subtotal: i.unitPrice * i.quantity,
          _sync_status: 'pending_insert' as const
        }));
        await db.order_items.bulkAdd(offlineItems);

        toast.info("📶 Conexão falhou — Venda salva localmente! Será sincronizada quando a conexão voltar.");
        return { id: offlineId, trackingUrl: undefined };
      };

      // ─── OFFLINE-FIRST: salva no Dexie se não tiver internet ────────────────
      if (!navigator.onLine) {
        return await saveOffline();
      }

      // ─── ONLINE: salva normalmente no Supabase ────────────────────────────
      try {
        if (pendingSaleId) {
          const { error: updateError } = await supabase
            .from("sales")
            .update({
              total,
              discount: discountValue,
              discount_type: discountType,
              payment_method: paymentMethod,
              status: statusToSave as any,
              notes: notesToSave
            })
            .eq("id", pendingSaleId);
          if (updateError) throw updateError;
          saleId = pendingSaleId;
        } else {
          const { data: sale, error: saleError } = await supabase
            .from("sales")
            .insert({
              store_id: storeId,
              user_id: profileId,
              table_name: selectedTable,
              total,
              discount: discountValue,
              discount_type: discountType,
              payment_method: paymentMethod,
              status: statusToSave as any,
              notes: notesToSave
            })
            .select("id")
            .single();
          if (saleError) throw saleError;
          saleId = sale.id;
        }

        if (!isPending) {
          const items = cart.map((i) => {
            const itemSubtotal = i.unitPrice * i.quantity;
            return {
              sale_id: saleId,
              product_id: isValidUUID(i.product.id) ? i.product.id : null,
              quantity: i.quantity,
              unit_price: i.unitPrice,
              subtotal: itemSubtotal,
            };
          });
          const { error: itemsError } = await supabase.from("sale_items").insert(items);
          if (itemsError) throw itemsError;
        }

        let trackingUrl: string | undefined;
        if (localStorage.getItem("pdv_tracking_qr") === "true" && isValidUUID(storeId)) {
          const { data: orderData, error: orderError } = await supabase
            .from("orders")
            .insert({
              store_id: storeId,
              customer_id: customerId || null,
              customer_name: customerName.trim() || "Cliente PDV",
              customer_phone: customerPhone.trim() || null,
              status: "preparing",
              total,
              payment_method: paymentMethod,
              origin: "pdv",
              delivery_type: deliveryType,
              delivery_address: deliveryType === "entrega" ? deliveryAddress.trim() : null,
            })
            .select("id")
            .single();
          if (!orderError && orderData) {
            trackingUrl = `${window.location.origin}/pedido/${orderData.id}`;
            const orderItems = cart.map((i) => ({
               order_id: orderData.id,
               product_id: isValidUUID(i.product.id) ? i.product.id : null,
               product_name: i.product.name,
               unit_price: i.unitPrice,
               quantity: i.quantity,
               subtotal: i.unitPrice * i.quantity,
               additionals: i.selectedAdditionals ?? []
            }));
            await supabase.from("order_items").insert(orderItems);
          } else if (orderError) {
            console.error("Erro ao gerar link de rastreio:", orderError);
            toast.error("Erro ao gerar link de rastreio: " + orderError.message);
          }
        }

        return { id: saleId, trackingUrl };
      } catch (err: any) {
        if (err.message === "Failed to fetch" || err.message?.includes("fetch")) {
          console.warn("Falha de rede ao tentar salvar online, recorrendo ao offline:", err);
          return await saveOffline();
        }
        throw err;
      }
    },
    onSuccess: (data, variables) => {
      const isPending = variables?.pendingOnly === true;
      if (isPending) {
         toast.success("Mesa salva com sucesso!");
         setCart([]);
         setSelectedTable(null);
         setPendingSaleId(null);
         refetchPending();
         return;
      }

      // Acumula compra no programa de fidelidade se houver cliente
      const loyaltyCfg = getLoyaltyPromoConfig(storeId);
      if (loyaltyCfg.enabled && (customerId || customerPhone.trim())) {
        const result = addCustomerPurchaseStamp(customerId || undefined, customerPhone.trim() || undefined, total, loyaltyCfg);
        if (result.wonReward) {
          toast.success(`🎉 Cliente completou a meta de fidelidade! Ganhou: ${loyaltyCfg.rewardDescription}`);
        }
      }

      toast.success("Venda finalizada com sucesso!");
      setCart([]);
      setDiscount(0);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerId("");
      setDeliveryType("local");
      setDeliveryAddress("");
      setDeliveryNotes("");
      setSaleCounter(c => c + 1);
      setSelectedTable(null);
      setPendingSaleId(null);
      refetchPending();
      refetchRecentSales();
      queryClient.invalidateQueries({ queryKey: ["store-customers"] });
      
      const newTicket: SaleTicket = {
        saleId: data?.id || `off-${Date.now()}`,
        senha: saleCounter,
        items: [...cart],
        subtotal,
        discountValue,
        total,
        paymentMethod,
        cashierName: profile?.full_name ?? user?.email ?? "Operador",
        storeName: store?.name ?? "Minha Loja",
        storeCnpj: (store as any)?.cnpj ?? "",
        storeAddress: (store as any)?.address ?? "",
        storeCity: (store as any)?.city ?? "",
        customerName,
        customerPhone,
        deliveryAddress,
        deliveryNotes,
        createdAt: new Date(),
        trackingUrl: data?.trackingUrl,
        sellerName: selectedSeller?.name,
        sellerCommission: selectedSeller?.commission,
      };

      // Salva registro de comissão no localStorage para relatório
      if (selectedSeller && data?.id) {
        const commissionsKey = "pdv_commissions";
        const existing = JSON.parse(localStorage.getItem(commissionsKey) || "[]");
        existing.push({
          saleId: data.id,
          sellerName: selectedSeller.name,
          commission: selectedSeller.commission,
          total,
          commissionValue: (total * selectedSeller.commission) / 100,
          date: new Date().toISOString(),
        });
        localStorage.setItem(commissionsKey, JSON.stringify(existing));
      }
      setSelectedSeller(null);
      setLastTicket(newTicket);
      setCupomOpen(true);
      
      // -- Impressão automática na cozinha --
      const kitchenPrinter = localStorage.getItem("pdv_printer_cozinha");
      if (kitchenPrinter) {
        // Mapeia os dados para o formato que a função de cozinha espera
        const kitchenOrder = {
          id: data.id,
          customer_name: customerName.trim() || "Cliente PDV",
          delivery_type: deliveryType,
          delivery_address: deliveryAddress,
          created_at: new Date().toISOString()
        };
        const kitchenItems = cart.map(i => ({
          quantity: i.quantity,
          product_name: i.product.name,
          additionals: i.selectedAdditionals ?? []
        }));
        
        const html = buildKitchenReceiptHtml(kitchenOrder, kitchenItems, store?.name ?? "Minha Loja");
        printToKitchen(html).then(ok => {
          if (ok) toast.success("🖨️ Comanda enviada para a cozinha!");
        });
      }

      // Limpa o modo de teste para a próxima venda (se estava ativado)
      if (localStorage.getItem("pdv_test_mode_once") === "true") {
        localStorage.removeItem("pdv_test_mode_once");
        toast.info("Modo de teste desativado. Próxima venda emitirá nota.");
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error("Erro na venda: " + e.message),
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const paymentMethods = [
    { value: "cash", label: "Dinheiro", icon: Banknote },
    { value: "credit", label: "Crédito", icon: CreditCard },
    { value: "debit", label: "Débito", icon: CreditCard },
    { value: "pix", label: "PIX", icon: QrCode },
  ];

  const tablesEnabled = !isDeliveryMode && ((store?.table_count || 0) > 0 || store?.has_counters);

  if (tablesEnabled && !selectedTable) {
    const renderBoxes = (prefix: string, count: number) => {
      return Array.from({ length: count }).map((_, i) => {
        const name = `${prefix} ${i + 1}`;
        const pendingSale = pendingSales.find(s => s.table_name === name);
        const isOccupied = !!pendingSale; 
        return (
          <Button 
            key={name}
            variant={isOccupied ? "default" : "outline"}
            className={`h-32 text-xl font-bold flex flex-col gap-2 ${isOccupied ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300'}`}
            onClick={() => {
              setSelectedTable(name);
              if (pendingSale) {
                setPendingSaleId(pendingSale.id);
                try {
                  if (pendingSale.notes) {
                    const loadedCart = JSON.parse(pendingSale.notes);
                    setCart(loadedCart);
                  }
                } catch (e) {
                  console.error("Erro ao carregar carrinho salvo", e);
                  setCart([]);
                }
              } else {
                setPendingSaleId(null);
                setCart([]);
              }
            }}
          >
            <span>{name}</span>
            {isOccupied && <span className="text-sm font-normal bg-red-800 px-2 py-1 rounded">R$ {pendingSale.total?.toFixed(2)}</span>}
          </Button>
        );
      });
    };

    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold font-['Space_Grotesk']">Visão Geral do Salão</h2>
        </div>
        
        {(store?.table_count || 0) > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2 text-gray-700">Mesas Disponíveis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {renderBoxes("Mesa", store?.table_count || 0)}
            </div>
          </div>
        )}

        {store?.has_counters && (store?.counter_count || 0) > 0 && (
          <div className="space-y-4 mt-8">
            <h3 className="text-lg font-semibold border-b pb-2 text-gray-700">Balcões</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {renderBoxes("Balcão", store?.counter_count || 0)}
            </div>
          </div>
        )}

        <CupomModal
          ticket={lastTicket}
          open={cupomOpen}
          onClose={() => setCupomOpen(false)}
        />
      </div>
    );
  }

  return (
    <>
      {selectedTable && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-lg text-blue-800 shadow-sm">
          <span className="font-bold text-lg flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5" />
            Atendendo: {selectedTable}
          </span>
          <Button variant="outline" size="sm" onClick={() => {
            setSelectedTable(null);
            setCart([]);
          }}>
            Voltar para Visão do Salão
          </Button>
        </div>
      )}
      <div className={`flex flex-col lg:flex-row gap-4 ${selectedTable ? 'h-[calc(100vh-12rem)]' : 'h-[calc(100vh-8rem)]'}`}>
        {/* Left: Product search & grid */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Buscar produto por nome ou código de barras..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                refetchRecentSales();
                setHistoryModalOpen(true);
              }}
              className="h-12 px-4 gap-2 border-primary/30 hover:bg-primary/10 text-primary font-semibold shrink-0"
              title="Ver histórico de vendas do PDV e cancelamento/estorno"
            >
              <History className="h-5 w-5" />
              <span className="hidden sm:inline">Histórico / Cancelar Venda</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="flex flex-col p-0 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-colors text-left overflow-hidden relative"
                >
                  {(p as any).image_url ? (
                    <div className="w-full h-24 sm:h-28 bg-muted shrink-0 border-b border-border/50">
                      <img src={(p as any).image_url} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-24 sm:h-28 bg-muted/30 shrink-0 flex items-center justify-center border-b border-border/50">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="p-3 flex flex-col flex-1 w-full">
                    <span className="font-medium text-sm line-clamp-2">{p.name}</span>
                    <div className="flex gap-2 mt-0.5">
                      {p.barcode && (
                        <span className="text-xs text-muted-foreground">{p.barcode}</span>
                      )}
                      {(p as any).unit && (p as any).unit !== "UN" && (
                        <span className="text-[10px] text-blue-600 font-semibold">{(p as any).unit}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between w-full mt-auto pt-2">
                      <span className="text-sm font-bold text-primary">
                        {formatCurrency(p.price)}
                      </span>
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        {p.stock_display} {(p as any).unit ?? "un"}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full flex items-center justify-center py-12 text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <Card className="w-full lg:w-[420px] xl:w-[450px] flex flex-col lg:max-h-full shrink-0 shadow-md">
          <CardHeader className="pb-2.5 pt-3.5 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Carrinho
                {cart.length > 0 && (
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                    {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'itens'}
                  </Badge>
                )}
              </CardTitle>
              {cart.length > 0 && (
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(true)} className="h-8 px-2 text-xs text-primary hover:bg-primary/10 font-medium">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearCart} className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 font-medium">
                    <X className="h-3.5 w-3.5 mr-1" /> Limpar
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col gap-3 p-3 sm:p-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2.5">
                  <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center">
                    <Receipt className="h-6 w-6 opacity-60" />
                  </div>
                  <p className="text-sm font-medium">Carrinho vazio</p>
                  <p className="text-xs text-muted-foreground/80">Clique em um produto ao lado para adicionar</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div 
                    key={item.cartItemId} 
                    className="p-2.5 rounded-lg border border-border/80 bg-card hover:border-primary/40 transition-all shadow-xs space-y-1.5"
                  >
                    {/* Linha 1: Nome do produto e Total do Item */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">
                        {item.product.name}
                      </p>
                      <span className="text-xs font-bold text-emerald-600 shrink-0 text-right">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>

                    {/* Linha 2: Preço Unitário & Controles de Quantidade */}
                    <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border/40">
                      <div className="text-[11px] text-muted-foreground font-medium">
                        {fmtQty(item.quantity)} {(item.product as any).unit ?? "un"} × {formatCurrency(item.unitPrice)}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-6 w-6 rounded-md hover:bg-muted" 
                          onClick={() => updateQty(item.cartItemId, -1)}
                          title="Diminuir"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="min-w-6 text-center text-xs font-bold px-1 text-foreground">
                          {fmtQty(item.quantity)}
                        </span>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-6 w-6 rounded-md hover:bg-muted" 
                          onClick={() => updateQty(item.cartItemId, 1)}
                          title="Aumentar"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10 ml-0.5" 
                          onClick={() => removeFromCart(item.cartItemId)}
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Adicionais se houver */}
                    {item.selectedAdditionals && item.selectedAdditionals.length > 0 && (
                      <div className="text-[10px] text-muted-foreground pl-1.5 border-l-2 border-primary/40 mt-1 bg-muted/30 py-0.5 rounded-r">
                        + {item.selectedAdditionals.map(a => a.name).join(", ")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <>
                <Separator />

                {/* Discount */}
                <div className="flex items-center gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "fixed" | "percent")}>
                    <SelectTrigger className="w-24 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">
                        <div className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> R$</div>
                      </SelectItem>
                      <SelectItem value="percent">
                        <div className="flex items-center gap-1"><Percent className="h-3 w-3" /> %</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="Desconto"
                    value={discount || ""}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>

                {/* Payment method */}
                <div className="grid grid-cols-4 gap-1.5">
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.value}
                      onClick={() => setPaymentMethod(pm.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${paymentMethod === pm.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                        }`}
                    >
                      <pm.icon className="h-4 w-4" />
                      {pm.label}
                    </button>
                  ))}
                </div>

                {/* Totals */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discountValue > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Desconto</span>
                      <span>-{formatCurrency(discountValue)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Dados do Cliente e Entrega */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex gap-2">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <Input 
                        placeholder="Nome do Cliente (Opcional)" 
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input 
                        placeholder="Telefone (Opcional)" 
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      className="h-8 shrink-0 px-3 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border-blue-200"
                      onClick={() => setCustomerSearchModalOpen(true)}
                    >
                      <Search className="h-4 w-4 mr-1" />
                      Buscar
                    </Button>
                  </div>

                  {/* Banner de Fidelidade do Cliente Selecionado */}
                  {(() => {
                    const loyaltyCfg = getLoyaltyPromoConfig(storeId);
                    if (!loyaltyCfg.enabled || (!customerId && !customerPhone.trim())) return null;

                    const purchasesCount = getCustomerPurchasesCount(customerId || undefined, customerPhone.trim() || undefined);
                    const target = loyaltyCfg.targetPurchases || 10;
                    const hasReward = purchasesCount >= target;

                    const handleApplyReward = () => {
                      if (loyaltyCfg.rewardType === "fixed_discount") {
                        setDiscountType("fixed");
                        setDiscount(loyaltyCfg.rewardValue || 0);
                      } else if (loyaltyCfg.rewardType === "percent_discount") {
                        setDiscountType("percent");
                        setDiscount(loyaltyCfg.rewardValue || 0);
                      }
                      // Subtrai a meta ou reseta selos
                      setCustomerPurchasesCount(customerId || undefined, customerPhone.trim() || undefined, purchasesCount - target);
                      toast.success(`🎁 Prêmio "${loyaltyCfg.rewardDescription}" aplicado ao pedido!`);
                    };

                    return (
                      <div className="p-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-300 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                          <div className="truncate">
                            <span className="font-bold text-amber-950 block truncate">{loyaltyCfg.name}:</span>
                            <span className="text-[10px] text-amber-900 font-medium">
                              {purchasesCount} de {target} compras acumuladas
                            </span>
                          </div>
                        </div>

                        {hasReward ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 animate-bounce shadow-sm gap-1 px-2.5"
                            onClick={handleApplyReward}
                          >
                            <Gift className="h-3.5 w-3.5" />
                            Aplicar Prêmio!
                          </Button>
                        ) : (
                          <span className="text-[10px] font-bold bg-white border border-amber-200 text-amber-900 px-2 py-0.5 rounded shrink-0">
                            Faltam {target - purchasesCount}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const hasTables = Boolean(store?.table_count && Number(store.table_count) > 0);
                    return (
                      <div className={`grid ${hasTables ? "grid-cols-3" : "grid-cols-2"} gap-1`}>
                        {hasTables && (
                          <button 
                              onClick={() => setDeliveryType("local")}
                              className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "local" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                          >
                              Mesa
                          </button>
                        )}
                        <button 
                            onClick={() => setDeliveryType("retirada")}
                            className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "retirada" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                        >
                            Loja
                        </button>
                        <button 
                            onClick={() => setDeliveryType("entrega")}
                            className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "entrega" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                        >
                            Entrega
                        </button>
                      </div>
                    );
                  })()}
                  {deliveryType === "entrega" && (
                    <>
                      <Input 
                        placeholder="Endereço de Entrega Completo" 
                        value={deliveryAddress}
                        onChange={e => setDeliveryAddress(e.target.value)}
                        className="h-8 text-xs"
                        required={deliveryType === "entrega"}
                      />
                      <Input 
                        placeholder="Observações de entrega (opcional)" 
                        value={deliveryNotes}
                        onChange={e => setDeliveryNotes(e.target.value)}
                        className="h-8 text-xs mt-1"
                      />
                    </>
                  )}
                </div>

                {/* Seletor de Vendedora */}
                {sellers.length > 0 && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendedora</label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedSeller?.name ?? ""}
                      onChange={(e) => {
                        const found = sellers.find(s => s.name === e.target.value) || null;
                        setSelectedSeller(found);
                      }}
                    >
                      <option value="">— Sem vendedora —</option>
                      {sellers.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.commission}%)
                        </option>
                      ))}
                    </select>
                    {selectedSeller && (
                      <p className="text-xs text-emerald-600 mt-1">
                        Comissão: R$ {((total * selectedSeller.commission) / 100).toFixed(2)}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 mt-2"
                  onClick={() => saleMutation.mutate({})}
                  disabled={cart.length === 0 || saleMutation.isPending}
                >
                  Finalizar Venda
                </Button>
                {selectedTable && (
                  <Button
                    className="w-full h-14 text-lg font-bold bg-amber-500 hover:bg-amber-600 mt-2 text-white"
                    onClick={() => saleMutation.mutate({ pendingOnly: true })}
                    disabled={cart.length === 0 || saleMutation.isPending}
                  >
                    Salvar Pedido (Pendente)
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cupom Modal */}
      <CupomModal
        ticket={lastTicket}
        open={cupomOpen}
        onClose={() => setCupomOpen(false)}
      />

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar Itens da Venda</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
            {cart.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum item na venda.</p>
            ) : (
              cart.map((item) => (
                <div key={item.cartItemId} className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border">
                  {/* Linha superior: Nome do Produto e Botão Apagar */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base">{item.product.name}</p>
                      {item.selectedAdditionals && item.selectedAdditionals.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          + {item.selectedAdditionals.map(a => a.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 hover:bg-destructive/10 shrink-0 -mt-1 -mr-1" onClick={() => removeFromCart(item.cartItemId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Linha inferior: Preço, Quantidade e Total */}
                  <div className="flex items-end justify-between gap-2 pt-2 border-t border-border/50">
                    <div className="flex flex-col gap-1.5 w-28">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Preço Un. (R$)</Label>
                      <Input 
                        type="number" 
                        className="h-9 font-medium" 
                        value={item.unitPrice === 0 ? '' : item.unitPrice}
                        onChange={(e) => updateItemPrice(item.cartItemId, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 items-center">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Qtd.</Label>
                      <div className="flex items-center gap-1 bg-background rounded-md border h-9 px-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm hover:bg-muted" onClick={() => updateQty(item.cartItemId, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-10 text-center text-sm font-semibold">{fmtQty(item.quantity)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm hover:bg-muted" onClick={() => updateQty(item.cartItemId, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 items-end min-w-[80px]">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total (R$)</Label>
                      <span className="text-lg font-bold text-emerald-600 leading-9">{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Options Modal */}
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedProduct?.name}</DialogTitle>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-6 py-2">
              {/* Peso / Quantidade */}
              {((selectedProduct as any).unit === "KG" || (selectedProduct as any).unit === "G" || (selectedProduct as any).unit === "L") && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Quantidade ({(selectedProduct as any).unit})</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      className="text-lg h-12"
                      value={modalQty}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalQty(val);
                        if (val && !isNaN(Number(val))) {
                          setModalPrice((Number(val) * selectedProduct.price).toFixed(2));
                        } else {
                          setModalPrice("");
                        }
                      }}
                      placeholder={`Ex: 0.500`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="text-lg h-12"
                      value={modalPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalPrice(val);
                        if (val && !isNaN(Number(val)) && selectedProduct.price > 0) {
                          setModalQty((Number(val) / selectedProduct.price).toFixed(3));
                        } else {
                          setModalQty("");
                        }
                      }}
                      placeholder={`Ex: 20.00`}
                    />
                  </div>
                </div>
              )}

              {/* Adicionais */}
              {(selectedProduct as any).has_additionals && productAdditionals.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <Label className="text-base">Acompanhamentos</Label>
                      {(selectedProduct as any).max_additionals > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Escolha até {(selectedProduct as any).max_additionals} {(selectedProduct as any).max_additionals === 1 ? "opção" : "opções"}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[11px] font-bold">
                      {selectedAdds.length} / {(selectedProduct as any).max_additionals || "∞"}
                    </Badge>
                  </div>
                  <div className="grid gap-2 max-h-60 overflow-y-auto pr-1">
                    {productAdditionals.map((add) => {
                      const isSelected = selectedAdds.some((a) =>
                        add.id ? a.id === add.id : a.name === add.name
                      );
                      const maxReached = (selectedProduct as any).max_additionals > 0 && 
                                       selectedAdds.length >= (selectedProduct as any).max_additionals;

                      return (
                        <div
                          key={add.id}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected 
                              ? "border-primary bg-primary/5" 
                              : maxReached 
                                ? "opacity-50 grayscale cursor-not-allowed" 
                                : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedAdds(prev => prev.filter((a) =>
                                add.id ? a.id !== add.id : a.name !== add.name
                              ));
                            } else {
                              if (maxReached) {
                                toast.error(`Você só pode escolher até ${(selectedProduct as any).max_additionals} acompanhamentos.`);
                                return;
                              }
                              setSelectedAdds(prev => [...prev, add]);
                            }
                          }}
                        >
                          <span className={isSelected ? "font-semibold" : ""}>{add.name}</span>
                          <span className="text-sm font-medium text-muted-foreground">
                            {add.price > 0 ? `+ ${formatCurrency(add.price)}` : "Grátis"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Botão Salvar */}
              <Button
                className="w-full h-12 text-base"
                onClick={() => {
                  const qtyNum = parseFloat(modalQty as string);
                  if (isNaN(qtyNum) || qtyNum <= 0) {
                    toast.error("Informe uma quantidade/peso válido.");
                    return;
                  }
                  
                  // Calcula preço final: soma o preço de todos os adicionais selecionados
                  const extraPrice = selectedAdds.reduce((sum: number, add: any) => sum + (add.price || 0), 0);

                  const finalUnitPrice = selectedProduct.price + extraPrice;
                  addToCart(selectedProduct, qtyNum, selectedAdds, finalUnitPrice);
                }}
              >
                Adicionar ao Carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {customerSearchModalOpen && (
        <CustomerSearchModal
          isOpen={customerSearchModalOpen}
          onClose={() => setCustomerSearchModalOpen(false)}
          storeId={store?.id || ""}
          onSelectCustomer={(customer) => {
            setCustomerName(customer.name || "");
            setCustomerPhone(customer.phone || "");
            setCustomerId(customer.id);
            if (customer.address) {
              setDeliveryAddress(customer.address);
            }
          }}
          onNewCustomer={() => setCustomerFormModalOpen(true)}
        />
      )}

      {customerFormModalOpen && (
        <ClienteFormModal
          isOpen={customerFormModalOpen}
          onClose={() => setCustomerFormModalOpen(false)}
          storeId={store?.id || ""}
          customer={null}
        />
      )}

      {/* ═══ Modal: Histórico de Vendas & Cancelamento ═══ */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <History className="h-6 w-6 text-primary" />
              Histórico de Vendas do PDV & Cancelamento
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por código da venda (ID) ou forma de pagamento..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchRecentSales()} className="h-10 gap-1.5">
              <RotateCcw className="h-4 w-4" /> Atualizar
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-xl divide-y">
            {loadingSales ? (
              <div className="p-8 text-center text-muted-foreground">Carregando histórico de vendas...</div>
            ) : recentSales.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma venda recente encontrada.</div>
            ) : (
              recentSales
                .filter((s: any) => {
                  if (!historySearch.trim()) return true;
                  const query = historySearch.toLowerCase();
                  return (
                    s.id.toLowerCase().includes(query) ||
                    (s.payment_method && s.payment_method.toLowerCase().includes(query)) ||
                    (s.notes && s.notes.toLowerCase().includes(query))
                  );
                })
                .map((sale: any) => {
                  const isCancelled = sale.status === "cancelled";
                  const itemsCount = sale.sale_items?.length || 0;
                  const saleDate = new Date(sale.created_at).toLocaleString("pt-BR");

                  return (
                    <div
                      key={sale.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        isCancelled ? "bg-red-50/50 hover:bg-red-50" : "bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base">
                            Venda #{sale.id.slice(-6).toUpperCase()}
                          </span>
                          {isCancelled ? (
                            <Badge variant="destructive" className="flex items-center gap-1 font-semibold">
                              <Ban className="h-3 w-3" /> CANCELADA
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700">CONCLUÍDA</Badge>
                          )}
                          <span className="text-xs text-muted-foreground font-mono">{saleDate}</span>
                        </div>

                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            <strong>Pagamento:</strong> {paymentLabel[sale.payment_method] ?? sale.payment_method?.toUpperCase()}
                          </span>
                          <span>
                            <strong>Itens:</strong> {itemsCount} {itemsCount === 1 ? "produto" : "produtos"}
                          </span>
                          {sale.notes && (
                            <span className="text-amber-700 italic">
                              {sale.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <div className="text-right">
                          <span className={`text-lg font-bold block ${isCancelled ? "line-through text-muted-foreground" : "text-emerald-600"}`}>
                            R$ {Number(sale.total).toFixed(2).replace(".", ",")}
                          </span>
                        </div>

                        {!isCancelled && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSaleToCancel(sale);
                              setCancelReasonInput("");
                            }}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 gap-1.5 h-9"
                          >
                            <Ban className="h-4 w-4" /> Cancelar Venda
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Submodal interno de confirmação dentro do mesmo Dialog (Zero conflito de foco) */}
          {selectedSaleToCancel && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 rounded-lg">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2 text-red-600 font-bold text-lg">
                    <AlertTriangle className="h-5 w-5" />
                    <span>Cancelar / Estornar Venda</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSaleToCancel(null)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-800 space-y-1">
                  <p className="font-bold">Atenção:</p>
                  <p>
                    A venda <strong>#{selectedSaleToCancel.id.slice(-6).toUpperCase()}</strong> no valor de{" "}
                    <strong>R$ {Number(selectedSaleToCancel.total).toFixed(2).replace(".", ",")}</strong> será cancelada.
                  </p>
                  <p>Os itens vendidos retornarão automaticamente ao estoque da loja.</p>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-1.5 block">Motivo do cancelamento (opcional):</Label>
                  <Input
                    placeholder="Ex: Desistência do cliente, erro de digitação, devolução..."
                    value={cancelReasonInput}
                    onChange={(e) => setCancelReasonInput(e.target.value)}
                    className="h-10"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 justify-end pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedSaleToCancel(null)}
                    disabled={cancelSaleMutation.isPending}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5"
                    disabled={cancelSaleMutation.isPending}
                    onClick={() =>
                      cancelSaleMutation.mutate({
                        saleId: selectedSaleToCancel.id,
                        reason: cancelReasonInput,
                        items: selectedSaleToCancel.sale_items,
                      })
                    }
                  >
                    {cancelSaleMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
