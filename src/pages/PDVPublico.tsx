import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
    ShoppingCart, Search, Plus, Minus, Trash2, CreditCard,
    Banknote, QrCode, Receipt, Percent, DollarSign, X,
    CheckCircle2, Printer, Store, UtensilsCrossed,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Product = Tables<"products">;

interface CartItem {
    cartItemId: string;
    product: Product;
    quantity: number;
    additionals: { name: string; price: number }[];
    unitPrice: number;
}

interface SaleTicket {
    saleId: string;
    senha: number;
    items: CartItem[];
    subtotal: number;
    discountValue: number;
    total: number;
    paymentMethod: string;
    storeName: string;
    createdAt: Date;
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const paymentLabel: Record<string, string> = {
    cash: "DINHEIRO",
    credit: "CARTÃO CRÉDITO",
    debit: "CARTÃO DÉBITO",
    pix: "PIX",
};

// ─── Cupom Simples ───────────────────────────────────────────────────────────
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

    const handlePrint = () => {
        const content = printRef.current;
        if (!content) return;
        const w = window.open("", "_blank", "width=400,height=700");
        if (!w) return;
        w.document.write(`
      <html><head><title>Cupom</title>
      <style>
        @page { size: 80mm auto; margin: 0mm; }
        *, *::before, *::after { box-sizing: border-box !important; color: #000000 !important; }
        html, body { 
          margin: 0 auto !important; 
          padding: 0 !important; 
          width: 100% !important;
          max-width: 72mm !important;
          font-family: 'Courier New', Courier, monospace !important; 
          font-size: 10px !important; 
          line-height: 1.25 !important; 
          color: #000 !important; 
          background: #fff !important;
        }
      </style></head>
      <body>
        <div style="width: 100%; max-width: 72mm; margin: 0 auto; padding: 2px 4px;">
          ${content.innerHTML}
        </div>
      </body></html>
    `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 300);
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
                <div
                    ref={printRef}
                    className="bg-white text-black font-mono text-[11px] leading-tight p-4 border rounded-lg"
                >
                    <div className="text-center space-y-0.5 mb-2">
                        <p className="text-[15px] font-bold tracking-widest">
                            SENHA: {String(ticket.senha).padStart(3, "0")}
                        </p>
                        <p className="font-bold text-[12px]">{ticket.storeName}</p>
                        <p className="text-[10px]">{ticket.createdAt.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="border-t border-dashed border-black my-1" />
                    {ticket.items.map((item, idx) => (
                        <div key={item.cartItemId} className="mb-1">
                            <div className="flex justify-between text-[10px]">
                                <span className="w-8">{String(idx + 1).padStart(3, "0")}</span>
                                <span className="flex-1 truncate">{item.product.name}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="w-12">{item.quantity} {(item.product as any).unit ?? "Und"}</span>
                                <span>{fmt(item.unitPrice)}</span>
                                <span className="font-bold">{fmt(item.unitPrice * item.quantity)}</span>
                            </div>
                            {item.additionals && item.additionals.length > 0 && (
                                <div className="text-[9px] text-gray-600 pl-8 italic">
                                    + {item.additionals.map(a => a.name).join(", ")}
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="border-t border-dashed border-black my-1" />
                    <div className="text-[11px] space-y-0.5">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{fmt(ticket.subtotal)}</span>
                        </div>
                        {ticket.discountValue > 0 && (
                            <div className="flex justify-between">
                                <span>Desconto</span>
                                <span>-{fmt(ticket.discountValue)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold">
                            <span>TOTAL</span>
                            <span>{fmt(ticket.total)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Pagamento</span>
                            <span>{paymentLabel[ticket.paymentMethod] ?? ticket.paymentMethod.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handlePrint} className="flex-1 gap-2 bg-gray-900 hover:bg-gray-700">
                        <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                    <Button onClick={onClose} variant="outline" className="flex-1">
                        Nova Venda
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── PDV Público Principal ────────────────────────────────────────────────────
export default function PDVPublico() {
    const { storeId } = useParams<{ storeId: string }>();
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [cartOpen, setCartOpen] = useState(false);
    const [cupomOpen, setCupomOpen] = useState(false);
    const [lastTicket, setLastTicket] = useState<SaleTicket | null>(null);
    const [saleCounter, setSaleCounter] = useState(1);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [deliveryType, setDeliveryType] = useState<"local" | "retirada" | "entrega">("local");
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    // Modal de Produto (Peso e Adicionais)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [productModalOpen, setProductModalOpen] = useState(false);
    const [modalQty, setModalQty] = useState<number | string>(1);
    const [modalPrice, setModalPrice] = useState<number | string>("");
    const [selectedAdds, setSelectedAdds] = useState<any[]>([]);

    useEffect(() => { searchRef.current?.focus(); }, []);

    // Store info
    const { data: store } = useQuery({
        queryKey: ["store-public", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("stores")
                .select("*")
                .eq("id", storeId!)
                .single();
            if (error) throw error;
            return data;
        },
    });

    // Configuração de Impostos (Reforma 2026)
    const { data: taxConfig } = useQuery({
        queryKey: ["store_tax_config_public", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("store_tax_config")
                .select("*")
                .eq("store_id", storeId!)
                .maybeSingle();
            if (error) throw error;
            return data || { cbs_rate: 0.9, ibs_rate: 0.1 };
        },
    });

    // Products
    const { data: products = [], isLoading } = useQuery({
        queryKey: ["products-public", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products")
                .select("*")
                .eq("store_id", storeId!)
                .eq("active", true)
                .order("name");
            if (error) throw error;
            return data as Product[];
        },
    });

    // Additionals
    const { data: productAdditionals = [] } = useQuery({
        queryKey: ["product_additionals_public_pdv", selectedProduct?.id],
        enabled: !!selectedProduct && !!(selectedProduct as any).has_additionals,
        queryFn: async () => {
            if ((selectedProduct as any).additionals_data) {
                return (selectedProduct as any).additionals_data;
            }
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

    const filtered = useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase();
        return products.filter(
            (p) =>
                p.name.toLowerCase().includes(q) ||
                p.barcode?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q)
        );
    }, [products, search]);

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
            const addsStr = JSON.stringify(adds);
            const existing = prev.find((i) => i.product.id === product.id && JSON.stringify(i.additionals) === addsStr);
            if (existing) {
                if (existing.quantity + quantity > product.stock_display) {
                    toast.error("Estoque insuficiente");
                    return prev;
                }
                return prev.map((i) =>
                    i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + quantity } : i
                );
            }
            if (quantity > product.stock_display) {
                toast.error("Produto sem estoque");
                return prev;
            }
            return [...prev, { cartItemId: Math.random().toString(36).substring(7), product, quantity, additionals: adds, unitPrice }];
        });
        setProductModalOpen(false);
        toast.success(`${product.name} adicionado!`, { duration: 1000 });
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

    const removeFromCart = (cartItemId: string) =>
        setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));

    const clearCart = () => { setCart([]); setDiscount(0); };

    const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const discountValue = discountType === "percent" ? subtotal * (discount / 100) : discount;
    const total = Math.max(0, subtotal - discountValue);
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    // Finalize sale (Order + Sale)
    const saleMutation = useMutation({
        mutationFn: async () => {
            if (cart.length === 0) throw new Error("Carrinho vazio");
            if (!storeId) throw new Error("Loja não encontrada");
            if (!customerName.trim()) throw new Error("Informe o nome do cliente");
            if (deliveryType === "entrega" && !deliveryAddress.trim()) throw new Error("Informe o endereço de entrega");

            // 1. Cria o pedido na tabela orders (para aparecer na aba Pedidos)
            const { data: order, error: orderError } = await supabase
                .from("orders")
                .insert({
                    store_id: storeId,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    total,
                    payment_method: paymentMethod,
                    status: "accepted", // Auto-aceito pois é feito por atendente
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    origin: "public_pdv",
                    delivery_type: deliveryType,
                    delivery_address: deliveryType === "entrega" ? deliveryAddress.trim() : null,
                })
                .select("id")
                .single();
            
            if (orderError) throw orderError;

            const orderItems = cart.map((i) => ({
                order_id: order.id,
                product_id: i.product.id,
                product_name: i.product.name,
                unit_price: i.unitPrice,
                quantity: i.quantity,
                subtotal: i.unitPrice * i.quantity,
                additionals: i.additionals || [],
            }));
            
            const { error: itemsError } = await (supabase as any).from("order_items").insert(orderItems);
            if (itemsError) throw itemsError;

            // 2. Também registra na tabela de sales para relatórios e NFe
            const { data: sale, error: saleError } = await supabase
                .from("sales")
                .insert({
                    store_id: storeId,
                    total,
                    discount: discountValue,
                    discount_type: discountType,
                    payment_method: paymentMethod,
                    status: "completed",
                    notes: `Pedido: ${customerName}`,
                })
                .select("id")
                .single();
            
            if (!saleError) {
                const saleItems = cart.map((i) => {
                    const itemSubtotal = i.unitPrice * i.quantity;
                    const itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * discountValue : 0;
                    const ibsCbsBase = Math.max(0, itemSubtotal - itemDiscount);

                    const cbsRate = Number(taxConfig?.cbs_rate ?? 0.9);
                    const ibsRate = Number(taxConfig?.ibs_rate ?? 0.1);

                    return {
                        sale_id: sale.id,
                        product_id: i.product.id,
                        quantity: i.quantity,
                        unit_price: i.unitPrice,
                        subtotal: itemSubtotal,
                        ibs_cbs_base: ibsCbsBase,
                        aliquota_cbs: cbsRate,
                        valor_cbs: Number((ibsCbsBase * (cbsRate / 100)).toFixed(2)),
                        aliquota_ibs: ibsRate,
                        valor_ibs: Number((ibsCbsBase * (ibsRate / 100)).toFixed(2)),
                    };
                });
                await supabase.from("sale_items").insert(saleItems);
            }

            return order;
        },
        onSuccess: (order) => {
            const ticket: SaleTicket = {
                saleId: order.id,
                senha: saleCounter,
                items: [...cart],
                subtotal,
                discountValue,
                total,
                paymentMethod,
                storeName: store?.name ?? "Loja",
                createdAt: new Date(),
            };
            setLastTicket(ticket);
            setSaleCounter((n) => n + 1);
            setCupomOpen(true);
            setCartOpen(false);
            setCustomerName("");
            setCustomerPhone("");
            clearCart();
        },
        onError: (e) => toast.error("Erro no pedido: " + e.message),
    });

    const paymentMethods = [
        { value: "cash", label: "Dinheiro", icon: Banknote },
        { value: "credit", label: "Crédito", icon: CreditCard },
        { value: "debit", label: "Débito", icon: CreditCard },
        { value: "pix", label: "PIX", icon: QrCode },
    ];

    // Group by category
    const categories = useMemo(() => {
        const cats = new Map<string, Product[]>();
        filtered.forEach((p) => {
            const cat = p.category || "Outros";
            if (!cats.has(cat)) cats.set(cat, []);
            cats.get(cat)!.push(p);
        });
        return cats;
    }, [filtered]);

    if (!storeId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center space-y-2">
                    <Store className="h-12 w-12 text-gray-300 mx-auto" />
                    <p className="text-gray-500">Link inválido. ID da loja não encontrado.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Store className="h-6 w-6 text-primary" />
                        <span className="font-bold text-lg font-['Space_Grotesk'] truncate max-w-[180px] sm:max-w-none">
                            {store?.name ?? "Carregando..."}
                        </span>
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-md hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            placeholder="Buscar produto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* Cart button */}
                    <button
                        onClick={() => setCartOpen(true)}
                        className="relative flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
                    >
                        <ShoppingCart className="h-4 w-4" />
                        <span className="hidden sm:inline">Carrinho</span>
                        {cartCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                                {cartCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Mobile search */}
                <div className="sm:hidden px-4 pb-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar produto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
            </header>

            {/* Products */}
            <main className="max-w-5xl mx-auto px-4 py-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                        Carregando produtos...
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Store className="h-12 w-12 opacity-30" />
                        <p>Nenhum produto disponível no momento.</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Search className="h-12 w-12 opacity-30" />
                        <p>Nenhum produto encontrado para "{search}"</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Array.from(categories.entries()).map(([cat, prods]) => (
                            <div key={cat}>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                    <span className="h-px flex-1 bg-border" />
                                    {cat}
                                    <span className="h-px flex-1 bg-border" />
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {prods.map((p) => {
                                        const inCart = cart.find((i) => i.product.id === p.id);
                                        const outOfStock = p.stock_display <= 0;
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const imageUrl = (p as any).image_url;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => !outOfStock && handleProductClick(p)}
                                                disabled={outOfStock}
                                                className={`relative flex flex-col items-start p-3 rounded-xl border bg-white text-left transition-all shadow-sm
                          ${outOfStock
                                                        ? "opacity-50 cursor-not-allowed"
                                                        : "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 cursor-pointer"
                                                    }
                          ${inCart ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}
                        `}
                                            >
                                                {inCart && (
                                                    <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center z-10 shadow-sm">
                                                        {inCart.quantity}
                                                    </span>
                                                )}
                                                {outOfStock && (
                                                    <span className="absolute top-2 left-2 bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded z-10 shadow-sm">
                                                        Esgotado
                                                    </span>
                                                )}
                                                {imageUrl ? (
                                                    <div className="w-full mb-2 h-24 sm:h-32 shrink-0 rounded-lg overflow-hidden bg-muted">
                                                        <img src={imageUrl} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-full mb-2 h-24 sm:h-32 shrink-0 rounded-lg bg-muted border flex items-center justify-center">
                                                        <UtensilsCrossed className="h-8 w-8 text-muted-foreground/30" />
                                                    </div>
                                                )}
                                                <span className="font-medium text-sm line-clamp-2 mt-1 w-full">{p.name}</span>
                                                {p.barcode && (
                                                    <span className="text-xs text-muted-foreground mt-0.5 font-mono w-full truncate">{p.barcode}</span>
                                                )}
                                                <div className="flex items-center justify-between w-full mt-2">
                                                    <span className="text-base font-bold text-primary">{fmt(p.price)}</span>
                                                    {!outOfStock && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {p.stock_display} un
                                                        </Badge>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Cart Sidebar / Drawer */}
            {cartOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                        onClick={() => setCartOpen(false)}
                    />
                    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
                        {/* Cart Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5" />
                                Carrinho
                                {cartCount > 0 && (
                                    <Badge variant="secondary">{cartCount}</Badge>
                                )}
                            </h2>
                            <div className="flex items-center gap-2">
                                {cart.length > 0 && (
                                    <button
                                        onClick={clearCart}
                                        className="text-xs text-destructive hover:underline flex items-center gap-1"
                                    >
                                        <X className="h-3 w-3" /> Limpar
                                    </button>
                                )}
                                <button onClick={() => setCartOpen(false)} className="p-1 rounded hover:bg-muted">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Cart Items */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                                    <Receipt className="h-12 w-12 opacity-30" />
                                    <p className="text-sm">Carrinho vazio</p>
                                </div>
                            ) : (
                                cart.map((item) => (
                                    <div key={item.cartItemId} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{item.product.name}</p>
                                                <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} × {item.quantity} {(item.product as any).unit ?? "un"}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => updateQty(item.cartItemId, -1)}
                                                    className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateQty(item.cartItemId, 1)}
                                                    className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                                <button
                                                    onClick={() => removeFromCart(item.cartItemId)}
                                                    className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <span className="text-sm font-bold w-20 text-right">
                                                {fmt(item.unitPrice * item.quantity)}
                                            </span>
                                        </div>
                                        {item.additionals && item.additionals.length > 0 && (
                                            <div className="text-xs text-muted-foreground pl-1 border-l-2 border-border ml-1 mt-1">
                                                + {item.additionals.map(a => a.name).join(", ")}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Cart Footer */}
                        {cart.length > 0 && (
                            <div className="border-t p-4 space-y-4">
                                {/* Customer Info */}
                                <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Identificação do Pedido</p>
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Seu Nome (Obrigatório)"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="h-9 bg-white"
                                        />
                                        <Input
                                            placeholder="Seu Telefone (Opcional)"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            className="h-9 bg-white"
                                        />
                                    </div>
                                    <div className="pt-2 border-t border-primary/10">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-2">Tipo de Entrega</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            <button 
                                                onClick={() => setDeliveryType("local")}
                                                className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "local" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                                            >
                                                Mesa
                                            </button>
                                            <button 
                                                onClick={() => setDeliveryType("retirada")}
                                                className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "retirada" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                                            >
                                                Retirada
                                            </button>
                                            <button 
                                                onClick={() => setDeliveryType("entrega")}
                                                className={`py-1.5 rounded text-xs font-medium transition-colors ${deliveryType === "entrega" ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}
                                            >
                                                Entrega
                                            </button>
                                        </div>
                                    </div>
                                    {deliveryType === "entrega" && (
                                        <div className="pt-2">
                                            <Input 
                                                placeholder="Endereço (Rua, Número, Bairro)" 
                                                value={deliveryAddress}
                                                onChange={e => setDeliveryAddress(e.target.value)} 
                                                className="h-9 bg-white text-xs"
                                                required={deliveryType === "entrega"}
                                            />
                                        </div>
                                    )}
                                </div>

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

                                {/* Payment */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {paymentMethods.map((pm) => (
                                        <button
                                            key={pm.value}
                                            onClick={() => setPaymentMethod(pm.value)}
                                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors
                        ${paymentMethod === pm.value
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
                                        <span>{fmt(subtotal)}</span>
                                    </div>
                                    {discountValue > 0 && (
                                        <div className="flex justify-between text-destructive">
                                            <span>Desconto</span>
                                            <span>-{fmt(discountValue)}</span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex justify-between text-lg font-bold">
                                        <span>Total</span>
                                        <span>{fmt(total)}</span>
                                    </div>
                                </div>

                                <Button
                                    size="lg"
                                    className="w-full h-12 text-base"
                                    onClick={() => saleMutation.mutate()}
                                    disabled={saleMutation.isPending}
                                >
                                    {saleMutation.isPending
                                        ? "Finalizando..."
                                        : `Finalizar — ${fmt(total)}`}
                                </Button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Cupom */}
            <CupomModal
                ticket={lastTicket}
                open={cupomOpen}
                onClose={() => setCupomOpen(false)}
            />

            {/* Product Options Modal */}
            {productModalOpen && selectedProduct && (
                <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-xl">{selectedProduct.name}</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6 py-2">
                            {/* Peso / Quantidade */}
                            {((selectedProduct as any).unit === "KG" || (selectedProduct as any).unit === "G" || (selectedProduct as any).unit === "L") && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Quantidade ({(selectedProduct as any).unit})</label>
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
                                        <label className="text-sm font-medium">Valor (R$)</label>
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
                                            <label className="text-sm font-medium">Acompanhamentos</label>
                                            {(selectedProduct as any).max_additionals > 0 && (
                                                <p className="text-[10px] text-muted-foreground">
                                                    Escolha até {(selectedProduct as any).max_additionals} {(selectedProduct as any).max_additionals === 1 ? "opção" : "opções"}
                                                </p>
                                            )}
                                        </div>
                                        <Badge variant="secondary" className="text-[10px] font-bold">
                                            {selectedAdds.length} / {(selectedProduct as any).max_additionals || "∞"}
                                        </Badge>
                                    </div>
                                    <div className="grid gap-2 max-h-60 overflow-y-auto pr-1">
                                        {productAdditionals.map((add) => {
                                            const isSelected = selectedAdds.some((a) => a.id === add.id);
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
                                                            setSelectedAdds(selectedAdds.filter((a) => a.id !== add.id));
                                                        } else {
                                                            if (maxReached) {
                                                                toast.error(`Você só pode escolher até ${(selectedProduct as any).max_additionals} acompanhamentos.`);
                                                                return;
                                                            }
                                                            setSelectedAdds([...selectedAdds, add]);
                                                        }
                                                    }}
                                                >
                                                    <span className={isSelected ? "font-semibold" : ""}>{add.name}</span>
                                                    <span className="text-sm font-medium text-muted-foreground">
                                                    {add.price > 0 ? `+ ${fmt(add.price)}` : "Grátis"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Botão Salvar */}
                            <Button
                                className="w-full h-12 text-base mt-4"
                                onClick={() => {
                                    const qtyNum = parseFloat(modalQty as string);
                                    if (isNaN(qtyNum) || qtyNum <= 0) {
                                        toast.error("Informe uma quantidade/peso válido.");
                                        return;
                                    }
                                    
                                    const extraPrice = selectedAdds.reduce((sum: number, add: any) => sum + (add.price || 0), 0);

                                    const finalUnitPrice = selectedProduct.price + extraPrice;
                                    addToCart(selectedProduct, qtyNum, selectedAdds, finalUnitPrice);
                                }}
                            >
                                Adicionar ao Carrinho
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
