import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign, ShoppingCart, TrendingUp, Package,
  Receipt, Target, BarChart3, RefreshCw,
  TrendingDown, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Metrics {
  faturamentoHoje: number;
  faturamentoMes: number;
  faturamentoOntem: number;
  faturamentoMesPassado: number;
  lucroDia: number;
  lucroMes: number;
  lucroOntem: number;
  vendasHoje: number;
  vendasOntem: number;
  ticketMedio: number;
  produtosVendidosHoje: number;
  lowStock: number;
}

const EMPTY: Metrics = {
  faturamentoHoje: 0, faturamentoMes: 0,
  faturamentoOntem: 0, faturamentoMesPassado: 0,
  lucroDia: 0, lucroMes: 0, lucroOntem: 0,
  vendasHoje: 0, vendasOntem: 0,
  ticketMedio: 0, produtosVendidosHoje: 0, lowStock: 0,
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── Componente de variação (seta + %) ───────────────────────────────────────
function Delta({ current, previous, prefix = "" }: { current: number; previous: number; prefix?: string }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">Sem dados anteriores</span>;
  if (previous === 0) return <span className="text-xs text-emerald-500 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> Primeiro registro</span>;

  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const color = up ? "text-emerald-500" : "text-red-500";
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`text-xs flex items-center gap-0.5 font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% vs {prefix}
    </span>
  );
}

// ─── Card de KPI ─────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon: Icon, iconColor, bgColor, delta, loading,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; iconColor: string; bgColor: string;
  delta?: React.ReactNode; loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute inset-0 opacity-5 ${bgColor}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${bgColor} bg-opacity-15`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent className="relative">
        {loading ? (
          <div className="h-8 w-28 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {delta && <div className="mt-1.5">{delta}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadMetrics = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Profile & store
      const { data: profile } = await supabase
        .from("profiles").select("store_id, full_name")
        .eq("auth_user_id", user.id).single();
      if (!profile) return;

      const { data: store } = await supabase
        .from("stores").select("name").eq("id", profile.store_id).single();
      if (store) setStoreName(store.name);

      const sid = profile.store_id;

      // Date boundaries
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(todayStart);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      // ── Query sales com sale_items + products para calcular lucro ──────────
      const { data: allSales } = await supabase
        .from("sales")
        .select("id, total, created_at, status")
        .eq("store_id", sid)
        .eq("status", "completed")
        .gte("created_at", lastMonthStart.toISOString());

      if (!allSales) { setLoading(false); return; }

      // ── Busca itens com custo do produto ────────────────────────────────────
      const saleIds = allSales.map(s => s.id);
      const { data: saleItemsRaw } = saleIds.length > 0
        ? await supabase
          .from("sale_items")
          .select("sale_id, quantity, unit_price, product_id")
          .in("sale_id", saleIds)
        : { data: [] };

      // Busca custo dos produtos envolvidos
      const productIds = [...new Set((saleItemsRaw ?? []).map(i => i.product_id))];
      const { data: productsRaw } = productIds.length > 0
        ? await supabase.from("products").select("id, cost").in("id", productIds)
        : { data: [] };

      const costMap: Record<string, number> = {};
      (productsRaw ?? []).forEach(p => { costMap[p.id] = Number(p.cost); });

      // Lucro por venda = soma de (unit_price - cost) * qty para cada item
      const profitBySale: Record<string, number> = {};
      (saleItemsRaw ?? []).forEach(item => {
        const cost = costMap[item.product_id] ?? 0;
        const lucroItem = (Number(item.unit_price) - cost) * Number(item.quantity);
        profitBySale[item.sale_id] = (profitBySale[item.sale_id] ?? 0) + lucroItem;
      });

      // ── Filtra por período ─────────────────────────────────────────────────
      const todaySales = allSales.filter(s => new Date(s.created_at) >= todayStart);
      const yesterdaySales = allSales.filter(s => {
        const d = new Date(s.created_at);
        return d >= yesterdayStart && d < yesterdayEnd;
      });
      const monthSales = allSales.filter(s => new Date(s.created_at) >= monthStart);
      const lastMonthSales = allSales.filter(s => {
        const d = new Date(s.created_at);
        return d >= lastMonthStart && d < lastMonthEnd;
      });

      const sum = (sales: typeof allSales, key: "total") =>
        sales.reduce((acc, s) => acc + Number(s[key]), 0);

      const sumProfit = (sales: typeof allSales) =>
        sales.reduce((acc, s) => acc + (profitBySale[s.id] ?? 0), 0);

      // ── Produtos vendidos hoje ─────────────────────────────────────────────
      const todaySaleIds = todaySales.map(s => s.id);
      const { data: todayItems } = todaySaleIds.length > 0
        ? await supabase.from("sale_items").select("quantity").in("sale_id", todaySaleIds)
        : { data: [] };
      const produtosVendidosHoje = (todayItems ?? []).reduce((s, i) => s + Number(i.quantity), 0);

      // ── Produtos com estoque baixo ─────────────────────────────────────────
      const { data: stockProds } = await supabase
        .from("products").select("id, stock_display, min_display_stock")
        .eq("store_id", sid).eq("active", true);
      const lowStock = (stockProds ?? []).filter(
        p => Number(p.stock_display) <= Number(p.min_display_stock)
      ).length;

      // ── Monta métricas ─────────────────────────────────────────────────────
      const faturamentoHoje = sum(todaySales, "total");
      const faturamentoOntem = sum(yesterdaySales, "total");
      const faturamentoMes = sum(monthSales, "total");
      const faturamentoMesPassado = sum(lastMonthSales, "total");
      const lucroDia = sumProfit(todaySales);
      const lucroMes = sumProfit(monthSales);
      const lucroOntem = sumProfit(yesterdaySales);
      const vendasHoje = todaySales.length;
      const vendasOntem = yesterdaySales.length;
      const ticketMedio = vendasHoje > 0 ? faturamentoHoje / vendasHoje : 0;

      setMetrics({
        faturamentoHoje, faturamentoMes,
        faturamentoOntem, faturamentoMesPassado,
        lucroDia, lucroMes, lucroOntem,
        vendasHoje, vendasOntem, ticketMedio,
        produtosVendidosHoje, lowStock,
      });
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMetrics(); }, [user]);

  const {
    faturamentoHoje, faturamentoMes, faturamentoOntem, faturamentoMesPassado,
    lucroDia, lucroMes, lucroOntem, vendasHoje, vendasOntem,
    ticketMedio, produtosVendidosHoje, lowStock,
  } = metrics;

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {storeName || "Carregando..."} · Atualizado: {lastRefresh.toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMetrics} disabled={loading} className="gap-2 self-start sm:self-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* ── Linha 1: Financeiro principal (4 cards) ───────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> Financeiro
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Faturamento Hoje"
            value={fmt(faturamentoHoje)}
            icon={DollarSign} iconColor="text-emerald-600" bgColor="bg-emerald-500"
            loading={loading}
            delta={<Delta current={faturamentoHoje} previous={faturamentoOntem} prefix="ontem" />}
          />
          <KpiCard
            title="Faturamento do Mês"
            value={fmt(faturamentoMes)}
            icon={BarChart3} iconColor="text-blue-600" bgColor="bg-blue-500"
            loading={loading}
            delta={<Delta current={faturamentoMes} previous={faturamentoMesPassado} prefix="mês ant." />}
          />
          <KpiCard
            title="Lucro do Dia"
            value={fmt(lucroDia)}
            sub={faturamentoHoje > 0 ? `Margem: ${((lucroDia / faturamentoHoje) * 100).toFixed(1)}%` : undefined}
            icon={TrendingUp} iconColor="text-violet-600" bgColor="bg-violet-500"
            loading={loading}
            delta={<Delta current={lucroDia} previous={lucroOntem} prefix="ontem" />}
          />
          <KpiCard
            title="Lucro do Mês"
            value={fmt(lucroMes)}
            sub={faturamentoMes > 0 ? `Margem: ${((lucroMes / faturamentoMes) * 100).toFixed(1)}%` : undefined}
            icon={TrendingUp} iconColor="text-indigo-600" bgColor="bg-indigo-500"
            loading={loading}
          />
        </div>
      </div>

      {/* ── Linha 2: Métricas operacionais (3 cards) ──────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5" /> Operacional — Hoje
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Total de Vendas Hoje"
            value={vendasHoje.toString()}
            sub={vendasHoje === 1 ? "1 transação" : `${vendasHoje} transações`}
            icon={Receipt} iconColor="text-amber-600" bgColor="bg-amber-500"
            loading={loading}
            delta={<Delta current={vendasHoje} previous={vendasOntem} prefix="ontem" />}
          />
          <KpiCard
            title="Ticket Médio"
            value={fmt(ticketMedio)}
            sub="Faturamento ÷ Vendas"
            icon={Target} iconColor="text-cyan-600" bgColor="bg-cyan-500"
            loading={loading}
          />
          <KpiCard
            title="Produtos Vendidos"
            value={produtosVendidosHoje.toString()}
            sub="unidades hoje"
            icon={Package} iconColor="text-rose-600" bgColor="bg-rose-500"
            loading={loading}
          />
        </div>
      </div>

      {/* ── Linha 3: Alerta de estoque + resumo diário ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Resumo do dia */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Resumo do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Faturamento", value: fmt(faturamentoHoje), color: "text-emerald-600" },
              { label: "Descontos concedidos", value: "—", color: "text-red-500" },
              { label: "Lucro bruto", value: fmt(lucroDia), color: "text-violet-600" },
              { label: "Margem de lucro", value: faturamentoHoje > 0 ? `${((lucroDia / faturamentoHoje) * 100).toFixed(1)}%` : "—", color: "text-indigo-600" },
              { label: "Nº de vendas", value: vendasHoje.toString(), color: "text-foreground" },
              { label: "Ticket médio", value: fmt(ticketMedio), color: "text-cyan-600" },
              { label: "Unidades vendidas", value: produtosVendidosHoje.toString(), color: "text-rose-600" },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`font-semibold ${row.color}`}>{loading ? "..." : row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alertas de estoque + status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-500" /> Status Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">Estoque baixo / zerado</p>
                <p className="text-xs text-muted-foreground">Produtos abaixo do mínimo</p>
              </div>
              <Badge variant={lowStock > 0 ? "destructive" : "secondary"} className="text-base px-3">
                {loading ? "..." : lowStock}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div>
                <p className="text-sm font-medium text-emerald-700">Faturamento este mês</p>
                <p className="text-xs text-emerald-600">vs. mês anterior</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-700">{loading ? "..." : fmt(faturamentoMes)}</p>
                {!loading && (
                  <Delta current={faturamentoMes} previous={faturamentoMesPassado} prefix="mês ant." />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <div>
                <p className="text-sm font-medium text-indigo-700">Lucro este mês</p>
                <p className="text-xs text-indigo-600">
                  {faturamentoMes > 0 ? `Margem: ${((lucroMes / faturamentoMes) * 100).toFixed(1)}%` : "Sem vendas ainda"}
                </p>
              </div>
              <p className="font-bold text-indigo-700">{loading ? "..." : fmt(lucroMes)}</p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
