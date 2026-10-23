import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Package, Search, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  XCircle, ArrowUpCircle, ArrowDownCircle, ClipboardList, Filter, RefreshCw,
  DollarSign, Boxes, ShieldAlert, BarChart3, Plus, Pencil, Trash2,
  MoreVertical, ToggleLeft, Tag, ScanBarcode, Copy, Eye,
} from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type StockMovement = Tables<"stock_movements">;
type StockStatus = "ok" | "low" | "critical" | "empty";

const emptyProduct: Partial<TablesInsert<"products">> = {
  name: "", barcode: "", category: "", description: "",
  cost: 0, price: 0, stock_total: 0, stock_display: 0, min_display_stock: 0, active: true,
};

function getStockStatus(p: Product): StockStatus {
  if (p.stock_display === 0) return "empty";
  if (p.stock_display <= p.min_display_stock * 0.5) return "critical";
  if (p.stock_display <= p.min_display_stock) return "low";
  return "ok";
}

const STATUS_CFG: Record<StockStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ok: { label: "Normal", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
  low: { label: "Baixo", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> },
  critical: { label: "Crítico", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: <ShieldAlert className="h-4 w-4 text-red-600" /> },
  empty: { label: "Zerado", color: "text-slate-500", bg: "bg-slate-100 border-slate-300", icon: <XCircle className="h-4 w-4 text-slate-500" /> },
};

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

