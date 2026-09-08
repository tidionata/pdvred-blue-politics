import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Link2, Store, Copy, ExternalLink, ShoppingCart,
  UtensilsCrossed, AlertCircle, RefreshCw, Eye, EyeOff,
  FileText, Save, ExternalLink as ExtLink, Shield, Radio, Printer,
  CheckCircle2, Star, Clock, ShoppingBag, Receipt, Percent, LayoutGrid,
  Lock, KeyRound, ShieldCheck, Users2, DollarSign, Trash2,
  Volume2, VolumeX, Volume1, Play,
} from "lucide-react";
import { cn, getSoundConfig, saveSoundConfig, playNotificationSound, SOUND_OPTIONS, type SoundConfig } from "@/lib/utils";
import {
  SEFAZ_BY_UF, UF_NAMES, SERVICO_LABELS,
  type SefazServico,
} from "@/lib/sefaz-endpoints";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface NfeConfig {
  token?: string;
  ambiente?: "homologacao" | "producao";
  cnpj?: string;
  razao_social?: string;
  inscricao_estadual?: string;
  regime_tributario?: "1" | "2" | "3";
  uf?: string;
  nfce_serie?: string;
  nfce_csc_id?: string;
  nfce_csc_token?: string;
}

interface IfoodConfig {
  merchant_id?: string;
  client_id?: string;
  client_secret?: string;
}

interface AsaasConfig {
  api_key?: string;
  wallet_id?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskCnpj(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"links" | "integracoes" | "assinatura" | "ifood" | "asaas" | "impressora" | "pdv" | "sons" | "vendedoras" | "mesas" | "seguranca">("links");
  const [sefazServico, setSefazServico] = useState<SefazServico>("NFeAutorizacao");
  const [showToken, setShowToken] = useState(false);
  const [nfe, setNfe] = useState<NfeConfig>({});
  const [ifood, setIfood] = useState<IfoodConfig>({});
  const [asaas, setAsaas] = useState<AsaasConfig>({});
  const [nfeLoaded, setNfeLoaded] = useState(false);
  const [mesasConfig, setMesasConfig] = useState({ table_count: 0, has_counters: false, counter_count: 0, table_fee: 0 });

  // ── Permissões & Senha Master ─────────────────────────────────────────────────
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem("pdv_admin_password") || "");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [confirmEditAdminPassword, setConfirmEditAdminPassword] = useState("");

  // ── Sons & Notificações ───────────────────────────────────────────────────
  const [soundConfig, setSoundConfig] = useState<SoundConfig>(() => getSoundConfig());
  const [soundTesting, setSoundTesting] = useState(false);

  const updateSound = (partial: Partial<SoundConfig>) => {
    const updated = { ...soundConfig, ...partial };
    setSoundConfig(updated);
    saveSoundConfig(partial);
  };

  const testSound = async (type?: string, vol?: number) => {
    setSoundTesting(true);
    const played = await playNotificationSound(type || soundConfig.soundType, vol !== undefined ? vol : soundConfig.volume);
    setSoundTesting(false);
    if (played) {
      toast.success("🔊 Som reproduzido com sucesso!");
    } else {
      toast.error("⚠️ Não foi possível reproduzir o som. Verifique o volume ou clique na página para habilitar áudio.");
    }
  };

  // ── Vendedoras ────────────────────────────────────────────────────────────────
  const [sellers, setSellers] = useState<{ name: string; commission: number }[]>(() =>
    JSON.parse(localStorage.getItem("pdv_sellers") || "[]")
  );
  const [newSellerName, setNewSellerName] = useState("");
  const [newSellerCommission, setNewSellerCommission] = useState<number>(10);

  const saveSellers = (list: { name: string; commission: number }[]) => {
    setSellers(list);
    localStorage.setItem("pdv_sellers", JSON.stringify(list));
    toast.success("Vendedoras atualizadas!");
  };

