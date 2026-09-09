import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FileDown,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  RefreshCw,
  BarChart3,
  Receipt,
  Target,
  Calendar,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Search,
  Users,
  ChevronRight,
  HandCoins,
  CreditCard,
  Banknote,
  QrCode,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import {
  getAllPromissorias,
  payInstallment,
  cancelPromissoria,
  type Promissoria,
  type PromissoriaInstallment,
} from "@/lib/promissoria";

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const fmtDateTime = (dateStr: string) =>
  new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// ─── Types ───────────────────────────────────────────────────────────────────
interface SaleRow {
  id: string;
  total: number;
  created_at: string;
  status: string;
  payment_method?: string;
  table_name?: string;
  notes?: string;
}

interface SaleItem {
  sale_id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
}

interface Product {
  id: string;
  name: string;
  cost: number;
}

interface DailyData {
  date: string;
  faturamento: number;
  lucro: number;
  vendas: number;
}

interface TopProduct {
  name: string;
  quantidade: number;
  faturamento: number;
  lucro: number;
}

type PeriodKey = "7d" | "30d" | "90d" | "mes_atual" | "mes_passado";
type ReportTab = "dia" | "produtos" | "receber" | "geral";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "mes_atual", label: "Mês atual" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "mes_passado", label: "Mês passado" },
];

const CHART_COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

