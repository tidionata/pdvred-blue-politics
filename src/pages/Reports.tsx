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
  Vault,
  ArrowDownLeft,
  Printer,
  History,
  Info,
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
import {
  getCaixaHistory,
  getActiveCaixa,
  recordPromissoriaPaymentInCaixa,
  type CaixaSession,
} from "@/lib/caixa";

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
type ReportTab = "dia" | "produtos" | "receber" | "caixa" | "geral";

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

  // ── Controle de Caixas & Turnos ──
  const [caixaHistoryList, setCaixaHistoryList] = useState<CaixaSession[]>([]);
  const [activeCaixaState, setActiveCaixaState] = useState<CaixaSession | null>(null);
  const [selectedCaixaDetail, setSelectedCaixaDetail] = useState<CaixaSession | null>(null);
  const [caixaDetailModalOpen, setCaixaDetailModalOpen] = useState(false);

  // Recarregar Promissórias
  const loadPromissorias = () => {
    const list = getAllPromissorias(storeId || undefined);
    setPromissoriasList(list);
  };

  // Recarregar Caixas
  const loadCaixas = () => {
    const history = getCaixaHistory(storeId || undefined);
    const active = getActiveCaixa(storeId || undefined);
    setCaixaHistoryList(history);
    setActiveCaixaState(active);
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
      loadCaixas();

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
    const inst = selectedPromissoriaForPayment.installments.find(i => i.installmentNumber === selectedInstallmentNumber);
    const amount = inst ? inst.amount : 0;

    const updated = payInstallment(
      selectedPromissoriaForPayment.id,
      selectedInstallmentNumber,
      installmentPayMethod
    );
    if (updated) {
      // Se foi recebida e há um caixa aberto, integra no caixa
      recordPromissoriaPaymentInCaixa(
        storeId || undefined,
        installmentPayMethod,
        amount,
        selectedPromissoriaForPayment.customerName
      );

      toast.success("Parcela recebida e baixada com sucesso!");
      loadPromissorias();
      loadCaixas();
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
            {storeName || "Minha Loja"} · Acompanhe vendas, produtos, caixas e crediário
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
          { id: "caixa", label: "Controle de Caixas / Turnos", icon: Vault, desc: "Aberturas, sangrias e fechamentos" },
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

              <div className="flex items-center gap-6 border-t sm:border-t-0 sm:border-l border-blue-200 pt-3 sm:pt-0 sm:pl-6">
                <div>
                  <p className="text-xs text-muted-foreground">Faturamento do Dia</p>
                  <p className="text-2xl font-black text-blue-950">{fmt(dayTotalFat)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendas Concluídas</p>
                  <p className="text-2xl font-black text-slate-800">{dayVendasCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ticket Médio</p>
                  <p className="text-2xl font-black text-emerald-700">{fmt(dayTicketMedio)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formas de pagamento no dia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "cash", label: "Dinheiro (Gaveta)", icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
              { key: "pix", label: "PIX", icon: QrCode, color: "text-teal-700", bg: "bg-teal-50 border-teal-200" },
              { key: "credit", label: "Cartão Crédito", icon: CreditCard, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
              { key: "debit", label: "Cartão Débito", icon: CreditCard, color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
              { key: "promissoria", label: "Promissória (A Prazo)", icon: FileText, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
            ].map((pm) => {
              const val = (dayByPayment[pm.key] || 0) + (pm.key === "cash" ? (dayByPayment["dinheiro"] || 0) : 0);
              const Icon = pm.icon;
              return (
                <Card key={pm.key} className={`border ${pm.bg}`}>
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">{pm.label}</p>
                      <p className={`text-lg font-bold mt-0.5 ${pm.color}`}>{fmt(val)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-white shadow-xs">
                      <Icon className={`w-5 h-5 ${pm.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Lista de Vendas do Dia */}
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span>Vendas Realizadas em {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                <Badge variant="secondary" className="font-semibold">
                  {daySales.length} venda(s)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDay ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                  <span>Carregando vendas do dia...</span>
                </div>
              ) : daySales.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <Receipt className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Nenhuma venda registrada nesta data.</p>
                  <p className="text-xs">Selecione outro dia ou realize novas vendas no PDV.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b">
                      <tr>
                        <th className="px-4 py-3">Horário</th>
                        <th className="px-4 py-3">Venda / Cupom</th>
                        <th className="px-4 py-3">Local / Mesa</th>
                        <th className="px-4 py-3">Forma de Pagto</th>
                        <th className="px-4 py-3 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {daySales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {new Date(sale.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            #{sale.id.slice(-6).toUpperCase()}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {sale.table_name || "Balcão / Direta"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`text-xs uppercase font-medium ${
                                sale.payment_method === "promissoria"
                                  ? "border-amber-400 text-amber-800 bg-amber-50"
                                  : "border-slate-300 text-slate-700"
                              }`}
                            >
                              {sale.payment_method === "promissoria"
                                ? "Promissória"
                                : sale.payment_method || "Dinheiro"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
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
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Package className="h-5 w-5 text-indigo-600" />
                    Ranking dos Produtos Mais Vendidos
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ordenado por volume total de vendas no período selecionado ({periodLabel})
                  </p>
                </div>
                <Badge variant="outline" className="text-xs w-fit">
                  {topProducts.length} itens vendidos
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando dados dos produtos...</div>
              ) : topProducts.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <Package className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Nenhum produto vendido no período.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center"># Pos</th>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3 text-center">Qtd. Vendida</th>
                        <th className="px-4 py-3 text-right">Faturamento Total</th>
                        <th className="px-4 py-3 text-right">Lucro Estimado</th>
                        <th className="px-4 py-3 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topProducts.map((p, idx) => {
                        const margem = p.faturamento > 0 ? (p.lucro / p.faturamento) * 100 : 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 text-center font-bold text-xs text-slate-400">
                              {idx === 0 && <span className="text-amber-500 font-extrabold text-sm">🥇 1º</span>}
                              {idx === 1 && <span className="text-slate-400 font-extrabold text-sm">🥈 2º</span>}
                              {idx === 2 && <span className="text-amber-700 font-extrabold text-sm">🥉 3º</span>}
                              {idx > 2 && `${idx + 1}º`}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-indigo-700">
                              {p.quantidade} un
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {fmt(p.faturamento)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">
                              {fmt(p.lucro)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  margem >= 40
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {margem.toFixed(1)}%
                              </Badge>
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
        </div>
      )}

      {/* 3. ABA: VALORES A RECEBER (PROMISSÓRIAS / CREDIÁRIO) */}
      {activeTab === "receber" && (
        <div className="space-y-6">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-amber-500/10 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Total Pendente a Receber
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-black text-amber-900">
                  {fmt(totalReceberPendente)}
                </div>
                <p className="text-xs text-amber-700/90 mt-1">
                  Promissórias em aberto aguardando pagamento
                </p>
              </CardContent>
            </Card>

            <Card className="bg-emerald-500/10 border-emerald-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Total Já Recebido / Quitado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-black text-emerald-900">
                  {fmt(totalJaRecebidoPromissoria)}
                </div>
                <p className="text-xs text-emerald-700/90 mt-1">
                  Parcelas pagas pelos clientes
                </p>
              </CardContent>
            </Card>

            <Card className="bg-indigo-500/10 border-indigo-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                  Total de Contratos / Devedores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-black text-indigo-900">
                  {promissoriasAtivas.length}
                </div>
                <p className="text-xs text-indigo-700/90 mt-1">
                  Cadastros de compras a prazo emitidas
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do cliente, telefone ou documento (CPF/RG)..."
                value={promissoriaSearch}
                onChange={(e) => setPromissoriaSearch(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant={promissoriaFilterStatus === "all" ? "default" : "outline"}
                onClick={() => setPromissoriaFilterStatus("all")}
                className="text-xs"
              >
                Todos ({promissoriasList.length})
              </Button>
              <Button
                size="sm"
                variant={promissoriaFilterStatus === "pending" ? "default" : "outline"}
                onClick={() => setPromissoriaFilterStatus("pending")}
                className="text-xs"
              >
                Pendentes
              </Button>
              <Button
                size="sm"
                variant={promissoriaFilterStatus === "paid" ? "default" : "outline"}
                onClick={() => setPromissoriaFilterStatus("paid")}
                className="text-xs"
              >
                Quitados
              </Button>
            </div>
          </div>

          {/* Tabela de Promissórias */}
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                Notas Promissórias & Crediário dos Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredPromissorias.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <HandCoins className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Nenhuma promissória encontrada.</p>
                  <p className="text-xs">Quando uma venda for realizada com forma de pagamento "Promissória", ela aparecerá aqui.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b">
                      <tr>
                        <th className="px-4 py-3">Cliente / Contato</th>
                        <th className="px-4 py-3">Emissão</th>
                        <th className="px-4 py-3">Plano</th>
                        <th className="px-4 py-3">Valor Total</th>
                        <th className="px-4 py-3">Parcelas & Vencimentos</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPromissorias.map((p) => {
                        const pendentes = p.installments.filter((i) => i.status === "pending").length;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-900">{p.customerName}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.customerPhone || "Sem telefone"} {p.customerDocument ? `· Doc: ${p.customerDocument}` : ""}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs bg-slate-50">
                                {p.plan === "pulo_mes" ? "No Pulo (Mês Seguinte)" : `${p.plan.replace(/_/g, "/")} Dias`}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {fmt(p.totalAmount)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                {p.installments.map((inst) => (
                                  <div
                                    key={inst.installmentNumber}
                                    className={`text-xs px-2 py-0.5 rounded border flex items-center justify-between gap-2 ${
                                      inst.status === "paid"
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 line-through opacity-75"
                                        : "bg-amber-50 border-amber-200 text-amber-900 font-semibold"
                                    }`}
                                  >
                                    <span>
                                      {inst.installmentNumber}ª Parc ({fmtDate(inst.dueDate)}): {fmt(inst.amount)}
                                    </span>
                                    <span>{inst.status === "paid" ? " Pago" : " Pendente"}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {p.status === "paid" && (
                                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Quitada</Badge>
                              )}
                              {p.status === "partially_paid" && (
                                <Badge className="bg-blue-600 text-white hover:bg-blue-700">Parcial ({pendentes} rest.)</Badge>
                              )}
                              {p.status === "pending" && (
                                <Badge className="bg-amber-600 text-white hover:bg-amber-700">Pendente</Badge>
                              )}
                              {p.status === "cancelled" && (
                                <Badge variant="destructive">Cancelada</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {p.status !== "paid" && p.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPromissoriaForPayment(p);
                                    // Pega a primeira parcela pendente
                                    const firstPending = p.installments.find((i) => i.status === "pending");
                                    setSelectedInstallmentNumber(firstPending ? firstPending.installmentNumber : 1);
                                    setPaymentModalOpen(true);
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1"
                                >
                                  <HandCoins className="w-3.5 h-3.5" />
                                  Receber Parcela
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

          {/* Modal de Baixa / Pagamento de Parcela */}
          <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-700">
                  <HandCoins className="w-5 h-5" />
                  Receber / Dar Baixa na Promissória
                </DialogTitle>
              </DialogHeader>

              {selectedPromissoriaForPayment && (
                <div className="space-y-4 pt-2">
                  <div className="bg-slate-50 p-3 rounded-lg border text-sm space-y-1">
                    <p><strong>Cliente:</strong> {selectedPromissoriaForPayment.customerName}</p>
                    <p><strong>Valor Total da Dívida:</strong> {fmt(selectedPromissoriaForPayment.totalAmount)}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Selecione a Parcela a Receber:</Label>
                    <Select
                      value={String(selectedInstallmentNumber)}
                      onValueChange={(v) => setSelectedInstallmentNumber(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPromissoriaForPayment.installments.map((inst) => (
                          <SelectItem
                            key={inst.installmentNumber}
                            value={String(inst.installmentNumber)}
                            disabled={inst.status === "paid"}
                          >
                            {inst.installmentNumber}ª Parcela - Venc: {fmtDate(inst.dueDate)} - Valor: {fmt(inst.amount)}{" "}
                            {inst.status === "paid" ? "(Já Paga)" : "(Pendente)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Forma de Pagamento Recebida:</Label>
                    <Select value={installmentPayMethod} onValueChange={setInstallmentPayMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro (Entra na Gaveta)</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="debito">Cartão de Débito</SelectItem>
                        <SelectItem value="credito">Cartão de Crédito</SelectItem>
                      </SelectContent>
                    </Select>
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

      {/* 4. ABA: CONTROLE DE CAIXAS / TURNOS */}
      {activeTab === "caixa" && (
        <div className="space-y-6">
          {/* Caixa Ativo Agora */}
          <Card className={`border ${activeCaixaState ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            <CardHeader className="py-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                  <Vault className={`h-5 w-5 ${activeCaixaState ? 'text-emerald-600' : 'text-amber-600'}`} />
                  Status do Caixa Atual
                </CardTitle>
                <Badge className={activeCaixaState ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}>
                  {activeCaixaState ? '🟢 ABERTO (Em Operação)' : '🔴 FECHADO'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {activeCaixaState ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Operador Responsável</p>
                    <p className="text-base font-bold text-slate-900">{activeCaixaState.openedBy}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Aberto às: {fmtDateTime(activeCaixaState.openedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fundo Inicial (Troco)</p>
                    <p className="text-base font-bold text-slate-900">{fmt(activeCaixaState.initialAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dinheiro Esperado na Gaveta</p>
                    <p className="text-xl font-black text-emerald-700">{fmt(activeCaixaState.expectedCashInDrawer)}</p>
                    <p className="text-[10px] text-muted-foreground">(Troco + Vendas Dinheiro - Sangrias)</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Vendido no Turno</p>
                    <p className="text-xl font-black text-blue-950">{fmt(activeCaixaState.salesSummary.totalSales)}</p>
                    <p className="text-[10px] text-muted-foreground">{activeCaixaState.salesSummary.totalTransactions} transações</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-600 space-y-1">
                  <p className="font-semibold">Nenhum caixa está aberto no momento.</p>
                  <p className="text-xs text-muted-foreground">Abra o caixa na tela do PDV para iniciar as vendas e o controle de turno.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico de Fechamentos Anteriores */}
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-600" />
                  Histórico de Turnos e Fechamentos Anteriores
                </span>
                <Badge variant="outline">{caixaHistoryList.length} turnos fechados</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {caixaHistoryList.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <History className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Nenhum histórico de fechamento de caixa registrado.</p>
                  <p className="text-xs">Assim que você fechar um turno no PDV, o relatório detalhado ficará salvo aqui.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b">
                      <tr>
                        <th className="px-4 py-3">Data / Horário</th>
                        <th className="px-4 py-3">Operador</th>
                        <th className="px-4 py-3 text-right">Fundo Inicial</th>
                        <th className="px-4 py-3 text-right">Total Vendas</th>
                        <th className="px-4 py-3 text-right">Dinheiro Gaveta</th>
                        <th className="px-4 py-3 text-right">Diferença</th>
                        <th className="px-4 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {caixaHistoryList.map((cx) => (
                        <tr key={cx.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs">
                            <p className="font-semibold text-slate-900">{fmtDateTime(cx.openedAt)}</p>
                            <p className="text-muted-foreground text-[11px]">Fechado: {cx.closedAt ? fmtDateTime(cx.closedAt) : "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-800">
                            {cx.openedBy} {cx.closedBy && cx.closedBy !== cx.openedBy ? ` / ${cx.closedBy}` : ""}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-600">
                            {fmt(cx.initialAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-blue-900 text-xs">
                            {fmt(cx.salesSummary.totalSales)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 text-xs">
                            {fmt(cx.actualCashInDrawer || 0)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {cx.difference !== undefined ? (
                              cx.difference === 0 ? (
                                <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-300">Batido (R$ 0)</Badge>
                              ) : cx.difference > 0 ? (
                                <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-300">Sobra: +{fmt(cx.difference)}</Badge>
                              ) : (
                                <Badge variant="outline" className="text-rose-700 bg-rose-50 border-rose-300">Falta: {fmt(cx.difference)}</Badge>
                              )
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedCaixaDetail(cx);
                                setCaixaDetailModalOpen(true);
                              }}
                              className="text-xs h-7 gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Ver Detalhes
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modal Detalhe do Fechamento de Caixa */}
          <Dialog open={caixaDetailModalOpen} onOpenChange={setCaixaDetailModalOpen}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-indigo-900">
                  <Vault className="w-5 h-5" />
                  Comprovante de Fechamento de Caixa
                </DialogTitle>
              </DialogHeader>

              {selectedCaixaDetail && (
                <div className="space-y-4 pt-2 text-sm font-mono leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="text-center border-b border-dashed border-slate-300 pb-2 space-y-0.5">
                    <p className="font-bold text-base uppercase text-slate-900">{storeName || "MINHA LOJA"}</p>
                    <p className="text-xs text-slate-600">FECHAMENTO DE TURNO #{selectedCaixaDetail.id.slice(-6).toUpperCase()}</p>
                    <p className="text-[11px] text-slate-500">Abertura: {fmtDateTime(selectedCaixaDetail.openedAt)}</p>
                    <p className="text-[11px] text-slate-500">Fechamento: {selectedCaixaDetail.closedAt ? fmtDateTime(selectedCaixaDetail.closedAt) : "-"}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Operador: {selectedCaixaDetail.openedBy}</p>
                  </div>

                  {/* Resumo Financeiro da Gaveta */}
                  <div className="space-y-1 border-b border-dashed border-slate-300 pb-2 text-xs">
                    <p className="font-bold text-slate-900 text-sm">💵 CONCILIAÇÃO DA GAVETA (DINHEIRO FÍSICO):</p>
                    <div className="flex justify-between">
                      <span>(+) Fundo Inicial (Troco):</span>
                      <span>{fmt(selectedCaixaDetail.initialAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(+) Vendas em Dinheiro:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.cash)}</span>
                    </div>
                    <div className="flex justify-between text-blue-700">
                      <span>(+) Suprimentos / Entradas:</span>
                      <span>{fmt(selectedCaixaDetail.movements.filter(m => m.type === "suprimento").reduce((s, m) => s + m.amount, 0))}</span>
                    </div>
                    <div className="flex justify-between text-rose-700">
                      <span>(-) Sangrias / Retiradas:</span>
                      <span>{fmt(selectedCaixaDetail.movements.filter(m => m.type === "sangria").reduce((s, m) => s + m.amount, 0))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-dotted">
                      <span>(=) Dinheiro Esperado na Gaveta:</span>
                      <span>{fmt(selectedCaixaDetail.expectedCashInDrawer)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-indigo-900">
                      <span>(=) Dinheiro Contado pelo Operador:</span>
                      <span>{fmt(selectedCaixaDetail.actualCashInDrawer || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xs pt-1 border-t">
                      <span>Diferença (Sobra / Falta):</span>
                      <span className={selectedCaixaDetail.difference === 0 ? "text-emerald-700" : selectedCaixaDetail.difference! > 0 ? "text-blue-700" : "text-rose-700"}>
                        {selectedCaixaDetail.difference === 0 ? "R$ 0,00 (Batido)" : fmt(selectedCaixaDetail.difference || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Resumo por Formas de Pagamento Totais */}
                  <div className="space-y-1 border-b border-dashed border-slate-300 pb-2 text-xs">
                    <p className="font-bold text-slate-900 text-sm">💳 TOTAL DE VENDAS POR FORMA DE PAGAMENTO:</p>
                    <div className="flex justify-between">
                      <span>Dinheiro:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.cash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PIX:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.pix)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cartão Crédito:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.credit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cartão Débito:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.debit)}</span>
                    </div>
                    <div className="flex justify-between text-amber-800">
                      <span>Promissórias (A Prazo):</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.promissoria)}</span>
                    </div>
                    <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t">
                      <span>TOTAL GERAL VENDIDO:</span>
                      <span>{fmt(selectedCaixaDetail.salesSummary.totalSales)}</span>
                    </div>
                  </div>

                  {/* Lista de Movimentações (Sangrias e Suprimentos) */}
                  {selectedCaixaDetail.movements.length > 0 && (
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-slate-900">📋 MOVIMENTAÇÕES DESTE TURNO:</p>
                      {selectedCaixaDetail.movements.map((mov, idx) => (
                        <div key={idx} className="flex justify-between text-[11px]">
                          <span>[{mov.type === "sangria" ? "SANGRIA" : "SUPRIMENTO"}] {mov.reason}</span>
                          <span className={mov.type === "sangria" ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                            {mov.type === "sangria" ? "-" : "+"}{fmt(mov.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCaixaDetail.notes && (
                    <div className="pt-2 text-xs text-slate-600 border-t">
                      <strong>Observações:</strong> {selectedCaixaDetail.notes}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => setCaixaDetailModalOpen(false)}>
                      Fechar
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* 5. ABA: VISÃO GERAL & GRÁFICOS (VISÃO COMPLETA) */}
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