  // ── Query: perfil ──────────────────────────────────────────────────────────
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: retryProfile,
  } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("store_id, full_name")
        .eq("auth_user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Query: store (dados públicos da loja) ────────────────────────────────
  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["store", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, active_menu_type, table_count, has_counters, counter_count, table_fee")
        .eq("id", profile!.store_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Query: store_tax_config (Reforma 2026) ───────────────────────────────
  const { data: taxConfig, isLoading: taxLoading } = useQuery({
    queryKey: ["store_tax_config", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_tax_config")
        .select("*")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data || { cbs_rate: 0.9, ibs_rate: 0.1 };
    },
  });

  const [taxForm, setTaxForm] = useState({ cbs_rate: 0.9, ibs_rate: 0.1 });

  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedCaixaPrinter, setSelectedCaixaPrinter] = useState(localStorage.getItem('pdv_printer_caixa') || '');
  const [selectedCozinhaPrinter, setSelectedCozinhaPrinter] = useState(localStorage.getItem('pdv_printer_cozinha') || '');

  useEffect(() => {
    if (store) {
      setMesasConfig({
        table_count: store.table_count || 0,
        has_counters: store.has_counters || false,
        counter_count: store.counter_count || 0,
        table_fee: store.table_fee || 0
      });
    }
  }, [store]);

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI) {
      // @ts-ignore
      window.electronAPI.getPrinters().then(setPrinters).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (taxConfig) {
      setTaxForm({ 
        cbs_rate: Number(taxConfig.cbs_rate), 
        ibs_rate: Number(taxConfig.ibs_rate) 
      });
    }
  }, [taxConfig]);

  // ── Mutation: salvar impostos ──────────────────────────────────────────────
  const taxMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Loja não encontrada");
      
      const { error } = await supabase
        .from("store_tax_config")
        .upsert({ 
          store_id: store.id, 
          cbs_rate: taxForm.cbs_rate, 
          ibs_rate: taxForm.ibs_rate,
          updated_at: new Date().toISOString()
        }, { onConflict: "store_id" });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store_tax_config"] });
      toast.success("Configurações de impostos atualizadas!");
    },
    onError: (e: any) => toast.error(`Erro ao salvar impostos: ${e.message}`),
  });

  // ── Query: assinatura (Stripe) ─────────────────────────────────────────────
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ── Mutation: criar checkout stripe ─────────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: async (plan: string) => {
      if (!profile?.store_id) throw new Error("Loja não encontrada");

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { 
          plan, 
          storeId: profile.store_id,
          successUrl: `${window.location.origin}/dashboard/settings?activeTab=assinatura&success=true`,
          cancelUrl: `${window.location.origin}/dashboard/settings?activeTab=assinatura&cancel=true`,
        },
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    },
    onError: (e: any) => toast.error(`Erro ao iniciar pagamento: ${e.message}`),
  });

  // ── Query: store_secrets (só o owner acessa — token NFe isolado) ────────────
  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ["store_secrets", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_secrets")
        .select("id, nfe_config, ifood_config, asaas_config")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ── Query: past_sales (Histórico de vendas para NF-e) ──────────────────────
  const { data: pastSales, isLoading: pastSalesLoading } = useQuery({
    queryKey: ["past_sales", profile?.store_id],
    enabled: !!profile?.store_id && activeTab === "asaas",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, sale_items(*, product:products(*))")
        .eq("store_id", profile!.store_id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // ── Mutation: emitir NF-e retrospectiva ────────────────────────────────────
  const emitNfeMutation = useMutation({
    mutationFn: async (sale: any) => {
      if (!profile?.store_id) throw new Error("Loja não encontrada");
      
      const itemsDesc = sale.sale_items?.map((i: any) => `${i.quantity}x ${i.product?.name || 'Item'}`).join(", ") || 'Venda';
      
      const nfePayload = {
        action: 'create_invoice',
        storeId: profile.store_id,
        payload: {
          customerName: 'Consumidor Final',
          customerCpfCnpj: '', 
          value: sale.total,
          serviceDescription: `Venda #${sale.id.slice(0,6)} - Itens: ${itemsDesc}`
        }
      };

      const { data, error } = await supabase.functions.invoke('asaas-api', {
        body: nfePayload
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("NF-e emitida com sucesso!");
    },
    onError: (e: any) => toast.error(`Erro ao emitir NF-e: ${e.message}`),
  });

  // Inicializa o formulário NFe quando os secrets chegarem
  useEffect(() => {
    if (!nfeLoaded && secrets) {
      if (secrets.nfe_config) setNfe(secrets.nfe_config as NfeConfig);
      if (secrets.ifood_config) setIfood(secrets.ifood_config as IfoodConfig);
      if (secrets.asaas_config) setAsaas(secrets.asaas_config as AsaasConfig);
      setNfeLoaded(true);
    }
  }, [secrets, nfeLoaded]);

  // ── Mutation: salvar NFe config em store_secrets ─────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Loja não encontrada");

      // Limpa espaços em branco dos tokens antes de salvar
      const cleanedNfe = {
        ...nfe,
        token: nfe.token?.trim(),
        nfce_csc_token: nfe.nfce_csc_token?.trim(),
      };

      if (secrets?.id) {
        // Atualiza registro existente
        const { error } = await supabase
          .from("store_secrets")
          .update({ 
            nfe_config: cleanedNfe,
            ifood_config: ifood,
            asaas_config: asaas
          })
          .eq("id", secrets.id);
        if (error) throw error;
      } else {
        // Cria novo registro
        const { error } = await supabase
          .from("store_secrets")
          .insert({ 
            store_id: store.id, 
            nfe_config: cleanedNfe,
            ifood_config: ifood,
            asaas_config: asaas
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store_secrets"] });
      toast.success("Configurações salvas com segurança!");
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const storeId     = profile?.store_id ?? null;
  const pdvUrl      = storeId ? `${window.location.origin}/#/pdv/${storeId}`      : null;
  const cardapioUrl = storeId ? `${window.location.origin}/#/cardapio/${storeId}` : null;

  const copyLink = (url: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  // ── Mutation: trocar cardápio ativo ──────────────────────────────────────
  const menuMutation = useMutation({
    mutationFn: async (type: string) => {
      if (!store?.id) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("stores")
        .update({ active_menu_type: type })
        .eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store"] });
      toast.success("Catálogo online atualizado!");
    },
    onError: (e: any) => toast.error(`Erro ao trocar catálogo: ${e.message}`),
  });

  // ⚡ Mutation: salvar mesas ⚡
  const mesasMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("stores")
        .update({ 
          table_count: mesasConfig.table_count,
          has_counters: mesasConfig.has_counters,
          counter_count: mesasConfig.counter_count,
          table_fee: mesasConfig.table_fee
        })
        .eq("id", store.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store"] });
      toast.success("Configurações de mesas salvas!");
    },
    onError: (error: any) => toast.error("Erro ao salvar: " + error.message)
  });

  // ── Componente: caixa de link ──────────────────────────────────────────────
  function LinkBox({ url }: { url: string | null }) {
    if (profileLoading) return <Skeleton className="h-10 w-full rounded-lg" />;
    if (profileError) return (
      <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Não foi possível carregar o link.</span>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 shrink-0" onClick={() => retryProfile()}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
    if (!storeId) return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Loja não configurada. Entre em contato com o suporte.
      </div>
    );
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border overflow-hidden">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-mono truncate text-muted-foreground">{url}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => copyLink(url)} className="gap-2 shrink-0">
            <Copy className="h-4 w-4" /> Copiar
          </Button>
          <Button asChild className="gap-2 shrink-0">
            <a href={url!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk']">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie os recursos da sua loja</p>
      </div>

      {/* Grade de Ícones (Tabs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-11 gap-3">
        {([
          { id: "links",       label: "Links",       icon: Link2 },
          { id: "integracoes", label: "Integrações", icon: Radio },
          { id: "ifood",       label: "iFood",       icon: Store },
          { id: "asaas",       label: "Asaas NF",    icon: Receipt },
          { id: "assinatura",  label: "Assinatura",  icon: Star },
          { id: "impressora",  label: "Impressora",  icon: Printer },
          { id: "pdv",         label: "PDV",         icon: ShoppingCart },
          { id: "sons",        label: "Sons/Alertas", icon: Volume2 },
          { id: "vendedoras",  label: "Vendedoras",  icon: Users2 },
          { id: "mesas",       label: "Mesas",       icon: LayoutGrid },
          { id: "seguranca",   label: "Permissões",  icon: ShieldCheck },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center justify-center p-4 bg-white border rounded-xl transition-all duration-300 group",
                isActive 
                  ? "border-blue-500 shadow-md ring-2 ring-blue-500/20 bg-blue-50/30 scale-105" 
                  : "border-slate-200 hover:border-blue-400 hover:shadow-lg hover:-translate-y-1"
              )}
            >
              <Icon 
                strokeWidth={1.5} 
                className={cn(
                  "w-10 h-10 mb-3 transition-colors",
                  isActive ? "text-blue-600" : "text-blue-500 group-hover:text-blue-600"
                )} 
              />
              <span className={cn(
                "text-xs font-semibold text-center leading-tight",
                isActive ? "text-blue-900" : "text-slate-600 group-hover:text-slate-900"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── ABA: LINKS ──────────────────────────────────────────────────────── */}
      {activeTab === "links" && (
        <>
          {/* Link do PDV */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Link do PDV — Acesso para atendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compartilhe este link com seus atendentes. Ele abre uma versão simplificada do PDV
                com apenas os produtos — sem precisar de login de administrador.
              </p>
              <LinkBox url={pdvUrl} />
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5"><Store className="h-4 w-4" /> Como funciona:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>O atendente acessa o link e vê todos os produtos ativos</li>
                  <li>Pode pesquisar por nome, código de barras ou categoria</li>
                  <li>Adiciona itens ao carrinho e finaliza a venda normalmente</li>
                  <li>A venda é registrada no sistema automaticamente</li>
                  <li>Não é necessário nenhum login de administrador</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Link do Catálogo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-5 w-5 text-primary" />
                Catálogo Online — Link para clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compartilhe este link com seus clientes. Eles podem fazer pedidos pelo celular
                e você recebe direto na tela de <strong>Pedidos</strong>.
              </p>
              <LinkBox url={cardapioUrl} />

              <div className="p-4 rounded-xl border-2 bg-primary/5 border-primary/20 space-y-3 mt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <Label className="font-bold text-primary text-sm uppercase tracking-wider">Qual catálogo mostrar agora?</Label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "morning", label: "Só de Dia", sub: "Manhã" },
                    { id: "night", label: "Só de Noite", sub: "Noite" },
                    { id: "both", label: "Ambos", sub: "Dia Todo" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => menuMutation.mutate(m.id)}
                      disabled={menuMutation.isPending || (store as any)?.active_menu_type === m.id}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-lg border-2 transition-all gap-0.5",
                        (store as any)?.active_menu_type === m.id 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-border bg-white hover:border-primary/40 disabled:opacity-50"
                      )}
                    >
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className={cn("text-[10px] opacity-70", (store as any)?.active_menu_type === m.id ? "text-white" : "text-muted-foreground")}>
                        {m.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 space-y-1 mt-4">
                <p className="font-semibold flex items-center gap-1.5"><ShoppingBag className="h-4 w-4" /> Como funciona:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Cliente acessa o link e vê o catálogo com fotos e preços</li>
                  <li>Adiciona itens ao carrinho e informa nome e telefone</li>
                  <li>Envia o pedido — você recebe na tela de Pedidos</li>
                  <li>Você aceita, muda o status e o cliente acompanha em tempo real</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── ABA: INTEGRAÇÕES ────────────────────────────────────────────────── */}
      {activeTab === "integracoes" && (
        <>


          {/* Placeholder outras integrações */}
          <Card className="opacity-60">
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Mais integrações — em breve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pix automático, WhatsApp, iFood e mais serão adicionados em breve.
              </p>
            </CardContent>
          </Card>
        </>
      )}


      {/* ── ABA: IFOOD ────────────────────────────────────────────────────────── */}
      {activeTab === "ifood" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-red-600" />
              Configuração iFood
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-800">
              <p className="font-semibold flex items-center gap-1.5">🚀 Integração em Tempo Real</p>
              <p className="text-xs mt-1 leading-relaxed">
                Para receber pedidos do iFood, você deve primeiro criar um App no <strong>iFood Developer Portal</strong> e obter as chaves abaixo.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Merchant ID (ID da Loja no iFood)</Label>
                <Input 
                  placeholder="Ex: 00000000-0000-0000-0000-000000000000"
                  value={ifood.merchant_id ?? ""}
                  onChange={e => setIfood({ ...ifood, merchant_id: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input 
                  placeholder="Seu Client ID do iFood"
                  value={ifood.client_id ?? ""}
                  onChange={e => setIfood({ ...ifood, client_id: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input 
                    type={showToken ? "text" : "password"}
                    placeholder="Seu Client Secret do iFood"
                    value={ifood.client_secret ?? ""}
                    onChange={e => setIfood({ ...ifood, client_secret: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Chaves iFood"}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-bold">Instruções para Teste:</h4>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Habilite o "Modo Teste" no portal do iFood.</li>
                <li>Use o endereço de teste: <strong>Ramal Bujari, 100 - Bujari</strong>.</li>
                <li>Os pedidos aparecerão automaticamente na sua aba <strong>Pedidos</strong>.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ABA: ASAAS ────────────────────────────────────────────────────────── */}
      {activeTab === "asaas" && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-blue-600" />
              Configuração Asaas (Notas Fiscais)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
              <p className="font-semibold flex items-center gap-1.5">Emitir Notas Fiscais via Asaas</p>
              <p className="text-xs mt-1 leading-relaxed">
                Cole aqui a chave de API (API Key) gerada na sua conta do Asaas. 
                Essa chave será utilizada para gerar suas notas fiscais automaticamente ou manualmente pelo PDV.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>API Key (Chave de API do Asaas)</Label>
                <div className="relative">
                  <Input 
                    type={showToken ? "text" : "password"}
                    placeholder="$aact_..."
                    value={asaas.api_key ?? ""}
                    onChange={e => setAsaas({ ...asaas, api_key: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Wallet ID (Opcional - se usar subcontas)</Label>
                <Input 
                  placeholder="Ex: e00fc..."
                  value={asaas.wallet_id ?? ""}
                  onChange={e => setAsaas({ ...asaas, wallet_id: e.target.value })}
                />
              </div>

              <Button 
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Configuração Asaas"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Histórico de Vendas para NF-e */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-500" />
              Histórico de Vendas (Emissão Retroativa)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pastSalesLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : pastSales && pastSales.length > 0 ? (
              <div className="space-y-3">
                {pastSales.map((sale: any) => (
                  <div key={sale.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-semibold text-sm">Venda #{sale.id.slice(0, 6)} - R$ {sale.total?.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(sale.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2 sm:mt-0 text-blue-600 border-blue-200 hover:bg-blue-50 gap-2"
                      onClick={() => emitNfeMutation.mutate(sale)}
                      disabled={emitNfeMutation.isPending}
                    >
                      <Receipt className="h-4 w-4" />
                      Emitir NF-e Agora
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6">Nenhuma venda encontrada.</p>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* ── ABA: ASSINATURA ─────────────────────────────────────────────────── */}
      {activeTab === "assinatura" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-5 w-5 text-primary" />
                Sua Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {subLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">Plano Atual</Label>
                      <p className="text-2xl font-bold capitalize">
                        {subscription?.plan || "Nenhum"}
                        {subscription?.status === 'trialing' && (
                          <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Período de Teste</Badge>
                        )}
                        {subscription?.status === 'active' && (
                          <Badge variant="secondary" className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">Ativa</Badge>
                        )}
                      </p>
                    </div>

                    {subscription?.status === 'trialing' && subscription?.trial_ends_at && (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Teste Grátis Ativo
                        </p>
                        <p className="text-xs mt-1">
                          Você tem <strong>{Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} dias</strong> de acesso gratuito restantes. 
                          Assine um plano agora para não perder o acesso após o período.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 border-l pl-6 hidden sm:block">
                    <div>
                      <Label className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">Expiração / Renovação</Label>
                      <p className="text-sm font-medium mt-1 text-gray-700">
                        {subscription?.trial_ends_at 
                          ? new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR') 
                          : "Não disponível"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <Separator />

              <h3 className="font-bold text-lg">Trocar ou Assinar Plano</h3>
              <p className="text-sm text-muted-foreground -mt-4">Escolha o plano ideal para o seu negócio e faça o upgrade instantaneamente.</p>
              <div className="flex justify-center mt-4">
                <div className="w-full max-w-sm">
                {[
                  { 
                    id: "premium", 
                    name: "Premium", 
                    price: "Sob consulta", 
                    items: "Produtos ilimitados", 
                    user: "Usuários ilimitados",
                    description: "Tudo liberado para sua loja crescer"
                  }
                ].map((p) => (
                  <div key={p.id} className={cn(
                    "relative p-5 rounded-2xl border-2 transition-all flex flex-col gap-4 shadow-sm",
                    subscription?.plan === p.id 
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                      : "border-border hover:border-primary/40 hover:shadow-md bg-card"
                  )}>
                    {subscription?.plan === p.id && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                        Plano Atual
                      </span>
                    )}
                    
                    <div className="space-y-1">
                      <h4 className="font-bold text-lg">{p.name}</h4>
                      <p className="text-[11px] text-muted-foreground leading-tight">{p.description}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      {p.price === "Sob consulta" ? (
                        <span className="text-2xl font-black text-foreground">{p.price}</span>
                      ) : (
                        <>
                          <span className="text-2xl font-black text-foreground">R${p.price}</span>
                          <span className="text-xs text-muted-foreground">/mês</span>
                        </>
                      )}
                    </div>

                    <ul className="space-y-2 flex-1">
                      <li className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> {p.items}
                      </li>
                      <li className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> {p.user}
                      </li>
                    </ul>

                    <Button 
                      className={cn(
                        "w-full font-bold transition-all",
                        subscription?.plan === p.id ? "bg-muted text-muted-foreground" : "hover:scale-[1.02] active:scale-[0.98]"
                      )}
                      variant={subscription?.plan === p.id ? "secondary" : "default"}
                      disabled={checkoutMutation.isPending || subscription?.plan === p.id}
                      onClick={() => checkoutMutation.mutate(p.id)}
                    >
                      {checkoutMutation.isPending 
                        ? "Carregando..." 
                        : subscription?.plan === p.id 
                          ? "Plano Ativo" 
                          : "Assinar Agora"}
                    </Button>
                  </div>
                ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ABA: IMPRESSORA ─────────────────────────────────────────────────── */}
      {activeTab === "impressora" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Printer className="h-5 w-5 text-primary" />
              Configuração de Impressão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Impressão Automática</h3>
              <p className="text-sm text-muted-foreground">
                Ao ativar esta opção, o sistema tentará abrir a tela de impressão automaticamente
                logo após você clicar em "Finalizar Venda" no PDV.
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="autoPrint" 
                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  checked={localStorage.getItem("pdv_autoprint") === "true"}
                  onChange={(e) => {
                    localStorage.setItem("pdv_autoprint", e.target.checked ? "true" : "false");
                    // Força re-render para atualizar o checkbox visualmente
                    setNfe({ ...nfe });
                    toast.success(e.target.checked ? "Impressão automática ativada!" : "Impressão automática desativada!");
                  }}
                />
                <Label htmlFor="autoPrint" className="font-medium cursor-pointer">
                  Imprimir recibo automaticamente ao finalizar venda
                </Label>
              </div>
            </div>

            <Separator />

            {/* Configuração de Modo Fiscal / Não Fiscal */}
            <div className="space-y-3">
              <h3 className="font-semibold text-emerald-600">Modelo do Cupom (Fiscal vs Não Fiscal)</h3>
              <p className="text-sm text-muted-foreground">
                Se desativado, o comprovante impresso será um <strong>Comprovante de Venda Não Fiscal</strong> simples (sem mensagens de contingência, sem dados fiscais zerados e sem QR Code da SEFAZ).
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="enableFiscal" 
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  checked={localStorage.getItem("pdv_enable_fiscal") === "true"}
                  onChange={(e) => {
                    localStorage.setItem("pdv_enable_fiscal", e.target.checked ? "true" : "false");
                    setNfe({ ...nfe });
                    toast.success(e.target.checked ? "Emissão de Cupom Fiscal ativada!" : "Cupom Não Fiscal ativado!");
                  }}
                />
                <Label htmlFor="enableFiscal" className="font-medium cursor-pointer">
                  Habilitar emissão fiscal (NFC-e / SEFAZ no cupom)
                </Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold text-primary">Seleção de Impressoras (App Desktop)</h3>
              <p className="text-sm text-muted-foreground">
                Selecione as impressoras específicas para o Caixa (recibo fiscal) e para a Cozinha (pedidos).
              </p>
              
              {printers.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 mt-4">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-blue-600">Impressora do Caixa (Notas/Recibos)</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedCaixaPrinter}
                      onChange={e => {
                        setSelectedCaixaPrinter(e.target.value);
                        localStorage.setItem('pdv_printer_caixa', e.target.value);
                        toast.success("Impressora do caixa salva!");
                      }}
                    >
                      <option value="">-- Usar impressora padrão do sistema --</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name} {p.isDefault ? '(Padrão)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-semibold text-orange-600">Impressora da Cozinha (Pedidos)</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedCozinhaPrinter}
                      onChange={e => {
                        setSelectedCozinhaPrinter(e.target.value);
                        localStorage.setItem('pdv_printer_cozinha', e.target.value);
                        toast.success("Impressora da cozinha salva!");
                      }}
                    >
                      <option value="">-- Não imprimir na cozinha --</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
                  <p className="font-semibold flex items-center gap-1.5">
                    Aviso
                  </p>
                  <p className="text-xs mt-1">
                    Nenhuma impressora encontrada ou você não está usando o aplicativo Desktop. A seleção de impressoras só está disponível no App Desktop instalado.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                🚀 Como configurar a Impressão Silenciosa (Sem tela de confirmação)
              </h3>
              <p className="text-sm text-muted-foreground">
                Por questões de segurança, os navegadores web não deixam um site imprimir sem a sua confirmação. 
                Porém, se você usa o PDV em um computador de caixa fixo (Windows), você pode configurar o Google Chrome ou Microsoft Edge para <strong>imprimir direto (Kiosk Printing)</strong>.
              </p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p className="font-medium">Passo a passo (Google Chrome no Windows):</p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                  <li>Feche todos os navegadores Chrome abertos.</li>
                  <li>Clique com botão direito no atalho do Google Chrome na sua Área de Trabalho e vá em <strong>Propriedades</strong>.</li>
                  <li>Na aba Atalho, procure o campo <strong>Destino</strong>.</li>
                  <li>
                    No final do texto (depois das aspas), dê um espaço e adicione o código:<br/>
                    <code className="bg-background px-2 py-1 rounded text-primary mt-1 inline-block select-all">--kiosk-printing</code>
                  </li>
                  <li>O Destino ficará parecido com: <code>"C:\...\chrome.exe" --kiosk-printing</code></li>
                  <li>Clique em <strong>Aplicar</strong> e depois em <strong>OK</strong>.</li>
                  <li>Defina sua impressora térmica como a <strong>Impressora Padrão</strong> no Windows.</li>
                  <li>Abra o Chrome por esse atalho. Agora toda impressão irá direto para o papel!</li>
                </ol>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <strong>Atenção:</strong> Ao abrir o Chrome com esse atalho, qualquer coisa que você mandar imprimir em qualquer site será impresso direto na impressora padrão sem perguntar. Use esse atalho apenas no computador do caixa.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── ABA: PDV ────────────────────────────────────────────────────────── */}
      {activeTab === "pdv" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Configurações do PDV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Rastreio de Pedido (QR Code)</h3>
              <p className="text-sm text-muted-foreground">
                Gere um QR Code no cupom fiscal impresso, permitindo que o cliente acompanhe o status do pedido.
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="qrTrack" 
                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  checked={localStorage.getItem("pdv_tracking_qr") === "true"}
                  onChange={(e) => {
                    localStorage.setItem("pdv_tracking_qr", e.target.checked ? "true" : "false");
                    setNfe({ ...nfe });
                    toast.success(e.target.checked ? "QR Code de rastreio ativado!" : "QR Code de rastreio desativado!");
                  }}
                />
                <Label htmlFor="qrTrack" className="font-medium cursor-pointer">
                  Gerar QR Code de acompanhamento no cupom
                </Label>
              </div>
            </div>

            {/* Visibilidade do Menu Lateral */}
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold">Visibilidade do Menu Lateral</h3>
              <p className="text-sm text-muted-foreground">
                Ative ou desative os itens do menu. Útil para lojas que não usam delivery ou mesas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {[
                  { key: "nav_show_delivery",   label: "Delivery"   },
                  { key: "nav_show_pedidos",    label: "Pedidos"    },
                  { key: "nav_show_clientes",   label: "Clientes"   },
                  { key: "nav_show_estoque",    label: "Estoque"    },
                  { key: "nav_show_relatorios", label: "Relatórios" },
                ].map((item) => {
                  const stored = localStorage.getItem(item.key);
                  const isOn = stored === null ? true : stored === "true";
                  return (
                    <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                      <Label className="font-medium">{item.label}</Label>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem(item.key, (!isOn).toString());
                          setNfe({ ...nfe });
                          toast.success(`${item.label} ${!isOn ? "ativado" : "desativado"} no menu!`);
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isOn ? "bg-primary" : "bg-gray-300"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded p-2">
                ⚠️ As alterações entram em vigor após recarregar a página (F5).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ABA: SONS E ALERTAS ────────────────────────────────────────── */}
      {activeTab === "sons" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Volume2 className="h-5 w-5 text-blue-600" />
                Configurações de Sons e Alertas
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ajuste os alertas sonoros para novos pedidos recebidos e mensagens do chat com clientes.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 1. Ativar / Silenciar */}
              <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {soundConfig.enabled ? (
                      <Volume2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-rose-600" />
                    )}
                    <span className="font-semibold text-sm">
                      {soundConfig.enabled ? "Sons Ativados" : "Sons Silenciados / Mudo"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quando desativado, nenhum alerta sonoro tocará ao receber pedidos ou mensagens.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundConfig.enabled;
                    updateSound({ enabled: next });
                    toast.success(next ? "🔊 Sons ativados!" : "🔇 Sons silenciados!");
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    soundConfig.enabled ? "bg-emerald-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      soundConfig.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* 2. Seleção do Toque / Som */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <span>Toque da Notificação</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SOUND_OPTIONS.map((s) => {
                    const isSelected = soundConfig.soundType === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          updateSound({ soundType: s.id as any });
                          testSound(s.id);
                        }}
                        className={cn(
                          "flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                          isSelected
                            ? "border-blue-600 bg-blue-50/50 shadow-sm"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "w-4 h-4 rounded-full border flex items-center justify-center",
                              isSelected ? "border-blue-600" : "border-slate-400"
                            )}
                          >
                            {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                          </div>
                          <span className={cn("text-xs font-medium", isSelected && "font-bold text-blue-900")}>
                            {s.name}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-blue-600 hover:bg-blue-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            testSound(s.id);
                          }}
                        >
                          <Play className="h-3 w-3" /> Ouvir
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Controle de Volume */}
              <div className="space-y-3 p-4 border rounded-xl bg-white">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Volume1 className="h-4 w-4 text-blue-600" />
                    <span>Volume do Som</span>
                  </Label>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {Math.round(soundConfig.volume * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <VolumeX className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundConfig.volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateSound({ volume: v });
                    }}
                    onMouseUp={() => testSound()}
                    onTouchEnd={() => testSound()}
                    className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                  />
                  <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </div>

              {/* 4. Botão de Teste Completo */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-between border-t">
                <p className="text-xs text-muted-foreground">
                  💡 Clique no botão de teste para garantir que o áudio do seu computador ou caixa de som está funcionando.
                </p>
                <Button
                  type="button"
                  onClick={() => testSound()}
                  disabled={soundTesting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 w-full sm:w-auto"
                >
                  <Volume2 className="h-4 w-4" />
                  {soundTesting ? "Reproduzindo..." : "Testar Som Agora"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ABA: VENDEDORAS & RELATÓRIO DE COMISSÕES ────────────────────── */}
      {activeTab === "vendedoras" && (
        <div className="space-y-6">
          {/* Card: Cadastro e Lista de Vendedoras */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users2 className="h-5 w-5 text-blue-600" />
                Cadastro de Vendedoras & Porcentagem
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Cadastre as pessoas da sua equipe de vendas e defina a comissão padrão (%) de cada uma.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Formulário de cadastro */}
              <div className="flex flex-col sm:flex-row gap-3 items-end p-4 border rounded-xl bg-slate-50">
                <div className="flex-1 w-full space-y-1">
                  <Label className="text-xs font-semibold">Nome da Vendedora / Atendente</Label>
                  <Input
                    placeholder="Ex: Amanda Santos"
                    value={newSellerName}
                    onChange={e => setNewSellerName(e.target.value)}
                    className="h-9 bg-white"
                  />
                </div>
                <div className="w-full sm:w-32 space-y-1">
                  <Label className="text-xs font-semibold">Comissão (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={newSellerCommission}
                    onChange={e => setNewSellerCommission(Number(e.target.value))}
                    className="h-9 bg-white font-bold"
                  />
                </div>
                <Button
                  type="button"
                  className="h-9 w-full sm:w-auto shrink-0 bg-blue-600 hover:bg-blue-700 text-white gap-1 font-semibold"
                  disabled={!newSellerName.trim()}
                  onClick={() => {
                    if (!newSellerName.trim()) return;
                    saveSellers([...sellers, { name: newSellerName.trim(), commission: newSellerCommission }]);
                    setNewSellerName("");
                    setNewSellerCommission(10);
                  }}
                >
                  + Cadastrar Vendedora
                </Button>
              </div>

              {/* Lista de vendedoras ativas */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Equipe Cadastrada ({sellers.length})
                </h4>
                {sellers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 italic">Nenhuma vendedora cadastrada no momento.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {sellers.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-3.5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{s.name}</p>
                            <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              {s.commission}% de comissão
                            </Badge>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm(`Deseja remover ${s.name}?`)) {
                              saveSellers(sellers.filter((_, idx) => idx !== i));
                            }
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card: Relatório Financeiro de Comissões a Pagar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  Relatório de Vendas & Comissões a Pagar
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Acompanhe quanto cada vendedora vendeu e o valor exato que a loja deve repassar a ela.
                </p>
              </div>

              {(() => {
                const commissions = JSON.parse(localStorage.getItem("pdv_commissions") || "[]");
                if (commissions.length === 0) return null;
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                    onClick={() => {
                      if (window.confirm("Deseja zerar o histórico de comissões pagas? Essa ação limpará as comissões acumuladas até hoje.")) {
                        localStorage.removeItem("pdv_commissions");
                        toast.success("Histórico de comissões resetado com sucesso!");
                        setActiveTab("links");
                        setTimeout(() => setActiveTab("vendedoras"), 50);
                      }
                    }}
                  >
                    Zerar / Marcar como Pagas
                  </Button>
                );
              })()}
            </CardHeader>
            <CardContent>
              {(() => {
                const commissions: Array<{
                  saleId: string;
                  sellerName: string;
                  commission: number;
                  total: number;
                  commissionValue: number;
                  date: string;
                }> = JSON.parse(localStorage.getItem("pdv_commissions") || "[]");

                // Agrupa por vendedora
                const summary: Record<string, { totalVendido: number; comissaoTotal: number; qtdVendas: number; pct: number }> = {};

                // Inicializa todas as cadastradas com 0
                sellers.forEach(s => {
                  summary[s.name] = { totalVendido: 0, comissaoTotal: 0, qtdVendas: 0, pct: s.commission };
                });

                // Soma as vendas
                commissions.forEach(c => {
                  if (!summary[c.sellerName]) {
                    summary[c.sellerName] = { totalVendido: 0, comissaoTotal: 0, qtdVendas: 0, pct: c.commission };
                  }
                  summary[c.sellerName].totalVendido += Number(c.total) || 0;
                  summary[c.sellerName].comissaoTotal += Number(c.commissionValue) || 0;
                  summary[c.sellerName].qtdVendas += 1;
                });

                const totalGeralVendido = Object.values(summary).reduce((acc, v) => acc + v.totalVendido, 0);
                const totalGeralComissao = Object.values(summary).reduce((acc, v) => acc + v.comissaoTotal, 0);
                const totalGeralQtd = Object.values(summary).reduce((acc, v) => acc + v.qtdVendas, 0);

                return (
                  <div className="space-y-6">
                    {/* Cards de Resumo Geral */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                        <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Total em Vendas pela Equipe</p>
                        <p className="text-xl font-bold text-blue-900 mt-1">R$ {totalGeralVendido.toFixed(2)}</p>
                        <p className="text-xs text-blue-600 mt-0.5">{totalGeralQtd} transações realizadas</p>
                      </div>

                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                        <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Total de Comissões a Pagar</p>
                        <p className="text-xl font-bold text-emerald-900 mt-1">R$ {totalGeralComissao.toFixed(2)}</p>
                        <p className="text-xs text-emerald-600 mt-0.5">Valor a ser repassado às vendedoras</p>
                      </div>

                      <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                        <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Vendedoras com Vendas</p>
                        <p className="text-xl font-bold text-purple-900 mt-1">{Object.keys(summary).length}</p>
                        <p className="text-xs text-purple-600 mt-0.5">Integrantes da equipe ativa</p>
                      </div>
                    </div>

                    {/* Tabela de Fechamento por Vendedora */}
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b font-semibold">
                          <tr>
                            <th className="p-3">Vendedora</th>
                            <th className="p-3 text-center">Taxa de Comissão</th>
                            <th className="p-3 text-center">Qtd Vendas</th>
                            <th className="p-3 text-right">Total Vendido (R$)</th>
                            <th className="p-3 text-right text-emerald-600 font-bold">Valor a Pagar (R$)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {Object.keys(summary).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">
                                Nenhuma venda vinculada a vendedora até o momento.
                              </td>
                            </tr>
                          ) : (
                            Object.entries(summary).map(([name, data]) => (
                              <tr key={name} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-semibold flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                  {name}
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="outline" className="text-xs">
                                    {data.pct}%
                                  </Badge>
                                </td>
                                <td className="p-3 text-center font-mono font-medium">{data.qtdVendas}</td>
                                <td className="p-3 text-right font-medium">R$ {data.totalVendido.toFixed(2)}</td>
                                <td className="p-3 text-right font-bold text-emerald-600 text-base">
                                  R$ {data.comissaoTotal.toFixed(2)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {Object.keys(summary).length > 0 && (
                          <tfoot className="bg-slate-50 border-t font-bold">
                            <tr>
                              <td colSpan={2} className="p-3">TOTAL GERAL</td>
                              <td className="p-3 text-center font-mono">{totalGeralQtd}</td>
                              <td className="p-3 text-right">R$ {totalGeralVendido.toFixed(2)}</td>
                              <td className="p-3 text-right text-emerald-700 text-base">R$ {totalGeralComissao.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>

                    {/* Detalhamento das Últimas Vendas */}
                    {commissions.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Extrato das Últimas Vendas com Comissão
                        </h4>
                        <div className="max-h-60 overflow-y-auto divide-y border rounded-xl bg-card">
                          {commissions.slice(-20).reverse().map((c, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                              <div>
                                <p className="font-semibold">{c.sellerName} · Venda #{c.saleId.slice(0, 8)}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {new Date(c.date).toLocaleString("pt-BR")} · Total da Venda: R$ {Number(c.total).toFixed(2)} ({c.commission}%)
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-emerald-600 text-sm">
                                  + R$ {Number(c.commissionValue).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
      {activeTab === "mesas" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Configurações de Mesas e Balcões</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Quantidade de Mesas</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={mesasConfig.table_count} 
                  onChange={(e) => setMesasConfig({...mesasConfig, table_count: Number(e.target.value)})}
                  placeholder="Ex: 12"
                />
              </div>

              <div>
                <Label>Acréscimo automático (%)</Label>
                <Input 
                  type="number" 
                  min="0"
                  max="100"
                  value={mesasConfig.table_fee} 
                  onChange={(e) => setMesasConfig({...mesasConfig, table_fee: Number(e.target.value)})}
                  placeholder="Ex: 10 para 10% (opcional)"
                />
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox"
                  id="has_counters"
                  checked={mesasConfig.has_counters}
                  onChange={(e) => setMesasConfig({...mesasConfig, has_counters: e.target.checked})}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="has_counters">Habilitar controle de balcões</Label>
              </div>

              {mesasConfig.has_counters && (
                <div>
                  <Label>Quantidade de Balcões</Label>
                  <Input 
                    type="number" 
                    min="0"
                    value={mesasConfig.counter_count} 
                    onChange={(e) => setMesasConfig({...mesasConfig, counter_count: Number(e.target.value)})}
                    placeholder="Ex: 2"
                  />
                </div>
              )}

              <Button 
                onClick={() => mesasMutation.mutate()} 
                disabled={mesasMutation.isPending}
                className="w-full"
              >
                {mesasMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ABA: SEGURANÇA & PERMISSÕES ──────────────────────────────────────── */}
      {activeTab === "seguranca" && (
        <div className="space-y-6">
          {/* Card: Senha Mestre do Administrador */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-5 w-5 text-blue-600" />
                Senha Master do Administrador
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Esta senha é solicitada ao abrir as <strong>Configurações</strong> e ao tentar acessar as abas protegidas da loja.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nova Senha Master</Label>
                  <Input
                    type="password"
                    placeholder="Digite a nova senha"
                    value={editAdminPassword}
                    onChange={e => setEditAdminPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Confirmar Nova Senha</Label>
                  <Input
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirmEditAdminPassword}
                    onChange={e => setConfirmEditAdminPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (!editAdminPassword || editAdminPassword.length < 4) {
                      toast.error("A senha deve ter pelo menos 4 dígitos/letras.");
                      return;
                    }
                    if (editAdminPassword !== confirmEditAdminPassword) {
                      toast.error("As senhas digitadas não coincidem.");
                      return;
                    }
                    localStorage.setItem("pdv_admin_password", editAdminPassword);
                    setAdminPassword(editAdminPassword);
                    setEditAdminPassword("");
                    setConfirmEditAdminPassword("");
                    toast.success("Senha Master salva com sucesso!");
                  }}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Salvar Nova Senha Master
                </Button>

                {adminPassword && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Deseja realmente remover a senha master? Qualquer pessoa poderá acessar todas as abas.")) {
                        localStorage.removeItem("pdv_admin_password");
                        setAdminPassword("");
                        toast.success("Senha master removida.");
                      }
                    }}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    Remover Senha
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card: Proteção de Abas da Barra Lateral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-5 w-5 text-amber-500" />
                Bloqueio de Abas para Funcionários
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Escolha quais abas exigem a senha master para abrir ou ficam completamente escondidas até que o administrador desbloqueie.
              </p>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {[
                  { key: "reports", label: "Relatórios & Faturamento", desc: "Esconder faturamento diário, vendas brutas e lucros da equipe." },
                  { key: "stock", label: "Estoque & Entradas", desc: "Proteger o controle de custos, saldo e inventário." },
                  { key: "clientes", label: "Clientes & Contatos", desc: "Restringir acesso aos dados dos clientes cadastrados." },
                  { key: "products", label: "Cadastro de Produtos", desc: "Evitar que funcionários alterem preços ou excluam produtos." },
                  { key: "pedidos", label: "Pedidos & Gestão Online", desc: "Exigir senha para ver a gestão de pedidos online." },
                ].map((item) => {
                  const isLocked = localStorage.getItem(`lock_tab_${item.key}`) === "true";
                  const hideWhenLocked = localStorage.getItem(`hide_when_locked_${item.key}`) === "true";

                  return (
                    <div key={item.key} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-2">
                          {item.label}
                          {isLocked && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">Protegida</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isLocked}
                            onChange={(e) => {
                              localStorage.setItem(`lock_tab_${item.key}`, String(e.target.checked));
                              toast.success(`Configuração de ${item.label} atualizada!`);
                              queryClient.invalidateQueries();
                              // Forçar re-render
                              setActiveTab("seguranca");
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium">Exigir Senha</span>
                        </label>

                        {isLocked && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={hideWhenLocked}
                              onChange={(e) => {
                                localStorage.setItem(`hide_when_locked_${item.key}`, String(e.target.checked));
                                toast.success(`Visibilidade de ${item.label} atualizada!`);
                                queryClient.invalidateQueries();
                                setActiveTab("seguranca");
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>Ocultar do menu</span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