function getPeriodRange(period: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "7d":
      return { start: new Date(today.getTime() - 6 * 86400000), end: now };
    case "30d":
      return { start: new Date(today.getTime() - 29 * 86400000), end: now };
    case "90d":
      return { start: new Date(today.getTime() - 89 * 86400000), end: now };
    case "mes_atual":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case "mes_passado": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
  }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  iconColor,
  bgColor,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute inset-0 opacity-5 ${bgColor}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
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
      </CardContent>
    </Card>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  // Aba ativa na barra superior
  const [activeTab, setActiveTab] = useState<ReportTab>("dia");

  // Filtros Gerais
  const [period, setPeriod] = useState<PeriodKey>("mes_atual");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");

  // Relatório do Dia Específico
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [daySales, setDaySales] = useState<SaleRow[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  // Métricas do Período
  const [totalFaturamento, setTotalFaturamento] = useState(0);
  const [totalLucro, setTotalLucro] = useState(0);
  const [totalVendas, setTotalVendas] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [margemMedia, setMargemMedia] = useState(0);

  // Dados dos Gráficos e Produtos
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([]);

  // ── Promissórias & Contas a Receber ──
  const [promissoriasList, setPromissoriasList] = useState<Promissoria[]>([]);
  const [promissoriaSearch, setPromissoriaSearch] = useState("");
  const [promissoriaFilterStatus, setPromissoriaFilterStatus] = useState<"all" | "pending" | "paid">("all");
  const [selectedPromissoriaForPayment, setSelectedPromissoriaForPayment] = useState<Promissoria | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState<number>(1);
  const [installmentPayMethod, setInstallmentPayMethod] = useState<string>("dinheiro");

  // Recarregar Promissórias
  const loadPromissorias = () => {
    const list = getAllPromissorias(storeId || undefined);
    setPromissoriasList(list);
  };

  // Carrega vendas de um dia específico
  const loadDaySales = async (dayStr: string, sId: string) => {
    setLoadingDay(true);
    try {
      const startOfDay = new Date(`${dayStr}T00:00:00`);
      const endOfDay = new Date(`${dayStr}T23:59:59.999`);

      const { data, error } = await supabase
        .from("sales")
        .select("id, total, created_at, status, payment_method, table_name, notes")
        .eq("store_id", sId)
        .eq("status", "completed")
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDaySales(data || []);
    } catch (e: any) {
      console.error("Erro ao buscar vendas do dia:", e);
      toast.error("Erro ao carregar vendas do dia selecionado.");
    } finally {
      setLoadingDay(false);
    }
  };

  // Carrega dados completos do relatório
  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("store_id, full_name")
        .eq("auth_user_id", user.id)
        .single();
      if (!profile) return;

      setStoreId(profile.store_id);

      const { data: store } = await supabase
        .from("stores")
        .select("name")
        .eq("id", profile.store_id)
        .single();
      if (store) setStoreName(store.name);

      const sid = profile.store_id;
      const { start, end } = getPeriodRange(period);

      // Carrega vendas do dia inicial
      loadDaySales(selectedDay, sid);
      loadPromissorias();

      // Fetch sales do período
      const { data: sales } = await supabase
        .from("sales")
        .select("id, total, created_at, status, payment_method")
        .eq("store_id", sid)
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (!sales || sales.length === 0) {
        setTotalFaturamento(0);
        setTotalLucro(0);
        setTotalVendas(0);
        setTicketMedio(0);
        setTotalUnidades(0);
        setMargemMedia(0);
        setDailyData([]);
        setTopProducts([]);
        setPaymentMethodData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map((s) => s.id);

      // Fetch sale items
      const { data: saleItemsRaw } = await supabase
        .from("sale_items")
        .select("sale_id, quantity, unit_price, product_id")
        .in("sale_id", saleIds);

      const saleItems: SaleItem[] = (saleItemsRaw ?? []) as SaleItem[];

      // Fetch product costs and names
      const productIds = [...new Set(saleItems.map((i) => i.product_id))];
      const { data: productsRaw } = productIds.length > 0
        ? await supabase.from("products").select("id, name, cost").in("id", productIds)
        : { data: [] };

      const products: Product[] = (productsRaw ?? []) as Product[];
      const costMap: Record<string, number> = {};
      const nameMap: Record<string, string> = {};
      products.forEach((p) => {
        costMap[p.id] = Number(p.cost);
        nameMap[p.id] = p.name;
      });

      // Profit per sale
      const profitBySale: Record<string, number> = {};
      saleItems.forEach((item) => {
        const cost = costMap[item.product_id] ?? 0;
        const lucroItem = (Number(item.unit_price) - cost) * Number(item.quantity);
        profitBySale[item.sale_id] = (profitBySale[item.sale_id] ?? 0) + lucroItem;
      });

      // Totals
      const fat = sales.reduce((acc, s) => acc + Number(s.total), 0);
      const luc = sales.reduce((acc, s) => acc + (profitBySale[s.id] ?? 0), 0);
      const uni = saleItems.reduce((acc, i) => acc + Number(i.quantity), 0);

      setTotalFaturamento(fat);
      setTotalLucro(luc);
      setTotalVendas(sales.length);
      setTicketMedio(sales.length > 0 ? fat / sales.length : 0);
      setTotalUnidades(uni);
      setMargemMedia(fat > 0 ? (luc / fat) * 100 : 0);

      // Daily data grouped by date
      const byDay: Record<string, { faturamento: number; lucro: number; vendas: number }> = {};
      sales.forEach((s) => {
        const day = new Date(s.created_at).toISOString().slice(0, 10);
        if (!byDay[day]) byDay[day] = { faturamento: 0, lucro: 0, vendas: 0 };
        byDay[day].faturamento += Number(s.total);
        byDay[day].lucro += profitBySale[s.id] ?? 0;
        byDay[day].vendas += 1;
      });
      const daily: DailyData[] = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));
      setDailyData(daily);

      // Top products
      const byProduct: Record<string, { quantidade: number; faturamento: number; lucro: number }> = {};
      saleItems.forEach((item) => {
        const pid = item.product_id;
        if (!byProduct[pid]) byProduct[pid] = { quantidade: 0, faturamento: 0, lucro: 0 };
        byProduct[pid].quantidade += Number(item.quantity);
        byProduct[pid].faturamento += Number(item.unit_price) * Number(item.quantity);
        byProduct[pid].lucro += (Number(item.unit_price) - (costMap[pid] ?? 0)) * Number(item.quantity);
      });
      const top: TopProduct[] = Object.entries(byProduct)
        .map(([id, vals]) => ({ name: nameMap[id] ?? "Produto", ...vals }))
        .sort((a, b) => b.quantidade - a.quantidade);
      setTopProducts(top);

      // Payment methods
      const byPayment: Record<string, number> = {};
      (sales as (SaleRow & { payment_method?: string })[]).forEach((s) => {
        const method = (s as any).payment_method ?? "Outros";
        byPayment[method] = (byPayment[method] ?? 0) + Number(s.total);
      });
      const paymentLabels: Record<string, string> = {
        cash: "Dinheiro",
        card: "Cartão",
        pix: "PIX",
        credit: "Crédito",
        debit: "Débito",
        promissoria: "Promissória / A Prazo",
      };
      const paymentData = Object.entries(byPayment).map(([k, v]) => ({
        name: paymentLabels[k] ?? k,
        value: v,
      }));
      setPaymentMethodData(paymentData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [user, period]);

  // Handler para trocar o dia do relatório diário
  const handleDayChange = (newDay: string) => {
    setSelectedDay(newDay);
    if (storeId) {
      loadDaySales(newDay, storeId);
    }
  };

  // Quitar Parcela de Promissória
  const handleConfirmInstallmentPayment = () => {
    if (!selectedPromissoriaForPayment) return;
    const updated = payInstallment(
      selectedPromissoriaForPayment.id,
      selectedInstallmentNumber,
      installmentPayMethod
    );
    if (updated) {
      toast.success("Parcela recebida e baixada com sucesso!");
      loadPromissorias();
      setPaymentModalOpen(false);
      setSelectedPromissoriaForPayment(null);
    } else {
      toast.error("Erro ao registrar baixa da parcela.");
    }
  };

  // Totais do dia selecionado
  const dayTotalFat = daySales.reduce((s, row) => s + Number(row.total), 0);
  const dayVendasCount = daySales.length;
  const dayTicketMedio = dayVendasCount > 0 ? dayTotalFat / dayVendasCount : 0;

  // Formas de pagamento do dia
  const dayByPayment: Record<string, number> = {};
  daySales.forEach((s) => {
    const method = s.payment_method || "Outros";
    dayByPayment[method] = (dayByPayment[method] || 0) + Number(s.total);
  });

  // Totais das Promissórias
  const promissoriasAtivas = promissoriasList.filter((p) => p.status !== "cancelled");
  const totalReceberPendente = promissoriasAtivas.reduce((acc, p) => {
    const pendenteInst = p.installments
      .filter((i) => i.status === "pending")
      .reduce((s, i) => s + i.amount, 0);
    return acc + pendenteInst;
  }, 0);

  const totalJaRecebidoPromissoria = promissoriasAtivas.reduce((acc, p) => {
    const pagoInst = p.installments
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.amount, 0);
    return acc + pagoInst;
  }, 0);

  // Filtro de promissórias
  const filteredPromissorias = promissoriasList.filter((p) => {
    const matchesSearch =
      p.customerName.toLowerCase().includes(promissoriaSearch.toLowerCase()) ||
      (p.customerPhone && p.customerPhone.includes(promissoriaSearch)) ||
      (p.customerDocument && p.customerDocument.includes(promissoriaSearch));

    if (!matchesSearch) return false;

    if (promissoriaFilterStatus === "pending") {
      return p.status === "pending" || p.status === "partially_paid";
    }
    if (promissoriaFilterStatus === "paid") {
      return p.status === "paid";
    }
    return true;
  });

  // ─── PDF Export ──────────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.setFillColor(99, 102, 241);
      pdf.rect(0, 0, pageWidth, 18, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Relatório de Vendas", 10, 11);

      const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? period;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${storeName} · ${periodLabel} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 10, 16);

      let yPos = 22;
      const maxContentHeight = pageHeight - yPos - 10;

      if (imgHeight <= maxContentHeight) {
        pdf.addImage(imgData, "PNG", 10, yPos, imgWidth, imgHeight);
      } else {
        let remainingHeight = imgHeight;
        let sourceY = 0;
        const sliceHeight = (maxContentHeight / imgHeight) * canvas.height;

        while (remainingHeight > 0) {
          const currentSlice = Math.min(sliceHeight, canvas.height - sourceY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = currentSlice;
          const ctx = sliceCanvas.getContext("2d");
          ctx?.drawImage(canvas, 0, -sourceY);

          const sliceData = sliceCanvas.toDataURL("image/png");
          const sliceDisplayHeight = (currentSlice / canvas.height) * imgHeight;
          pdf.addImage(sliceData, "PNG", 10, yPos, imgWidth, sliceDisplayHeight);

          sourceY += currentSlice;
          remainingHeight -= sliceDisplayHeight;

          if (remainingHeight > 0) {
            pdf.addPage();
            yPos = 10;
          }
        }
      }

      const filename = `relatorio_${activeTab}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } finally {
      setDownloading(false);
    }
  };

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "";

  return (
    <div className="space-y-6">
      {/* ── Header Principal ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Central de Relatórios & Financeiro
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {storeName || "Minha Loja"} · Acompanhe vendas, produtos e valores a receber
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === "geral" && (
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-[150px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading} className="gap-2 bg-white">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPDF}
            disabled={loading || downloading}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <FileDown className={`h-4 w-4 ${downloading ? "animate-bounce" : ""}`} />
            {downloading ? "Gerando PDF..." : "Baixar PDF"}
          </Button>
        </div>
      </div>

      {/* ── BARRA SUPERIOR DE NAVEGAÇÃO DE RELATÓRIOS ────────────────────────── */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
        {[
          { id: "dia", label: "Relatório do Dia", icon: Calendar, desc: "Vendas e fechamento diário" },
          { id: "produtos", label: "Produtos Mais Vendidos", icon: Package, desc: "Ranking de itens mais saídos" },
          { id: "receber", label: "Valores a Receber (Promissórias)", icon: HandCoins, desc: "Crediário e cobranças" },
          { id: "geral", label: "Visão Geral & Gráficos", icon: TrendingUp, desc: "Faturamento e comparativos" },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 border ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-semibold"
                  : "bg-slate-50/70 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── CONTEÚDO DAS ABAS ───────────────────────────────────────────────── */}

      {/* 1. ABA: RELATÓRIO DO DIA (COM SELETOR DE DATA) */}
      {activeTab === "dia" && (
        <div className="space-y-6">
          {/* Seletor de Data & Resumo do Dia */}
          <Card className="bg-gradient-to-r from-blue-50/70 to-indigo-50/60 border-blue-100">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> Selecione o Dia para Visualizar:
                </span>
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={selectedDay}
                    onChange={(e) => handleDayChange(e.target.value)}
                    className="w-48 bg-white font-bold text-base border-blue-200 shadow-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDayChange(new Date().toISOString().slice(0, 10))}
                    className="bg-white text-xs text-blue-700 hover:bg-blue-50 border-blue-200"
                  >
                    Hoje
                  </Button>
                </div>
              </div>

              <div className="flex gap-4 sm:gap-6 flex-wrap">
                <div className="bg-white px-4 py-2.5 rounded-xl border border-blue-100 shadow-xs">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">Faturamento do Dia</p>
                  <p className="text-xl font-extrabold text-emerald-600">{fmt(dayTotalFat)}</p>
                </div>
                <div className="bg-white px-4 py-2.5 rounded-xl border border-blue-100 shadow-xs">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">Vendas Realizadas</p>
                  <p className="text-xl font-extrabold text-indigo-900">{dayVendasCount}</p>
                </div>
                <div className="bg-white px-4 py-2.5 rounded-xl border border-blue-100 shadow-xs">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">Ticket Médio</p>
                  <p className="text-xl font-extrabold text-cyan-600">{fmt(dayTicketMedio)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formas de Pagamento no Dia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Dinheiro", val: dayByPayment["cash"] || 0, icon: Banknote, color: "text-emerald-700 bg-emerald-50" },
              { label: "PIX", val: dayByPayment["pix"] || 0, icon: QrCode, color: "text-teal-700 bg-teal-50" },
              { label: "Cartão Débito/Crédito", val: (dayByPayment["credit"] || 0) + (dayByPayment["debit"] || 0) + (dayByPayment["card"] || 0), icon: CreditCard, color: "text-blue-700 bg-blue-50" },
              { label: "Promissória / Prazo", val: dayByPayment["promissoria"] || 0, icon: FileText, color: "text-indigo-700 bg-indigo-50" },
            ].map((p, idx) => (
              <Card key={idx} className="border border-slate-100">
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${p.color}`}>
                    <p.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">{p.label}</p>
                    <p className="text-base font-bold text-slate-800">{fmt(p.val)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Lista de Vendas do Dia */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Todas as Vendas do Dia ({new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR")})
                </span>
                <Badge variant="secondary">{daySales.length} vendas registradas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDay ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Carregando vendas do dia...</div>
              ) : daySales.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p className="text-base font-semibold">Nenhuma venda realizada nesta data</p>
                  <p className="text-xs text-muted-foreground">Selecione outro dia no campo acima para consultar o histórico.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                        <th className="py-3 px-4">Horário</th>
                        <th className="py-3 px-4">ID Venda</th>
                        <th className="py-3 px-4">Local / Mesa</th>
                        <th className="py-3 px-4">Forma de Pagamento</th>
                        <th className="py-3 px-4 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {daySales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-xs text-slate-700">
                            #{sale.id.slice(-6).toUpperCase()}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            {sale.table_name ? (
                              <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                                {sale.table_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Balcão / Loja</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <Badge
                              variant="secondary"
                              className={
                                sale.payment_method === "pix"
                                  ? "bg-teal-100 text-teal-800"
                                  : sale.payment_method === "cash"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sale.payment_method === "promissoria"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : "bg-blue-100 text-blue-800"
                              }
                            >
                              {sale.payment_method === "cash"
                                ? "Dinheiro"
                                : sale.payment_method === "credit"
                                ? "Cartão Crédito"
                                : sale.payment_method === "debit"
                                ? "Cartão Débito"
                                : sale.payment_method === "pix"
                                ? "PIX"
                                : sale.payment_method === "promissoria"
                                ? "Promissória"
                                : sale.payment_method || "Outros"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-600">
                            {fmt(Number(sale.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. ABA: PRODUTOS MAIS VENDIDOS */}
      {activeTab === "produtos" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Ranking de Produtos Mais Vendidos
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lista ordenada pela quantidade de unidades vendidas no período ({periodLabel})
                </p>
              </div>
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Carregando ranking de produtos...</div>
              ) : topProducts.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">Nenhuma venda encontrada no período.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                        <th className="py-3 px-4 w-12 text-center">Posição</th>
                        <th className="py-3 px-4">Nome do Produto</th>
                        <th className="py-3 px-4 text-right">Qtd Vendida</th>
                        <th className="py-3 px-4 text-right">Faturamento Total</th>
                        <th className="py-3 px-4 text-right">Lucro Estimado</th>
                        <th className="py-3 px-4 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {topProducts.map((p, i) => {
                        const margem = p.faturamento > 0 ? (p.lucro / p.faturamento) * 100 : 0;
                        return (
                          <tr key={i} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                  i === 0
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : i === 1
                                    ? "bg-slate-200 text-slate-800"
                                    : i === 2
                                    ? "bg-orange-100 text-orange-800"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {i + 1}º
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{p.name}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800">
                              {p.quantidade} un
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-600">
                              {fmt(p.faturamento)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-violet-600">
                              {fmt(p.lucro)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  margem >= 40
                                    ? "bg-emerald-100 text-emerald-700"
                                    : margem >= 20
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {margem.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                        <td colSpan={2} className="py-3 px-4 text-xs uppercase text-muted-foreground">
                          Total Geral dos Produtos
                        </td>
                        <td className="py-3 px-4 text-right text-slate-900">
                          {topProducts.reduce((s, p) => s + p.quantidade, 0)} un
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-600">
                          {fmt(topProducts.reduce((s, p) => s + p.faturamento, 0))}
                        </td>
                        <td className="py-3 px-4 text-right text-violet-600">
                          {fmt(topProducts.reduce((s, p) => s + p.lucro, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. ABA: RELATÓRIO DE VALORES A RECEBER (PROMISSÓRIAS / CREDIÁRIO) */}
      {activeTab === "receber" && (
        <div className="space-y-6">
          {/* Cards de Resumo do Crediário */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-amber-50/60 border-amber-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-800 uppercase">Total a Receber (Pendente)</p>
                  <p className="text-2xl font-extrabold text-amber-600 mt-1">{fmt(totalReceberPendente)}</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">Promissórias em aberto</p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-600">
                  <HandCoins className="w-7 h-7" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/60 border-emerald-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-800 uppercase">Total Já Recebido</p>
                  <p className="text-2xl font-extrabold text-emerald-600 mt-1">{fmt(totalJaRecebidoPromissoria)}</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Parcelas quitadas</p>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50/60 border-indigo-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-indigo-800 uppercase">Promissórias Emitidas</p>
                  <p className="text-2xl font-extrabold text-indigo-600 mt-1">{promissoriasList.length}</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5">Total de clientes a prazo</p>
                </div>
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-600">
                  <FileText className="w-7 h-7" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, telefone ou CPF..."
                value={promissoriaSearch}
                onChange={(e) => setPromissoriaSearch(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant={promissoriaFilterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setPromissoriaFilterStatus("all")}
                className="text-xs"
              >
                Todas
              </Button>
              <Button
                variant={promissoriaFilterStatus === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setPromissoriaFilterStatus("pending")}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
              >
                Pendentes
              </Button>
              <Button
                variant={promissoriaFilterStatus === "paid" ? "default" : "outline"}
                size="sm"
                onClick={() => setPromissoriaFilterStatus("paid")}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Pagas / Quitadas
              </Button>
            </div>
          </div>

          {/* Lista de Promissórias */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span>Lista de Promissórias e Carnês a Receber</span>
                <Badge variant="outline">{filteredPromissorias.length} encontradas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredPromissorias.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p className="text-base font-semibold">Nenhuma nota promissória encontrada</p>
                  <p className="text-xs text-muted-foreground">
                    Quando você realizar uma venda com a opção "Promissória" no PDV, ela aparecerá aqui automaticamente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Data Emissão</th>
                        <th className="py-3 px-4">Plano</th>
                        <th className="py-3 px-4">Parcelas / Vencimentos</th>
                        <th className="py-3 px-4 text-right">Valor Total</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredPromissorias.map((prom) => {
                        const pendentes = prom.installments.filter((i) => i.status === "pending").length;
                        return (
                          <tr key={prom.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4">
                              <p className="font-bold text-slate-900">{prom.customerName}</p>
                              {prom.customerPhone && (
                                <p className="text-xs text-muted-foreground">Tel: {prom.customerPhone}</p>
                              )}
                              {prom.customerDocument && (
                                <p className="text-[11px] text-muted-foreground">Doc: {prom.customerDocument}</p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {fmtDate(prom.createdAt)}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-indigo-900">
                              {prom.plan === "30"
                                ? "30 Dias (1x)"
                                : prom.plan === "30_60"
                                ? "30/60d (2x)"
                                : prom.plan === "30_60_90"
                                ? "30/60/90d (3x)"
                                : "No Pulo"}
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {prom.installments.map((inst) => (
                                  <div
                                    key={inst.installmentNumber}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <Badge
                                      variant={inst.status === "paid" ? "secondary" : "outline"}
                                      className={`text-[10px] px-1.5 py-0 ${
                                        inst.status === "paid"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "border-amber-400 text-amber-700 bg-amber-50"
                                      }`}
                                    >
                                      {inst.status === "paid" ? "Paga" : "Pendente"}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {inst.installmentNumber}ª: {new Date(inst.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}
                                    </span>
                                    <span className="font-bold">{fmt(inst.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-base text-slate-900">
                              {fmt(prom.totalAmount)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge
                                className={
                                  prom.status === "paid"
                                    ? "bg-emerald-600 text-white"
                                    : prom.status === "partially_paid"
                                    ? "bg-blue-600 text-white"
                                    : "bg-amber-500 text-white"
                                }
                              >
                                {prom.status === "paid"
                                  ? "Quitada"
                                  : prom.status === "partially_paid"
                                  ? "Parcial"
                                  : "Em Aberto"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {prom.status !== "paid" && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPromissoriaForPayment(prom);
                                    const nextPending = prom.installments.find((i) => i.status === "pending");
                                    setSelectedInstallmentNumber(nextPending?.installmentNumber || 1);
                                    setPaymentModalOpen(true);
                                  }}
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Receber
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modal de Baixa / Receber Parcela */}
          <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-indigo-900">
                  <HandCoins className="w-5 h-5 text-emerald-600" />
                  Receber Parcela da Promissória
                </DialogTitle>
              </DialogHeader>
              {selectedPromissoriaForPayment && (
                <div className="space-y-4 py-2">
                  <div className="bg-slate-50 p-3 rounded-lg border space-y-1">
                    <p className="text-xs text-muted-foreground">Cliente:</p>
                    <p className="font-bold text-slate-900 text-base">{selectedPromissoriaForPayment.customerName}</p>
                    {selectedPromissoriaForPayment.customerPhone && (
                      <p className="text-xs text-slate-600">Telefone: {selectedPromissoriaForPayment.customerPhone}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Qual parcela o cliente está pagando?</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedInstallmentNumber}
                      onChange={(e) => setSelectedInstallmentNumber(Number(e.target.value))}
                    >
                      {selectedPromissoriaForPayment.installments
                        .filter((i) => i.status === "pending")
                        .map((inst) => (
                          <option key={inst.installmentNumber} value={inst.installmentNumber}>
                            Parcela {inst.installmentNumber} - Venc: {new Date(inst.dueDate + "T12:00:00").toLocaleDateString("pt-BR")} ({fmt(inst.amount)})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Forma de Recebimento</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "dinheiro", label: "Dinheiro" },
                        { id: "pix", label: "PIX" },
                        { id: "cartao", label: "Cartão" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setInstallmentPayMethod(m.id)}
                          className={`p-2 rounded-lg border text-xs font-bold transition-all ${
                            installmentPayMethod === m.id
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => setPaymentModalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConfirmInstallmentPayment}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Recebimento
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* 4. ABA: VISÃO GERAL & GRÁFICOS (VISÃO COMPLETA) */}
      {activeTab === "geral" && (
        <div ref={reportRef} className="space-y-6 bg-white rounded-lg p-1">
          {/* Report title (visible in PDF) */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">
              Período: <strong>{periodLabel}</strong> · Gerado em {new Date().toLocaleString("pt-BR")}
            </p>
          </div>

          {/* ── KPI Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard
              title="Faturamento"
              value={fmt(totalFaturamento)}
              icon={DollarSign}
              iconColor="text-emerald-600"
              bgColor="bg-emerald-500"
              loading={loading}
            />
            <KpiCard
              title="Lucro Total"
              value={fmt(totalLucro)}
              sub={totalFaturamento > 0 ? `Margem: ${margemMedia.toFixed(1)}%` : undefined}
              icon={TrendingUp}
              iconColor="text-violet-600"
              bgColor="bg-violet-500"
              loading={loading}
            />
            <KpiCard
              title="Total de Vendas"
              value={totalVendas.toString()}
              icon={Receipt}
              iconColor="text-amber-600"
              bgColor="bg-amber-500"
              loading={loading}
            />
            <KpiCard
              title="Ticket Médio"
              value={fmt(ticketMedio)}
              icon={Target}
              iconColor="text-cyan-600"
              bgColor="bg-cyan-500"
              loading={loading}
            />
            <KpiCard
              title="Unidades Vendidas"
              value={totalUnidades.toString()}
              icon={Package}
              iconColor="text-rose-600"
              bgColor="bg-rose-500"
              loading={loading}
            />
            <KpiCard
              title="Margem de Lucro"
              value={`${margemMedia.toFixed(1)}%`}
              icon={ShoppingCart}
              iconColor="text-indigo-600"
              bgColor="bg-indigo-500"
              loading={loading}
            />
          </div>

          {/* ── Charts row ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Faturamento & Lucro by day */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Faturamento & Lucro por Dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-56 bg-muted animate-pulse rounded" />
                ) : dailyData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                    Nenhuma venda no período
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={46} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          fmt(value),
                          name === "faturamento" ? "Faturamento" : "Lucro",
                        ]}
                      />
                      <Legend formatter={(v) => (v === "faturamento" ? "Faturamento" : "Lucro")} />
                      <Bar dataKey="faturamento" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="lucro" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Payment methods pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Formas de Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-56 bg-muted animate-pulse rounded" />
                ) : paymentMethodData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                    Sem dados
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={paymentMethodData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {paymentMethodData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Vendas por dia (linha) ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Número de Vendas por Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-44 bg-muted animate-pulse rounded" />
              ) : dailyData.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">
                  Nenhuma venda no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                    <Tooltip formatter={(v: number) => [v, "Vendas"]} />
                    <Line
                      type="monotone"
                      dataKey="vendas"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: "#10b981", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