function KpiCard({ title, value, sub, icon, colorClass }: { title: string; value: string | number; sub?: string; icon: React.ReactNode; colorClass: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className={`text-2xl font-bold font-['Space_Grotesk'] ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorClass.replace("text-", "bg-").replace("-600", "-100")}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Stock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Product dialog ────────────────────────────────────────────────────────
  const [productOpen, setProductOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const setField = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  // ── Adjust dialog ─────────────────────────────────────────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjProduct, setAdjProduct] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<"in" | "out">("in");
  const [adjQty, setAdjQty] = useState(1);
  const [adjReason, setAdjReason] = useState("");

  // ── History dialog ────────────────────────────────────────────────────────
  const [histOpen, setHistOpen] = useState(false);
  const [histProduct, setHistProduct] = useState<Product | null>(null);

  // ── View dialog ───────────────────────────────────────────────────────────
  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  // ── Profile ───────────────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("store_id").eq("auth_user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });
  const storeId = profile?.store_id;

  // ── Products ──────────────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", storeId], enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("store_id", storeId!).order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  // ── Movements ─────────────────────────────────────────────────────────────
  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", storeId], enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements").select("*").eq("store_id", storeId!).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  // ── History for product ───────────────────────────────────────────────────
  const { data: prodMovements = [], isLoading: loadHist } = useQuery({
    queryKey: ["stock_movements", histProduct?.id], enabled: !!histProduct,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements").select("*").eq("product_id", histProduct!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  // ── Upsert product ────────────────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: async (data: Partial<TablesInsert<"products">>) => {
      if (editingId) {
        const { error } = await supabase.from("products").update({ ...data, store_id: storeId! }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...data, store_id: storeId! } as TablesInsert<"products">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(editingId ? "Produto atualizado!" : "Produto cadastrado!");
      closeProduct();
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  // ── Delete product ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); toast.success("Produto removido!"); },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("products").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); toast.success("Status atualizado!"); },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  // ── Adjust stock ──────────────────────────────────────────────────────────
  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjProduct || !storeId) throw new Error("Dados inválidos");
      if (adjQty <= 0) throw new Error("Quantidade deve ser maior que zero");
      const delta = adjType === "in" ? adjQty : -adjQty;
      const newTotal = adjProduct.stock_total + delta;
      const newDisplay = adjProduct.stock_display + delta;
      if (newDisplay < 0 || newTotal < 0) throw new Error("Estoque ficaria negativo");
      const { error: m } = await supabase.from("stock_movements").insert({ product_id: adjProduct.id, store_id: storeId, type: adjType, quantity: adjQty, reason: adjReason || null } as TablesInsert<"stock_movements">);
      if (m) throw m;
      const { error: p } = await supabase.from("products").update({ stock_total: Math.max(0, newTotal), stock_display: Math.max(0, newDisplay) }).eq("id", adjProduct.id);
      if (p) throw p;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success(adjType === "in" ? "Entrada registrada!" : "Saída registrada!");
      closeAdjust();
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openNewProduct = () => { setEditingId(null); setForm(emptyProduct); setProductOpen(true); };
  const openEditProduct = (p: Product) => {
    setEditingId(p.id);
    setForm({ name: p.name, barcode: p.barcode, category: p.category, description: p.description, cost: p.cost, price: p.price, stock_total: p.stock_total, stock_display: p.stock_display, min_display_stock: p.min_display_stock, active: p.active });
    setProductOpen(true);
  };
  const closeProduct = () => { setProductOpen(false); setEditingId(null); setForm(emptyProduct); };

  const openAdjust = (p: Product, type: "in" | "out") => { setAdjProduct(p); setAdjType(type); setAdjQty(1); setAdjReason(""); setAdjustOpen(true); };
  const closeAdjust = () => { setAdjustOpen(false); setAdjProduct(null); };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    upsertMutation.mutate(form);
  };

  const handleDelete = (p: Product) => {
    if (confirm(`Remover "${p.name}"? Esta ação não pode ser desfeita.`)) deleteMutation.mutate(p.id);
  };

  const duplicateProduct = (p: Product) => {
    setEditingId(null);
    setForm({ name: p.name + " (cópia)", barcode: "", category: p.category, description: p.description, cost: p.cost, price: p.price, stock_total: 0, stock_display: 0, min_display_stock: p.min_display_stock, active: true });
    setProductOpen(true);
    toast.info("Duplicado — ajuste o nome e salve");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort(), [products]);
  const productMap = useMemo(() => { const m: Record<string, Product> = {}; products.forEach(p => (m[p.id] = p)); return m; }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const s = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase());
    const c = catFilter === "all" || p.category === catFilter;
    const st = statusFilter === "all" || getStockStatus(p) === statusFilter;
    return s && c && st;
  }), [products, search, catFilter, statusFilter]);

  const kpis = useMemo(() => ({
    total: products.length,
    stockValue: products.reduce((s, p) => s + p.stock_total * p.cost, 0),
    saleValue: products.reduce((s, p) => s + p.stock_total * p.price, 0),
    critical: products.filter(p => ["critical", "empty"].includes(getStockStatus(p))).length,
    empty: products.filter(p => getStockStatus(p) === "empty").length,
    low: products.filter(p => getStockStatus(p) === "low").length,
    ok: products.filter(p => getStockStatus(p) === "ok").length,
    inactive: products.filter(p => !p.active).length,
  }), [products]);

  const alertProducts = [...products].filter(p => getStockStatus(p) !== "ok").sort((a, b) => {
    const o: Record<string, number> = { empty: 0, critical: 1, low: 2, ok: 3 };
    return o[getStockStatus(a)] - o[getStockStatus(b)];
  });

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> Controle de Estoque
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{products.length} produtos cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["stock_movements"] }); toast.info("Atualizado!"); }} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button onClick={openNewProduct} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total de Produtos" value={kpis.total} sub={`${kpis.ok} normais · ${kpis.inactive} inativos`} icon={<Package className="h-5 w-5 text-blue-600" />} colorClass="text-blue-600" />
        <KpiCard title="Valor em Estoque (Custo)" value={fmt(kpis.stockValue)} sub={`Venda: ${fmt(kpis.saleValue)}`} icon={<DollarSign className="h-5 w-5 text-emerald-600" />} colorClass="text-emerald-600" />
        <KpiCard title="Alertas Críticos" value={kpis.critical} sub={`${kpis.empty} zerados, ${kpis.critical - kpis.empty} críticos`} icon={<ShieldAlert className="h-5 w-5 text-red-600" />} colorClass="text-red-600" />
        <KpiCard title="Estoque Baixo" value={kpis.low} sub="abaixo do mínimo definido" icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} colorClass="text-amber-600" />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="inventory" className="gap-1.5"><Boxes className="h-4 w-4" /> Estoque</TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Movimentações</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 relative">
            <AlertTriangle className="h-4 w-4" /> Alertas
            {alertProducts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {alertProducts.length > 9 ? "9+" : alertProducts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ══ ESTOQUE ══════════════════════════════════════════════════════ */}
        <TabsContent value="inventory" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto, código, categoria..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="ok">Normal</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="empty">Zerado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><RefreshCw className="h-5 w-5 animate-spin" /> Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <Package className="h-14 w-14 opacity-25" />
                  <p className="font-medium">Nenhum produto encontrado</p>
                  <Button size="sm" variant="outline" onClick={openNewProduct}><Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro produto</Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Produto</TableHead>
                        <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Exposição</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">Mínimo</TableHead>
                        <TableHead className="hidden xl:table-cell">Nível</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Preço</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(p => {
                        const st = getStockStatus(p);
                        const cfg = STATUS_CFG[st];
                        const pct = p.min_display_stock > 0 ? Math.min(100, Math.round((p.stock_display / (p.min_display_stock * 2)) * 100)) : 100;
                        return (
                          <TableRow key={p.id} className={!p.active ? "opacity-50" : st === "critical" ? "bg-red-50/30" : ""}>
                            <TableCell>
                              <div>
                                <span className="font-medium">{p.name}</span>
                                {p.barcode && <span className="block text-xs text-muted-foreground font-mono">{p.barcode}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {p.category ? <Badge variant="secondary">{p.category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{p.stock_total}</TableCell>
                            <TableCell className={`text-right hidden md:table-cell font-semibold tabular-nums ${cfg.color}`}>{p.stock_display}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell text-muted-foreground tabular-nums">{p.min_display_stock}</TableCell>
                            <TableCell className="hidden xl:table-cell w-28">
                              <Progress value={pct} className={`h-2 ${st === "empty" ? "[&>div]:bg-slate-400" : st === "critical" ? "[&>div]:bg-red-500" : st === "low" ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`} />
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-right text-sm">{fmt(p.price)}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" title="Entrada" onClick={() => openAdjust(p, "in")}>
                                  <ArrowUpCircle className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" title="Saída" onClick={() => openAdjust(p, "out")} disabled={p.stock_display === 0}>
                                  <ArrowDownCircle className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem onClick={() => { setViewProduct(p); setViewOpen(true); }}>
                                      <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditProduct(p)}>
                                      <Pencil className="h-4 w-4 mr-2" /> Editar produto
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => duplicateProduct(p)}>
                                      <Copy className="h-4 w-4 mr-2" /> Duplicar produto
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => openAdjust(p, "in")}>
                                      <TrendingUp className="h-4 w-4 mr-2 text-emerald-600" /> Entrada de estoque
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openAdjust(p, "out")} disabled={p.stock_display === 0}>
                                      <TrendingDown className="h-4 w-4 mr-2 text-red-500" /> Saída de estoque
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setHistProduct(p); setHistOpen(true); }}>
                                      <ClipboardList className="h-4 w-4 mr-2" /> Histórico
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}>
                                      <ToggleLeft className="h-4 w-4 mr-2" />
                                      {p.active ? "Desativar produto" : "Ativar produto"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(p)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Remover produto
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">{filtered.length} de {products.length} produtos exibidos</p>
          )}
        </TabsContent>

        {/* ══ MOVIMENTAÇÕES ════════════════════════════════════════════════ */}
        <TabsContent value="movements">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Últimas Movimentações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <ClipboardList className="h-12 w-12 opacity-30" /><p>Nenhuma movimentação registrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Data / Hora</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-center">Tipo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="hidden md:table-cell">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.slice(0, 100).map(m => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                          <TableCell className="font-medium">{productMap[m.product_id]?.name ?? <span className="text-muted-foreground text-xs italic">Produto removido</span>}</TableCell>
                          <TableCell className="text-center">
                            {m.type === "in" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><TrendingUp className="h-3 w-3" /> Entrada</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"><TrendingDown className="h-3 w-3" /> Saída</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className={m.type === "in" ? "text-emerald-600" : "text-red-600"}>{m.type === "in" ? "+" : "-"}{m.quantity}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.reason || <span className="italic">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ ALERTAS ══════════════════════════════════════════════════════ */}
        <TabsContent value="alerts" className="space-y-3">
          {alertProducts.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 opacity-80" />
              <p className="font-semibold text-emerald-700">Tudo certo! Nenhum alerta de estoque.</p>
              <p className="text-sm text-muted-foreground">Todos os produtos estão acima do nível mínimo.</p>
            </CardContent></Card>
          ) : alertProducts.map(p => {
            const st = getStockStatus(p);
            const cfg = STATUS_CFG[st];
            return (
              <Card key={p.id} className={`border ${cfg.bg}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full border ${cfg.bg}`}>{cfg.icon}</div>
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Exposição: <strong className={cfg.color}>{p.stock_display}</strong> / mínimo: {p.min_display_stock} · Total: {p.stock_total}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <Button size="sm" variant="outline" onClick={() => openEditProduct(p)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                      <Button size="sm" onClick={() => openAdjust(p, "in")} className="gap-1"><ArrowUpCircle className="h-4 w-4" /> Repor</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* ══ DIALOG: Cadastrar / Editar Produto ══════════════════════════════ */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingId ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProductSubmit} className="space-y-5">

            {/* Identificação */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Identificação</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nome do Produto *</Label>
                  <Input value={form.name ?? ""} onChange={e => setField("name", e.target.value)} placeholder="Ex: Camiseta Básica Preta" />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><ScanBarcode className="h-3.5 w-3.5" /> Código de Barras</Label>
                  <Input value={form.barcode ?? ""} onChange={e => setField("barcode", e.target.value)} placeholder="EAN-13 ou interno" />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input value={form.category ?? ""} onChange={e => setField("category", e.target.value)} placeholder="Ex: Roupas, Calçados..." list="categories-list" />
                  <datalist id="categories-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="sm:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea value={form.description ?? ""} onChange={e => setField("description", e.target.value)} placeholder="Detalhes do produto..." rows={2} />
                </div>
              </div>
            </div>

            {/* Preços */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Preços</p>
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
                  <Label>Margem</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-medium">
                    {form.cost && form.cost > 0 && form.price && form.price > 0
                      ? `${(((form.price - form.cost) / form.cost) * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Estoque */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1"><Boxes className="h-3.5 w-3.5" /> Estoque</p>
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
                  <p className="text-xs text-muted-foreground mt-1">Alerta abaixo deste valor</p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Switch checked={form.active ?? true} onCheckedChange={v => setField("active", v)} />
              <div>
                <p className="text-sm font-medium">{form.active ? "Produto Ativo" : "Produto Inativo"}</p>
                <p className="text-xs text-muted-foreground">Produtos inativos não aparecem no PDV</p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <DialogClose asChild><Button type="button" variant="outline" onClick={closeProduct}>Cancelar</Button></DialogClose>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Cadastrar Produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ DIALOG: Ajuste de Estoque ════════════════════════════════════════ */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjType === "in" ? <ArrowUpCircle className="h-5 w-5 text-emerald-600" /> : <ArrowDownCircle className="h-5 w-5 text-red-500" />}
              {adjType === "in" ? "Entrada de Estoque" : "Saída de Estoque"}
            </DialogTitle>
          </DialogHeader>
          {adjProduct && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 border p-3">
                <p className="font-medium">{adjProduct.name}</p>
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  <span>Total: <strong>{adjProduct.stock_total}</strong></span>
                  <span>Exposição: <strong>{adjProduct.stock_display}</strong></span>
                  <span>Mínimo: <strong>{adjProduct.min_display_stock}</strong></span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={adjType === "in" ? "default" : "outline"} className={adjType === "in" ? "bg-emerald-600 hover:bg-emerald-700" : ""} onClick={() => setAdjType("in")}>
                  <TrendingUp className="h-4 w-4 mr-2" /> Entrada
                </Button>
                <Button type="button" variant={adjType === "out" ? "default" : "outline"} className={adjType === "out" ? "bg-red-600 hover:bg-red-700" : ""} onClick={() => setAdjType("out")}>
                  <TrendingDown className="h-4 w-4 mr-2" /> Saída
                </Button>
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" min={1} max={adjType === "out" ? adjProduct.stock_display : undefined} value={adjQty} onChange={e => setAdjQty(Math.max(1, parseInt(e.target.value) || 1))} />
                {adjType === "out" && <p className="text-xs text-muted-foreground mt-1">Disponível na exposição: {adjProduct.stock_display}</p>}
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea placeholder={adjType === "in" ? "Ex: Reposição de fornecedor..." : "Ex: Avaria, perda, devolução..."} value={adjReason} onChange={e => setAdjReason(e.target.value)} rows={2} />
              </div>
              <div className="rounded-lg border p-3 bg-muted/30 space-y-2 text-sm">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Prévia após ajuste</p>
                {[["Estoque total", adjProduct.stock_total], ["Estoque exposição", adjProduct.stock_display]].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-semibold">
                      {val} → <span className={adjType === "in" ? "text-emerald-600" : "text-red-600"}>{Math.max(0, (val as number) + (adjType === "in" ? adjQty : -adjQty))}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline" onClick={closeAdjust}>Cancelar</Button></DialogClose>
            <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending} className={adjType === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {adjustMutation.isPending ? "Salvando..." : adjType === "in" ? "Confirmar Entrada" : "Confirmar Saída"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ DIALOG: Histórico ════════════════════════════════════════════════ */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />Histórico — {histProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {loadHist ? (
              <div className="flex justify-center py-10 text-muted-foreground gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : prodMovements.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground gap-2"><ClipboardList className="h-10 w-10 opacity-30" /><p>Nenhuma movimentação registrada.</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow className="bg-muted/40"><TableHead>Data / Hora</TableHead><TableHead className="text-center">Tipo</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {prodMovements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                      <TableCell className="text-center">
                        {m.type === "in"
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><TrendingUp className="h-3 w-3" /> Entrada</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"><TrendingDown className="h-3 w-3" /> Saída</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold"><span className={m.type === "in" ? "text-emerald-600" : "text-red-600"}>{m.type === "in" ? "+" : "-"}{m.quantity}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.reason || <span className="italic">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ DIALOG: Ver Detalhes ═════════════════════════════════════════════ */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Detalhes do Produto</DialogTitle>
          </DialogHeader>
          {viewProduct && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{viewProduct.name}</h3>
                  {viewProduct.barcode && <p className="text-sm font-mono text-muted-foreground">{viewProduct.barcode}</p>}
                </div>
                <Badge variant={viewProduct.active ? "default" : "secondary"}>{viewProduct.active ? "Ativo" : "Inativo"}</Badge>
              </div>
              {viewProduct.description && <p className="text-sm text-muted-foreground">{viewProduct.description}</p>}
              {viewProduct.category && <Badge variant="outline">{viewProduct.category}</Badge>}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Custo", fmt(viewProduct.cost)],
                  ["Preço de Venda", fmt(viewProduct.price)],
                  ["Estoque Total", viewProduct.stock_total],
                  ["Estoque Exposição", viewProduct.stock_display],
                  ["Mínimo Exposição", viewProduct.min_display_stock],
                  ["Valor em Estoque", fmt(viewProduct.stock_total * viewProduct.cost)],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{l}</p>
                    <p className="font-semibold mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              <div className={`rounded-lg border p-3 flex items-center gap-2 ${STATUS_CFG[getStockStatus(viewProduct)].bg}`}>
                {STATUS_CFG[getStockStatus(viewProduct)].icon}
                <span className={`text-sm font-medium ${STATUS_CFG[getStockStatus(viewProduct)].color}`}>
                  Status: {STATUS_CFG[getStockStatus(viewProduct)].label}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
            {viewProduct && (
              <Button onClick={() => { setViewOpen(false); openEditProduct(viewProduct); }}><Pencil className="h-4 w-4 mr-2" /> Editar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
