import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, Package, Settings2,
  Tag, DollarSign, Boxes, ScanBarcode, List,
  CirclePlus, GripVertical, CheckCircle, ImageIcon, Link,
  CheckCircle2, Clock, Copy,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

import { db } from "@/lib/db";

type Product = Tables<"products">;

type ProductAdditional = {
  id?: string;
  product_id?: string;
  store_id?: string;
  name: string;
  price: number;
  active: boolean;
};

const emptyForm: Partial<TablesInsert<"products">> & { image_url?: string, tax_ibs_cbs_classificacao?: string, menu_type?: string } = {
  name: "", barcode: "", category: "", description: "", image_url: "",
  cost: 0, price: 0, stock_total: 0, stock_display: 0, min_display_stock: 0, active: true,
  tax_ibs_cbs_classificacao: "010101", menu_type: "both",
};


const fmt = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

export default function Products() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateBaseProduct, setDuplicateBaseProduct] = useState<Product | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateImageUrl, setDuplicateImageUrl] = useState("");
  const [duplicateAdditionals, setDuplicateAdditionals] = useState<ProductAdditional[]>([]);

  // ── Additionals state ────────────────────────────────────────────────────
  const [hasAdditionals, setHasAdditionals] = useState(false);
  const [maxAdditionals, setMaxAdditionals] = useState(0);
  const [additionals, setAdditionals] = useState<ProductAdditional[]>([]);
  const [newAddName, setNewAddName] = useState("");
  const [newAddPrice, setNewAddPrice] = useState(0);
  const [unit, setUnit] = useState("UN");

  // ── Profile ──────────────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("store_id").eq("auth_user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });
  // Usa store_id do perfil ou, em modo de teste (sem Supabase), usa o próprio user.id
  const storeId = profile?.store_id ?? user?.id ?? "test-store";


  // ── Produtos (com fallback offline em Dexie e localStorage) ───────────────
  const OFFLINE_KEY = `products_offline_${storeId}`;

  const getOfflineProducts = (): Product[] => {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return []; }
  };
  const saveOfflineProducts = (list: Product[]) => {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(list));
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      // 1. Online -> Supabase
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase.from("products")
            .select("*").eq("store_id", storeId!).order("name");
          if (error) throw error;
          if (data && data.length > 0) {
            const localData = (data as Product[]).map(p => ({ ...p, _sync_status: 'synced' as const }));
            await db.products.bulkPut(localData);
          }
          return data as Product[];
        } catch (err) {
          console.warn("[Produtos] Erro Supabase, tentando local:", err);
        }
      }

      // 2. Offline -> Dexie DB
      try {
        const localProducts = await db.products
          .where("store_id").equals(storeId!)
          .toArray();
        if (localProducts.length > 0) {
          return localProducts as unknown as Product[];
        }
      } catch (err) {
        console.warn("[Produtos] Erro Dexie:", err);
      }

      // 3. Fallback localStorage
      return getOfflineProducts();
    },
  });


  // ── Upsert product + additionals ──────────────────────────────────────────
  interface UpsertPayload {
    product: Partial<TablesInsert<"products">>;
    hasAdds: boolean;
    maxAdds: number;
    unitType: string;
    adds: ProductAdditional[];
  }

  const upsertMutation = useMutation({
    mutationFn: async (payload: UpsertPayload) => {
      const { product, hasAdds, maxAdds, unitType, adds } = payload;
      let productId = editingId;

      try {
        // ── Tenta Supabase primeiro ──────────────────────────────────────
        if (editingId) {
          const { error } = await supabase.from("products")
            .update({ ...product, store_id: storeId! })
            .eq("id", editingId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("products")
            .insert({ ...product, store_id: storeId! } as TablesInsert<"products">)
            .select("id").single();
          if (error) throw error;
          productId = data.id;
        }
      } catch {
        // ── Supabase offline → salva em localStorage ─────────────────────
        const list = getOfflineProducts();
        if (editingId) {
          const idx = list.findIndex(p => p.id === editingId);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...(product as Product) };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (list[idx] as any).unit = unitType;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (list[idx] as any).has_additionals = hasAdds;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (list[idx] as any).max_additionals = maxAdds;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (list[idx] as any).additionals_data = adds;
          }
        } else {
          const newProduct: Product = {
            ...(product as Product),
            id: `local-${Date.now()}`,
            store_id: storeId!,
            created_at: new Date().toISOString(),
            barcode: product.barcode ?? null,
            category: product.category ?? null,
            description: product.description ?? null,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newProduct as any).unit = unitType;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newProduct as any).has_additionals = hasAdds;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newProduct as any).max_additionals = maxAdds;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newProduct as any).additionals_data = adds;
          productId = newProduct.id;
          list.push(newProduct);
        }
        saveOfflineProducts(list);
        return; // sucesso offline, sai sem erro
      }

      // 2) Tenta salvar campos de adicionais (só funciona após migration e se for UUID)
      if (productId && !productId.startsWith("local-")) {
        try {
          const { error } = await (supabase as any).from("products")
            .update({ has_additionals: hasAdds, max_additionals: maxAdds, unit: unitType })
            .eq("id", productId);
          if (error) console.error("Erro update products extras:", error);
        } catch (err) { console.error("Catch update products:", err); }

        if (hasAdds) {
          try {
            const { error: delErr } = await (supabase as any).from("product_additionals").delete().eq("product_id", productId);
            if (delErr) console.error("Erro delete adds:", delErr);
            
            if (adds.length > 0) {
              const rows = adds.map(a => ({
                product_id: productId, store_id: storeId!, name: a.name, price: a.price, active: a.active,
              }));
              const { error: insErr } = await (supabase as any).from("product_additionals").insert(rows);
              if (insErr) console.error("Erro insert adds:", insErr);
            }
          } catch (err) { console.error("Catch additionals:", err); }
        } else {
          try {
             await (supabase as any).from("product_additionals").delete().eq("product_id", productId);
          } catch (_) {}
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_additionals"] });
      toast.success(editingId ? "Produto atualizado!" : "Produto criado!");
      closeDialog();
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
      } catch {
        // offline → remove do localStorage
        const list = getOfflineProducts().filter(p => p.id !== id);
        saveOfflineProducts(list);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto removido!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });


  // ── Helpers ───────────────────────────────────────────────────────────────
  // ── Subscription limits ───────────────────────────────────────────────────
  const { data: subscription } = useQuery({
    queryKey: ["store_subscription_status", storeId],
    enabled: !!storeId && storeId !== "test-store",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_subscription_status" as any)
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  // ── Helpers ───────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null); setForm(emptyForm);
    setHasAdditionals(false); setMaxAdditionals(0); setAdditionals([]);
    setNewAddName(""); setNewAddPrice(0);
    setUnit("UN");
    setDialogOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name, barcode: p.barcode, category: p.category, description: p.description,
      cost: p.cost, price: p.price, stock_total: p.stock_total, stock_display: p.stock_display,
      min_display_stock: p.min_display_stock, active: p.active,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      image_url: (p as any).image_url ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tax_ibs_cbs_classificacao: (p as any).tax_ibs_cbs_classificacao ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      menu_type: (p as any).menu_type ?? "both",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHasAdditionals((p as any).has_additionals ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMaxAdditionals((p as any).max_additionals ?? 0);
    setAdditionals([]); 
    setNewAddName(""); setNewAddPrice(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setUnit((p as any).unit ?? "UN");
    setDialogOpen(true);

    // Carrega os adicionais
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((p as any).additionals_data) {
      // Se tiver dados salvos no localStorage (offline)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAdditionals((p as any).additionals_data);
    } else if (!p.id.startsWith("local-")) {
      // Se for um ID válido do banco de dados
      try {
        const { data } = await (supabase as any).from("product_additionals")
          .select("*").eq("product_id", p.id).order("created_at");
        if (data) {
          setAdditionals(data as ProductAdditional[]);
        }
      } catch (_) { /* ignora se falhar ou estiver offline */ }
    }
  };

  const openDuplicate = async (p: Product) => {
    setDuplicateBaseProduct(p);
    setDuplicateName(`${p.name} (Cópia)`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDuplicateImageUrl((p as any).image_url ?? "");
    setDuplicateAdditionals([]);

    // Carrega adicionais do produto original
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((p as any).additionals_data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDuplicateAdditionals((p as any).additionals_data);
    } else if (!p.id.startsWith("local-")) {
      try {
        const { data } = await (supabase as any).from("product_additionals")
          .select("*").eq("product_id", p.id).order("created_at");
        if (data) {
          setDuplicateAdditionals(data as ProductAdditional[]);
        }
      } catch (_) {}
    }

    setDuplicateDialogOpen(true);
  };

  const closeDuplicateDialog = () => {
    setDuplicateDialogOpen(false);
    setDuplicateBaseProduct(null);
    setDuplicateName("");
    setDuplicateImageUrl("");
    setDuplicateAdditionals([]);
  };

  const handleDuplicateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateBaseProduct) return;
    if (!duplicateName.trim()) {
      toast.error("Nome do produto é obrigatório");
      return;
    }

    const p = duplicateBaseProduct;
    // Cria o novo produto clonando preços, estoque, tributação e categorias do original
    const duplicatedProduct: Partial<TablesInsert<"products">> & { image_url?: string, tax_ibs_cbs_classificacao?: string, menu_type?: string } = {
      name: duplicateName.trim(),
      barcode: "", // Deixa vazio para não duplicar código de barra único
      category: p.category ?? "",
      description: p.description ?? "",
      cost: p.cost ?? 0,
      price: p.price ?? 0,
      stock_total: p.stock_total ?? 0,
      stock_display: p.stock_display ?? 0,
      min_display_stock: p.min_display_stock ?? 0,
      active: p.active ?? true,
      image_url: duplicateImageUrl ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tax_ibs_cbs_classificacao: (p as any).tax_ibs_cbs_classificacao ?? "010101",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      menu_type: (p as any).menu_type ?? "both",
    };

    upsertMutation.mutate({
      product: duplicatedProduct,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasAdds: (p as any).has_additionals ?? false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maxAdds: (p as any).max_additionals ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unitType: (p as any).unit ?? "UN",
      adds: duplicateAdditionals,
    }, {
      onSuccess: () => {
        closeDuplicateDialog();
      }
    });
  };

  const closeDialog = () => {
    setDialogOpen(false); setEditingId(null); setForm(emptyForm);
    setHasAdditionals(false); setMaxAdditionals(0); setAdditionals([]);
    setNewAddName(""); setNewAddPrice(0);
    setUnit("UN");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    upsertMutation.mutate({
      product: form,
      hasAdds: hasAdditionals,
      maxAdds: maxAdditionals,
      unitType: unit,
      adds: additionals,
    });
  };

  const setField = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const addAdditional = () => {
    if (!newAddName.trim()) { toast.error("Nome do adicional é obrigatório"); return; }
    setAdditionals(prev => [...prev, { name: newAddName.trim(), price: newAddPrice, active: true }]);
    setNewAddName(""); setNewAddPrice(0);
  };

  const removeAdditional = (i: number) => setAdditionals(p => p.filter((_, idx) => idx !== i));
  const toggleAdditional = (i: number) => setAdditionals(p => p.map((a, idx) => idx === i ? { ...a, active: !a.active } : a));

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    products.filter(p => {
      if (!p) return false;
      const searchLower = search.toLowerCase();
      return (
        (p.name?.toLowerCase() || "").includes(searchLower) ||
        (p.barcode?.toLowerCase() || "").includes(searchLower) ||
        (p.category?.toLowerCase() || "").includes(searchLower)
      );
    }), [products, search]);

  // ── Margin calc ───────────────────────────────────────────────────────────
  const margin = form.cost && form.cost > 0 && form.price && form.price > 0
    ? `${(((form.price - form.cost) / form.cost) * 100).toFixed(1)}%`
    : "—";

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk']">Produtos</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? "Carregando produtos..."
              : search.trim()
                ? `${filtered.length} de ${products.length} produtos encontrados`
                : `${products.length} produtos cadastrados`}
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Produto</Button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código ou categoria..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando produtos...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Package className="h-10 w-10 opacity-30" />
              <p>Nenhum produto encontrado</p>
              <Button size="sm" variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Cadastrar produto</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">Foto</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Estoque</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Adicionais</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className={!p.active ? "opacity-55" : ""}>
                      {/* Foto miniatura */}
                      <TableCell>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(p as any).image_url ? (
                          <img src={(p as any).image_url} alt={p.name} referrerPolicy="no-referrer"
                            className="h-10 w-10 rounded-lg object-cover border" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg border bg-muted flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <span>{p.name}</span>
                          {p.barcode ? <span className="block text-xs text-muted-foreground font-mono">{p.barcode}</span> : null}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(p as any).unit && (p as any).unit !== "UN" ? (
                            <Badge variant="outline" className="mt-1 text-[10px] px-1 py-0 h-4">Vend. {(p as any).unit}</Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="hidden sm:table-cell">
                        {p.category ? <Badge variant="secondary">{p.category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right"><span>{fmt(p.cost)}</span></TableCell>
                      <TableCell className="text-right font-semibold"><span>{fmt(p.price)}</span></TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className={p.stock_display <= p.min_display_stock && p.stock_display > 0 ? "text-amber-600 font-semibold" : p.stock_display === 0 ? "text-red-500 font-semibold" : ""}>
                          {p.stock_display}
                        </span>
                        <span className="text-muted-foreground text-xs">/{p.stock_total}</span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(p as any).has_additionals ? (
                          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 gap-1">
                            <List className="h-3 w-3" /> Sim
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.active ? "default" : "secondary"}><span>{p.active ? "Ativo" : "Inativo"}</span></Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Duplicar produto" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openDuplicate(p)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar produto" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Excluir produto" className="text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`Remover "${p.name}"?`)) deleteMutation.mutate(p.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══ DIALOG: Cadastrar / Editar ════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingId ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Identificação ─────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Identificação
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Label>Nome do Produto *</Label>
                  <Input value={form.name ?? ""} onChange={e => setField("name", e.target.value)} placeholder="Ex: Açaí 300ml, Camiseta Preta..." />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><ScanBarcode className="h-3.5 w-3.5" /> Código de Barras</Label>
                  <Input value={form.barcode ?? ""} onChange={e => setField("barcode", e.target.value)} placeholder="EAN-13 ou código interno" />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input value={form.category ?? ""} onChange={e => setField("category", e.target.value)} placeholder="Ex: Açaí, Bebidas, Lanches..." />
                </div>
                <div>
                  <Label>Vendido por</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unidade (UN)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UN">Unidade (UN)</SelectItem>
                      <SelectItem value="KG">Quilo (KG)</SelectItem>
                      <SelectItem value="G">Grama (g)</SelectItem>
                      <SelectItem value="L">Litro (L)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Label>Descrição</Label>
                  <Textarea value={form.description ?? ""} onChange={e => setField("description", e.target.value)} placeholder="Detalhes que aparecem no cardápio online..." rows={2} />
                </div>

                {/* Foto do Produto (Cardápio Online) */}
                <div className="sm:col-span-3">
                  <Label className="flex items-center gap-1.5 mb-2">
                    <ImageIcon className="h-3.5 w-3.5" /> Foto do Produto (Cardápio Online)
                  </Label>
                  <div className="flex items-start gap-4">
                    <div className="h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                      {form.image_url ? (
                        <img src={form.image_url} alt="Preview" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Opção 1: Câmera do celular ou arquivo</p>
                        <Input 
                          type="file" 
                          accept="image/*" 
                          className="h-9 text-xs cursor-pointer"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            try {
                              toast.loading("Processando e otimizando imagem...");
                              
                              // Comprime e redimensiona a imagem para não estourar limite do celular nem do Supabase
                              const compressImage = (imageFile: File): Promise<Blob> => {
                                return new Promise((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.readAsDataURL(imageFile);
                                  reader.onload = (event) => {
                                    const img = new Image();
                                    img.src = event.target?.result as string;
                                    img.onload = () => {
                                      const canvas = document.createElement('canvas');
                                      const maxDim = 800; // 800px max
                                      let width = img.width;
                                      let height = img.height;

                                      if (width > height) {
                                        if (width > maxDim) {
                                          height = Math.round((height * maxDim) / width);
                                          width = maxDim;
                                        }
                                      } else {
                                        if (height > maxDim) {
                                          width = Math.round((width * maxDim) / height);
                                          height = maxDim;
                                        }
                                      }

                                      canvas.width = width;
                                      canvas.height = height;
                                      const ctx = canvas.getContext('2d');
                                      ctx?.drawImage(img, 0, 0, width, height);

                                      canvas.toBlob((blob) => {
                                        if (blob) resolve(blob);
                                        else reject(new Error("Erro ao comprimir imagem"));
                                      }, 'image/jpeg', 0.82);
                                    };
                                    img.onerror = reject;
                                  };
                                  reader.onerror = reject;
                                });
                              };

                              const compressedBlob = await compressImage(file);
                              const fileName = `${storeId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                              
                              // Tenta subir no Storage do Supabase
                              try {
                                const { error } = await supabase.storage
                                  .from('product-images')
                                  .upload(fileName, compressedBlob, {
                                    contentType: 'image/jpeg',
                                    upsert: true
                                  });

                                if (error) throw error;

                                const { data: { publicUrl } } = supabase.storage
                                  .from('product-images')
                                  .getPublicUrl(fileName);

                                setField("image_url", publicUrl);
                                toast.dismiss();
                                toast.success("Foto enviada com sucesso!");
                              } catch (uploadErr) {
                                // Fallback base64 direto se o bucket não existir ou estiver offline
                                console.warn("Erro ao subir no bucket, usando base64 direto:", uploadErr);
                                const reader = new FileReader();
                                reader.readAsDataURL(compressedBlob);
                                reader.onloadend = () => {
                                  const base64Data = reader.result as string;
                                  setField("image_url", base64Data);
                                  toast.dismiss();
                                  toast.success("Foto salva no produto!");
                                };
                              }
                            } catch (err: any) {
                              toast.dismiss();
                              toast.error(`Erro ao processar foto: ${err.message}`);
                            }
                          }}
                        />
                      </div>
                      
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Opção 2: Colar um link da internet</p>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="https://exemplo.com/foto.jpg"
                            value={form.image_url ?? ""}
                            onChange={(e) => setField("image_url", e.target.value)}
                            className="h-9 text-xs"
                          />
                          {form.image_url && (
                            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" type="button" onClick={() => setField("image_url", "")}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-muted-foreground italic">Recomendado: Imagem quadrada (500x500px) até 2MB.</p>
                    </div>
                  </div>
                </div>

                {/* Turno do Cardápio (Dia/Noite) */}
                <div className="sm:col-span-3">
                  <div className="p-4 rounded-xl border-2 bg-primary/5 border-primary/20 space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <Label className="font-bold text-primary">Disponibilidade no Cardápio Online</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Escolha em qual período este produto ficará visível para os clientes.</p>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "morning", label: "Só de Dia", sub: "Churrascaria" },
                        { id: "night", label: "Só de Noite", sub: "Macarrão" },
                        { id: "both", label: "Ambos", sub: "Tempo Todo" },
                      ].map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setField("menu_type", type.id)}
                          className={cn(
                            "flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all gap-0.5",
                            (form as any).menu_type === type.id 
                              ? "border-primary bg-primary text-primary-foreground" 
                              : "border-border bg-white hover:border-primary/40"
                          )}
                        >
                          <span className="text-[11px] font-bold">{type.label}</span>
                          <span className={cn("text-[9px] opacity-70", (form as any).menu_type === type.id ? "text-white" : "text-muted-foreground")}>
                            {type.sub}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Status e Visibilidade ───────────────────────────────── */}
            <div>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Label className="flex items-center gap-1.5 cursor-pointer">
                    <CheckCircle className="h-4 w-4 text-emerald-500" /> Produto Ativo
                  </Label>
                  <Switch checked={form.active ?? true} onCheckedChange={v => setField("active", v)} />
                </div>
              </div>
            </div>

            {/* ── Tributação ────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Tributação (Reforma 2026)
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="flex items-center gap-1">Classificação Tributária IBS/CBS (6 dígitos)</Label>
                  <Input 
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value={(form as any).tax_ibs_cbs_classificacao ?? ""} 
                    onChange={e => setField("tax_ibs_cbs_classificacao", e.target.value.replace(/\D/g, "").substring(0, 6))} 
                    placeholder="Ex: 010101" 
                    maxLength={6}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Código oficial para o novo IBS/CBS. Consulte seu contador para o código de 6 dígitos.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Preços ────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Preços
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Custo (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.cost ?? 0} onChange={e => setField("cost", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Preço de Venda (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.price ?? 0} onChange={e => setField("price", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Margem de Lucro</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-semibold text-emerald-600">{margin}</div>
                </div>
              </div>
            </div>

            {/* ── Estoque ───────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5" /> Estoque
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Estoque Total</Label>
                  <Input type="number" min="0" value={form.stock_total ?? 0} onChange={e => setField("stock_total", parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Estoque Exposição</Label>
                  <Input type="number" min="0" value={form.stock_display ?? 0} onChange={e => setField("stock_display", parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Mínimo Exposição</Label>
                  <Input type="number" min="0" value={form.min_display_stock ?? 0} onChange={e => setField("min_display_stock", parseInt(e.target.value) || 0)} />
                  <p className="text-xs text-muted-foreground mt-0.5">Alerta abaixo deste valor</p>
                </div>
              </div>
            </div>

            {/* ── Opções / Adicionais ───────────────────────────────── */}
            <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-blue-500" /> Opções / Adicionais
              </p>

              {/* Toggle: Item adicional */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${hasAdditionals ? "bg-blue-50 border-blue-200" : "bg-white border-border"}`}>
                <Switch checked={hasAdditionals} onCheckedChange={v => { setHasAdditionals(v); if (!v) { setAdditionals([]); setMaxAdditionals(0); } }} id="has-additionals" />
                <div className="flex-1">
                  <Label htmlFor="has-additionals" className="cursor-pointer font-semibold text-sm">
                    Tem Opções / Adicionais / Acompanhamentos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Permite selecionar extras no PDV (ex: Marmita → carnes, Açaí → morango, etc.)
                  </p>
                </div>
                {hasAdditionals && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200" variant="outline">
                    <List className="h-3 w-3 mr-1" /> Ativo
                  </Badge>
                )}
              </div>

              {hasAdditionals && (
                <div className="space-y-4">

                  {/* Limite de seleção */}
                  <div className="rounded-lg border bg-white overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex-1">
                        <Label className="font-semibold text-sm">Limite de Acompanhamentos</Label>
                        <p className="text-xs text-muted-foreground">
                          Máximo de opções que o cliente pode escolher. <strong>0 = Sem limite</strong>.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMaxAdditionals(m => Math.max(0, m - 1))}>−</Button>
                        <Input type="number" min="0" value={maxAdditionals} onChange={e => setMaxAdditionals(parseInt(e.target.value) || 0)} className="w-16 text-center font-bold" />
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMaxAdditionals(m => m + 1)}>+</Button>
                      </div>
                    </div>
                    {maxAdditionals > 0 && (
                      <div className="bg-blue-50 border-t border-blue-100 px-3 py-2 text-xs text-blue-700 flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                        O cliente poderá escolher até <strong>{maxAdditionals}</strong> opção(es).
                      </div>
                    )}
                    {maxAdditionals === 0 && (
                      <div className="bg-amber-50 border-t border-amber-100 px-3 py-2 text-xs text-amber-700 flex items-center gap-1.5">
                        <span>💡</span>
                        Todos os adicionais escolhidos serão cobrados pelo preço individual.
                      </div>
                    )}
                  </div>

                  {/* Lista de adicionais configurados */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      Opções / Carnes / Itens disponíveis:
                    </Label>

                    {additionals.length === 0 ? (
                      <div className="py-4 text-center border border-dashed rounded-lg text-sm text-muted-foreground">
                        Nenhum adicional cadastrado ainda. Adicione abaixo ↓
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {additionals.map((a, i) => (
                          <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-white transition-opacity ${!a.active ? "opacity-50" : ""}`}>
                            <Switch checked={a.active} onCheckedChange={() => toggleAdditional(i)} className="scale-[0.8]" />
                            <span className="flex-1 text-sm font-medium">{a.name}</span>
                            <div className="flex items-center gap-1.5">
                              {a.price > 0 ? (
                                <span className="text-sm font-semibold text-orange-600">+{fmt(a.price)}</span>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">R$ 0,00</span>
                              )}
                              {a.price > 0 && (
                                <span className="text-[10px] text-muted-foreground bg-orange-50 border border-orange-200 text-orange-600 px-1.5 py-0.5 rounded">pago</span>
                              )}
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50" onClick={() => removeAdditional(i)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new */}
                    <div className="flex gap-2 items-end pt-1">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Nome da Opção/Carne/Adicional</Label>
                        <Input
                          placeholder="Ex: Picanha, Morango, Média..."
                          value={newAddName}
                          onChange={e => setNewAddName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAdditional(); } }}
                        />
                      </div>
                      <div className="w-28">
                        <Label className="text-xs text-muted-foreground">Preço extra (R$)</Label>
                        <Input
                          type="number" step="0.01" min="0"
                          placeholder="0,00"
                          value={newAddPrice || ""}
                          onChange={e => setNewAddPrice(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <Button type="button" onClick={addAdditional} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                        <CirclePlus className="h-4 w-4" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* Summary */}
                  {additionals.length > 0 && (
                    <div className="text-xs bg-white rounded-lg border px-3 py-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Adicionais ativos:</span>
                        <strong>{additionals.filter(a => a.active).length} de {additionals.length}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Limite de seleção:</span>
                        <strong className="text-blue-600">{maxAdditionals === 0 ? "sem limite" : `máx. ${maxAdditionals}`}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Status ────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Switch checked={form.active ?? true} onCheckedChange={v => setField("active", v)} />
              <div>
                <p className="text-sm font-medium">{form.active ? "Produto Ativo" : "Produto Inativo"}</p>
                <p className="text-xs text-muted-foreground">Produtos inativos não aparecem no PDV</p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Cadastrar Produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ DIALOG: Duplicar Produto (Apenas Nome e Foto) ═════════════════ */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Copy className="h-5 w-5" />
              Duplicar Produto
            </DialogTitle>
          </DialogHeader>

          {duplicateBaseProduct && (
            <form onSubmit={handleDuplicateSubmit} className="space-y-4">
              <div className="bg-muted/40 p-3 rounded-xl border space-y-1 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-blue-600" />
                  Baseado em: {duplicateBaseProduct.name}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  <span>Preço: <strong>{fmt(duplicateBaseProduct.price)}</strong></span>
                  <span>Categoria: <strong>{duplicateBaseProduct.category || "—"}</strong></span>
                  <span>Estoque: <strong>{duplicateBaseProduct.stock_total}</strong></span>
                </div>
              </div>

              {/* Nome do Novo Produto */}
              <div className="space-y-1.5">
                <Label htmlFor="dup-name">Novo Nome do Produto *</Label>
                <Input
                  id="dup-name"
                  value={duplicateName}
                  onChange={e => setDuplicateName(e.target.value)}
                  placeholder="Ex: Açaí 500ml..."
                  autoFocus
                  required
                />
              </div>

              {/* Foto do Produto */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <ImageIcon className="h-4 w-4" /> Foto do Novo Produto
                </Label>
                <div className="flex items-start gap-3">
                  <div className="h-20 w-20 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                    {duplicateImageUrl ? (
                      <img src={duplicateImageUrl} alt="Preview" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <Input 
                      type="file" 
                      accept="image/*" 
                      className="h-9 text-xs cursor-pointer"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        try {
                          toast.loading("Processando imagem...");
                          const reader = new FileReader();
                          reader.readAsDataURL(file);
                          reader.onload = (event) => {
                            const img = new Image();
                            img.src = event.target?.result as string;
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              const maxDim = 800;
                              let width = img.width;
                              let height = img.height;
                              if (width > height) {
                                if (width > maxDim) {
                                  height = Math.round((height * maxDim) / width);
                                  width = maxDim;
                                }
                              } else {
                                if (height > maxDim) {
                                  width = Math.round((width * maxDim) / height);
                                  height = maxDim;
                                }
                              }
                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext('2d');
                              ctx?.drawImage(img, 0, 0, width, height);

                              canvas.toBlob(async (blob) => {
                                if (!blob) {
                                  toast.dismiss();
                                  toast.error("Erro ao comprimir");
                                  return;
                                }
                                const fileName = `${storeId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                                try {
                                  const { error } = await supabase.storage
                                    .from('product-images')
                                    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
                                  if (error) throw error;
                                  const { data: { publicUrl } } = supabase.storage
                                    .from('product-images')
                                    .getPublicUrl(fileName);
                                  setDuplicateImageUrl(publicUrl);
                                  toast.dismiss();
                                  toast.success("Foto atualizada!");
                                } catch (_) {
                                  const r = new FileReader();
                                  r.readAsDataURL(blob);
                                  r.onloadend = () => {
                                    setDuplicateImageUrl(r.result as string);
                                    toast.dismiss();
                                    toast.success("Foto salva!");
                                  };
                                }
                              }, 'image/jpeg', 0.82);
                            };
                          };
                        } catch (err: any) {
                          toast.dismiss();
                          toast.error(`Erro ao carregar foto: ${err.message}`);
                        }
                      }}
                    />

                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Ou cole o link da foto..."
                        value={duplicateImageUrl}
                        onChange={e => setDuplicateImageUrl(e.target.value)}
                        className="h-8 text-xs"
                      />
                      {duplicateImageUrl && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          type="button"
                          onClick={() => setDuplicateImageUrl("")}
                          title="Remover foto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeDuplicateDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={upsertMutation.isPending} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                  <Copy className="h-4 w-4" />
                  {upsertMutation.isPending ? "Duplicando..." : "Salvar e Duplicar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
