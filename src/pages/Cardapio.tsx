import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, X,
  Store, ChevronRight, User, Phone, MessageSquare,
  Banknote, CreditCard, QrCode, UtensilsCrossed,
  ShoppingBag,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { maskPhone, formatPhoneDisplay } from "@/lib/utils";

type Product = Tables<"products">;

interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  additionals: { name: string; price: number }[];
  unitPrice: number;
}

const fmt = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando confirmação",
  accepted: "Pedido confirmado!",
  preparing: "Sendo preparado 🔥",
  ready: "Pronto para retirar! 🎉",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export default function Cardapio() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [deliveryType, setDeliveryType] = useState<"retirada" | "entrega">("retirada");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [wantsChange, setWantsChange] = useState<boolean | null>(null);
  const [changeFor, setChangeFor] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Sessão do Cliente (Login / Cadastro) ──────────────────────────
  const [loggedCustomer, setLoggedCustomer] = useState<{
    name: string;
    phone: string;
    address?: string;
    birthdate?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(`customer_session_${storeId}`);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authAddress, setAuthAddress] = useState("");
  const [authBirthdate, setAuthBirthdate] = useState("");

  // Sincroniza formulário de checkout quando logado
  useEffect(() => {
    if (loggedCustomer) {
      setCustomerName(loggedCustomer.name || "");
      setCustomerPhone(loggedCustomer.phone || "");
      if (loggedCustomer.address) setDeliveryAddress(loggedCustomer.address);
    }
  }, [loggedCustomer]);

  // Modal de Produto (Peso e Adicionais)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalQty, setModalQty] = useState<number | string>(1);
  const [modalPrice, setModalPrice] = useState<number | string>("");
  const [selectedAdds, setSelectedAdds] = useState<any[]>([]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Dados da loja
  const { data: store } = useQuery({
    queryKey: ["store-cardapio", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Produtos ativos
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-cardapio", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products").select("*")
          .eq("store_id", storeId!).eq("active", true).order("category").order("name");
        if (error) throw error;
        return data as Product[];
      } catch {
        // fallback offline
        try {
          const offline = JSON.parse(localStorage.getItem(`products_offline_${storeId}`) || "[]") as Product[];
          return offline.filter(p => p.active);
        } catch { return []; }
      }
    },
  });

  // Adicionais para modal
  const { data: productAdditionals = [] } = useQuery({
    queryKey: ["product_additionals_cardapio", selectedProduct?.id],
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

  // Agrupado por categoria
  const categories = useMemo(() => {
    const activeMenu = (store as any)?.active_menu_type || 'both';

    const filtered = products.filter(p => {
      // 1. Filtro de Busca
      const matchesSearch = !search.trim() || 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      // 2. Filtro de Turno (Dia/Noite)
      // Se a loja está em modo 'both', mostra tudo.
      // Caso contrário, mostra apenas o que é 'both' ou o turno específico da loja.
      if (activeMenu === 'both') return true;
      
      const prodMenu = (p as any).menu_type || 'both';
      return prodMenu === 'both' || prodMenu === activeMenu;
    });

    const map = new Map<string, Product[]>();
    filtered.forEach(p => {
      const cat = p.category || "Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return map;
  }, [products, search, store]);

  // Cart helpers
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

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
    setCart(prev => {
      const addsStr = JSON.stringify(adds);
      const ex = prev.find(i => i.product.id === product.id && JSON.stringify(i.additionals) === addsStr);
      if (ex) return prev.map(i => i.cartItemId === ex.cartItemId ? { ...i, quantity: i.quantity + quantity } : i);
      return [...prev, { cartItemId: Math.random().toString(36).substring(7), product, quantity, additionals: adds, unitPrice }];
    });
    setProductModalOpen(false);
    toast.success(`${product.name} adicionado!`, { duration: 800 });
  };

  const updateQty = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(i => i.cartItemId === cartItemId
      ? { ...i, quantity: i.quantity + delta }
      : i).filter(i => i.quantity > 0));
  };

  const removeFromCart = (cartItemId: string) =>
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));

  // Enviar pedido
  const orderMutation = useMutation({
    mutationFn: async () => {
      if (!customerName.trim()) throw new Error("Informe seu nome");
      if (!customerPhone.trim()) throw new Error("Informe seu WhatsApp para contato");
      if (deliveryType === "entrega" && !deliveryAddress.trim()) throw new Error("Informe o endereço de entrega");
      if (paymentMethod === "cash") {
        if (wantsChange === null) {
          throw new Error("Por favor, selecione se precisa de troco (Sim ou Não).");
        }
        if (wantsChange === true && (!changeFor.trim() || Number(changeFor) <= 0)) {
          throw new Error("Informe o valor para o troco.");
        }
      }
      if (cart.length === 0) throw new Error("Carrinho vazio");

      let finalNotes = notes.trim();
      if (paymentMethod === "cash") {
        if (wantsChange === true && changeFor.trim()) {
          finalNotes = finalNotes ? `${finalNotes} | [Precisa de troco para: R$ ${changeFor.trim()}]` : `[Precisa de troco para: R$ ${changeFor.trim()}]`;
        } else if (wantsChange === false) {
          finalNotes = finalNotes ? `${finalNotes} | [Não precisa de troco]` : `[Não precisa de troco]`;
        }
      }

      // Tenta Supabase
      try {
        const { data: order, error: orderError } = await (supabase as any)
          .from("orders")
          .insert({
            store_id: storeId,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim() || null,
            total: cartTotal,
            notes: finalNotes || null,
            payment_method: paymentMethod,
            status: "pending",
            origin: "menu",
            delivery_type: deliveryType,
            delivery_address: deliveryType === "entrega" ? deliveryAddress.trim() : null,
          })
          .select("id").single();
        if (orderError) throw orderError;

        const items = cart.map(i => ({
          order_id: order.id,
          product_id: i.product.id,
          product_name: i.product.name,
          unit_price: i.unitPrice,
          quantity: i.quantity,
          additionals: i.additionals,
          subtotal: i.unitPrice * i.quantity,
        }));
        await (supabase as any).from("order_items").insert(items);
        return order.id as string;
      } catch (err) {
        console.warn("Erro ao salvar online no Supabase, salvando offline:", err);
        // fallback offline: salva em localStorage com UUID seguro (imprevisível)
        const safeId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? `ord-${crypto.randomUUID()}` 
          : `ord-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
        const orderId = safeId;
        const order = {
          id: orderId,
          store_id: storeId,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          total: cartTotal,
          notes: finalNotes || null,
          payment_method: paymentMethod,
          status: "pending",
          origin: "menu",
          delivery_type: deliveryType,
          delivery_address: deliveryType === "entrega" ? deliveryAddress.trim() : null,
          created_at: new Date().toISOString(),
          items: cart.map(i => ({
            id: `item-${Date.now()}-${Math.random()}`,
            order_id: orderId,
            product_name: i.product.name,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            subtotal: i.unitPrice * i.quantity,
            additionals: i.additionals || [],
          })),
        };
        const existing = JSON.parse(localStorage.getItem(`orders_offline_${storeId}`) || "[]");
        localStorage.setItem(`orders_offline_${storeId}`, JSON.stringify([order, ...existing]));
        return orderId;
      }
    },
    onSuccess: (orderId) => {
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      navigate(`/pedido/${orderId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMethods = [
    { value: "cash", label: "Dinheiro", icon: Banknote },
    { value: "pix", label: "PIX", icon: QrCode },
    { value: "credit", label: "Crédito", icon: CreditCard },
    { value: "debit", label: "Débito", icon: CreditCard },
  ];

  if (!storeId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Link inválido.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <div>
              <p className="font-bold text-base font-['Space_Grotesk'] leading-tight">
                {store?.name ?? "Catálogo"}
              </p>
              <p className="text-xs text-muted-foreground">Faça seu pedido</p>
            </div>
          </div>

          <div className="relative flex-1 max-w-xs hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Buscar item..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>

          <div className="flex items-center gap-2">
            {loggedCustomer ? (
              <div className="flex items-center gap-1.5 bg-muted/60 hover:bg-muted p-1 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs cursor-pointer"
                onClick={() => setOrdersModalOpen(true)}>
                <User className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline font-medium max-w-[100px] truncate">{loggedCustomer.name.split(" ")[0]}</span>
                <Badge variant="outline" className="hidden sm:inline text-[10px] px-1 py-0 border-primary text-primary">Meus Pedidos</Badge>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAuthMode("login");
                  setAuthModalOpen(true);
                }}
                className="text-xs gap-1.5 h-9 border-primary/40 text-primary hover:bg-primary/10"
              >
                <User className="h-4 w-4" />
                <span>Entrar</span>
              </Button>
            )}

            <button onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 bg-primary text-primary-foreground px-3 sm:px-4 py-2 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrinho</span>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar item..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
      </header>

      {/* Products */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Carregando catálogo...
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Store className="h-12 w-12 opacity-30" />
            <p>Nenhum item disponível no momento.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(categories.entries()).map(([cat, prods]) => (
              <div key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />{cat}<span className="h-px flex-1 bg-border" />
                </h2>
                <div className="space-y-2">
                  {prods.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id);
                    const outOfStock = p.stock_display <= 0;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const imageUrl = (p as any).image_url;
                    return (
                      <div key={p.id}
                        className={`flex items-stretch gap-4 p-4 rounded-2xl bg-white border shadow-sm transition-all
                          ${outOfStock ? "opacity-50" : "hover:shadow-md hover:border-primary/20"}`}>

                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <p className="font-semibold text-sm">{p.name}</p>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <p className="text-base font-bold text-primary">{fmt(p.price)}</p>
                            {outOfStock ? (
                              <Badge variant="secondary" className="text-xs">Esgotado</Badge>
                            ) : inCart ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateQty(p.id, -1)}
                                  className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted">
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-6 text-center font-bold text-sm">{inCart.quantity}</span>
                                <button onClick={() => updateQty(p.id, 1)}
                                  className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleProductClick(p)}
                                className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Foto */}
                        {imageUrl ? (
                          <div className="relative shrink-0">
                            <img src={imageUrl} alt={p.name} referrerPolicy="no-referrer"
                              className="h-24 w-24 rounded-xl object-cover border" />
                            {outOfStock && (
                              <span className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center text-[10px] font-bold text-red-600">Esgotado</span>
                            )}
                          </div>
                        ) : (
                          <div className="h-24 w-24 shrink-0 rounded-xl bg-muted border flex items-center justify-center">
                            <UtensilsCrossed className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating cart button mobile */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20 px-4">
          <button onClick={() => setCartOpen(true)}
            className="flex items-center justify-between gap-4 bg-primary text-primary-foreground px-6 py-3 rounded-2xl shadow-xl font-semibold text-sm max-w-sm w-full hover:bg-primary/90 transition-all">
            <span className="bg-white/20 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">{cartCount}</span>
            <span>Ver carrinho</span>
            <span>{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Seu Pedido
              </h2>
              <button onClick={() => setCartOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <ShoppingCart className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Nenhum item adicionado</p>
                </div>
              ) : cart.map((item, idx) => (
                <div key={item.cartItemId} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} × {item.quantity} {(item.product as any).unit ?? "un"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.cartItemId, -1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.cartItemId, 1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeFromCart(item.cartItemId)}
                        className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-bold w-16 text-right">
                      {fmt(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                  {item.additionals && item.additionals.length > 0 && (
                    <div className="text-xs text-muted-foreground pl-1 border-l-2 border-border ml-1 mt-1">
                      + {item.additionals.map(a => a.name).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{fmt(cartTotal)}</span>
                </div>
                <Button className="w-full h-12 text-base" onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
                  Finalizar Pedido <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              {/* Header fixo */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b shrink-0 bg-white">
                <h2 className="font-bold text-lg">Confirmar Pedido</h2>
                <button onClick={() => setCheckoutOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo com scroll */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                {/* Resumo */}
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  {cart.map((item, idx) => (
                    <div key={item.cartItemId} className="flex flex-col text-sm border-b border-border/50 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                      <div className="flex justify-between">
                        <span>{item.quantity}x {item.product.name}</span>
                        <span className="font-medium">{fmt(item.unitPrice * item.quantity)}</span>
                      </div>
                      {item.additionals && item.additionals.length > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-4">
                          + {item.additionals.map(a => a.name).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-base pt-2 border-t">
                    <span>Total</span>
                    <span>{fmt(cartTotal)}</span>
                  </div>
                </div>

                {/* Formulário */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                      <User className="h-4 w-4" /> Seu nome *
                    </label>
                    <Input placeholder="Ex: João Silva" value={customerName}
                      onChange={e => setCustomerName(e.target.value)} />
                  </div>
                   <div>
                     <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                       <Phone className="h-4 w-4" /> WhatsApp <span className="text-red-500">*</span>
                     </label>
                     <Input placeholder="(11) 99999-9999" value={customerPhone} required
                       onChange={e => setCustomerPhone(maskPhone(e.target.value))} />
                   </div>

                  {/* Tipo de Entrega */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Como deseja receber?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setDeliveryType("retirada")}
                        className={`py-2 rounded-lg border text-sm font-medium transition-colors ${deliveryType === "retirada" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                      >
                        Retirar na Loja
                      </button>
                      <button 
                        onClick={() => setDeliveryType("entrega")}
                        className={`py-2 rounded-lg border text-sm font-medium transition-colors ${deliveryType === "entrega" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                      >
                        Entrega
                      </button>
                    </div>
                  </div>

                  {deliveryType === "entrega" && (
                    <div>
                      <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                        Endereço de Entrega *
                      </label>
                      <Input 
                        placeholder="Ex: Rua das Flores, 123, Bairro Centro" 
                        value={deliveryAddress}
                        onChange={e => setDeliveryAddress(e.target.value)} 
                        required={deliveryType === "entrega"}
                      />
                      {/* Aviso de taxa de entrega */}
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                        🛵 <span><strong>Atenção:</strong> Pode haver uma taxa de entrega cobrada no momento da entrega. O entregador informará o valor.</span>
                      </p>
                    </div>
                  )}

                  {/* Pagamento */}
                  <div>
                    <p className="text-sm font-medium mb-1.5">Forma de pagamento</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {paymentMethods.map(pm => (
                        <button key={pm.value} onClick={() => { setPaymentMethod(pm.value); setWantsChange(null); setChangeFor(""); }}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors
                            ${paymentMethod === pm.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                          <pm.icon className="h-4 w-4" />{pm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Troco — só aparece se escolher Dinheiro */}
                  {paymentMethod === "cash" && (
                    <div className="bg-muted/40 border border-amber-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium flex items-center justify-between">
                        <span>Precisa de troco? <span className="text-red-500">*</span></span>
                        {wantsChange === null && (
                          <span className="text-[11px] text-amber-600 font-normal">Obrigatório escolher</span>
                        )}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setWantsChange(true)}
                          className={`py-2 rounded-lg border text-sm font-medium transition-colors ${wantsChange === true ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-white hover:bg-muted"}`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => { setWantsChange(false); setChangeFor(""); }}
                          className={`py-2 rounded-lg border text-sm font-medium transition-colors ${wantsChange === false ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-white hover:bg-muted"}`}
                        >
                          Não
                        </button>
                      </div>
                      {wantsChange === true && (
                        <div className="pt-1">
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Troco para quanto? (R$) *</label>
                          <Input
                            type="number"
                            placeholder="Ex: 50 ou 100"
                            value={changeFor}
                            onChange={e => setChangeFor(e.target.value)}
                            className="h-10 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                      <MessageSquare className="h-4 w-4" /> Observações (opcional)
                    </label>
                    <Textarea placeholder="Ex: Sem cebola, alergia a amendoim..."
                      value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                  </div>
                </div>
              </div>

              {/* Botão fixo no rodapé */}
              <div className="p-4 border-t bg-white shrink-0">
                <Button className="w-full h-12 text-base font-semibold shadow-md" disabled={orderMutation.isPending}
                  onClick={() => orderMutation.mutate()}>
                  {orderMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : "Enviar Pedido 🚀"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Product Options Modal */}
      {productModalOpen && selectedProduct && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setProductModalOpen(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="font-bold text-lg">{selectedProduct.name}</h2>
                <button onClick={() => setProductModalOpen(false)} className="p-1 rounded hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
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
                    <div className="grid gap-2">
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
            </div>
          </div>
        </>
      )}

      {/* ── Modal de Login / Registro do Cliente ────────────────── */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-base">
                  {authMode === "login" ? "Acessar minha conta" : "Criar meu cadastro"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {authMode === "login" ? "Acompanhe seus pedidos e converse pelo chat" : "Preencha seus dados para agilizar seus pedidos"}
                </p>
              </div>
              <button onClick={() => setAuthModalOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {authMode === "login" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Seu WhatsApp (Telefone) *</label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={authPhone}
                      onChange={e => setAuthPhone(maskPhone(e.target.value))}
                      className="h-10"
                      autoFocus
                    />
                  </div>
                  <Button
                    className="w-full h-11 text-sm font-semibold"
                    onClick={async () => {
                      if (!authPhone.trim()) {
                        toast.error("Informe seu número de WhatsApp");
                        return;
                      }
                      const cleanPhone = authPhone.replace(/\D/g, "");
                      let found: any = null;

                      // 1. Tenta Supabase
                      try {
                        const { data } = await (supabase as any)
                          .from("customers")
                          .select("*")
                          .eq("store_id", storeId);
                        
                        if (data && data.length > 0) {
                          found = data.find((c: any) => {
                            const cPhone = (c.phone || "").replace(/\D/g, "");
                            return cPhone && (cPhone === cleanPhone || cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone));
                          });
                        }
                      } catch (err) {
                        console.warn("Erro ao buscar no Supabase:", err);
                      }

                      // 2. Fallback offline em localStorage
                      if (!found) {
                        const localList: any[] = JSON.parse(localStorage.getItem(`customers_local_${storeId}`) || "[]");
                        found = localList.find((c: any) => {
                          const cPhone = (c.phone || "").replace(/\D/g, "");
                          return cPhone && (cPhone === cleanPhone || cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone));
                        });
                      }

                      if (found) {
                        const session = {
                          name: found.name,
                          phone: found.phone || authPhone.trim(),
                          address: found.address || "",
                        };
                        setLoggedCustomer(session);
                        localStorage.setItem(`customer_session_${storeId}`, JSON.stringify(session));
                        toast.success(`Bem-vindo(a) de volta, ${found.name.split(" ")[0]}!`);
                        setAuthModalOpen(false);
                        setAuthPhone("");
                      } else {
                        toast.info("Não encontramos seu cadastro. Preencha seus dados para cadastrar!");
                        setAuthMode("register");
                      }
                    }}
                  >
                    Entrar
                  </Button>

                  <div className="text-center pt-2">
                    <p className="text-xs text-muted-foreground">
                      Primeira vez por aqui?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthMode("register")}
                        className="text-primary font-semibold hover:underline"
                      >
                        Cadastre-se
                      </button>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Seu Nome Completo *</label>
                    <Input
                      placeholder="Ex: Maria Silva"
                      value={authName}
                      onChange={e => setAuthName(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">WhatsApp (Telefone) *</label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={authPhone}
                      onChange={e => setAuthPhone(maskPhone(e.target.value))}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Endereço de Entrega</label>
                    <Input
                      placeholder="Ex: Rua das Flores, 123, Bairro Centro"
                      value={authAddress}
                      onChange={e => setAuthAddress(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Data de Aniversário (opcional) 🎂</label>
                    <Input
                      type="date"
                      value={authBirthdate}
                      onChange={e => setAuthBirthdate(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <Button
                    className="w-full h-11 text-sm font-semibold mt-2"
                    onClick={async () => {
                      if (!authName.trim()) {
                        toast.error("Informe seu nome completo");
                        return;
                      }
                      if (!authPhone.trim()) {
                        toast.error("Informe seu WhatsApp");
                        return;
                      }

                      const sessionData = {
                        name: authName.trim(),
                        phone: authPhone.trim(),
                        address: authAddress.trim() || undefined,
                        birthdate: authBirthdate || undefined,
                      };

                      try {
                        await (supabase as any).from("customers").insert({
                          store_id: storeId,
                          name: sessionData.name,
                          phone: sessionData.phone,
                          address: sessionData.address || null,
                          notes: sessionData.birthdate ? `Aniversário: ${sessionData.birthdate}` : null,
                        });
                      } catch (e) {
                        console.warn("Erro ao salvar cliente no banco:", e);
                      }

                      setLoggedCustomer(sessionData);
                      localStorage.setItem(`customer_session_${storeId}`, JSON.stringify(sessionData));
                      toast.success(`Cadastro realizado com sucesso! Olá, ${sessionData.name.split(" ")[0]}!`);
                      setAuthModalOpen(false);
                      setAuthName("");
                      setAuthPhone("");
                      setAuthAddress("");
                      setAuthBirthdate("");
                    }}
                  >
                    Salvar e Entrar
                  </Button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      Já tem cadastro? <span className="font-semibold text-primary">Fazer Login</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Meus Pedidos & Chat ──────────────────────────── */}
      {ordersModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b bg-white">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold text-base">{loggedCustomer?.name}</h3>
                  <p className="text-xs text-muted-foreground">{loggedCustomer?.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-500 hover:text-red-700 h-8 px-2"
                  onClick={() => {
                    localStorage.removeItem(`customer_session_${storeId}`);
                    setLoggedCustomer(null);
                    setOrdersModalOpen(false);
                    toast.info("Você saiu da conta.");
                  }}
                >
                  Sair
                </Button>
                <button onClick={() => setOrdersModalOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico de Pedidos</p>

              {/* Busca os pedidos do telefone do cliente */}
              {(() => {
                const cleanPhone = loggedCustomer?.phone?.replace(/\D/g, "") || "";
                const offlineOrders = JSON.parse(localStorage.getItem(`orders_offline_${storeId}`) || "[]");
                const matchedOffline = offlineOrders.filter((o: any) => 
                  o.customer_phone && o.customer_phone.replace(/\D/g, "").includes(cleanPhone)
                );

                if (matchedOffline.length === 0) {
                  return (
                    <div className="text-center py-8 space-y-2">
                      <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                      <p className="text-sm font-medium text-muted-foreground">Nenhum pedido recente</p>
                      <p className="text-xs text-muted-foreground">Seus novos pedidos aparecerão aqui com acesso direto ao chat com a loja.</p>
                    </div>
                  );
                }

                return matchedOffline.map((o: any) => (
                  <div key={o.id} className="p-3 border rounded-xl bg-muted/20 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold">Pedido #{o.id.slice(-6).toUpperCase()}</span>
                      <Badge variant="outline" className="text-xs font-semibold">
                        {STATUS_LABELS[o.status] || o.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>Total: {fmt(o.total)}</span>
                      <span>{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8 gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                      onClick={() => {
                        setOrdersModalOpen(false);
                        navigate(`/pedido/${o.id}`);
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Acompanhar & Abrir Chat
                    </Button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
