import { useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp,
  BarChart3, Settings, LogOut, Menu, X, ShoppingBag, FileText, Users,
  Lock, ShieldAlert, Download, Sparkles, RefreshCw, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SyncIndicator } from "@/components/SyncIndicator";
import { syncEngine } from "@/lib/syncEngine";

export default function DashboardLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Atualizações Automáticas (OTA) ─────────────────────────────────────────
  const [updateInfo, setUpdateInfo] = useState<{
    status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available';
    version?: string;
    percent?: number;
    error?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    // Escuta eventos vindos do Electron (se estiver rodando no app instalado)
    if (window.electronAPI?.onUpdateStatus) {
      const unsubscribe = window.electronAPI.onUpdateStatus((data: any) => {
        console.log("Update status received:", data);
        setUpdateInfo(data);
        if (data.status === 'available') {
          toast.info(`Nova versão ${data.version} disponível! Clique para atualizar.`);
        } else if (data.status === 'downloaded') {
          toast.success(`Versão ${data.version} pronta! O sistema reiniciará para aplicar.`);
        }
      });

      // Força verificação imediata ao montar
      window.electronAPI.checkForUpdates?.();

      return () => unsubscribe();
    }
  }, []);

  const handleStartDownload = async () => {
    if (window.electronAPI?.downloadUpdate) {
      toast.loading("Iniciando download da atualização...");
      await window.electronAPI.downloadUpdate();
    }
  };

  const handleApplyUpdate = () => {
    if (window.electronAPI?.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    }
  };

  // ── Controle de Senha Mestre / Permissões de Acesso ───────────────────────
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem("pdv_admin_unlocked") === "true";
  });
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const [inputPassword, setInputPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const savedAdminPassword = localStorage.getItem("pdv_admin_password");

  const handleProtectedNavigation = (e: React.MouseEvent, to: string, isRestricted: boolean) => {
    if (!isRestricted || isUnlocked) {
      setSidebarOpen(false);
      return;
    }
    e.preventDefault();
    setTargetRoute(to);
    setInputPassword("");
    setPasswordModalOpen(true);
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!savedAdminPassword) {
      if (!newPassword || newPassword.length < 4) {
        toast.error("A senha deve ter pelo menos 4 caracteres.");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("As senhas não coincidem.");
        return;
      }
      localStorage.setItem("pdv_admin_password", newPassword);
      sessionStorage.setItem("pdv_admin_unlocked", "true");
      setIsUnlocked(true);
      toast.success("Senha de proteção criada com sucesso!");
      setPasswordModalOpen(false);
      if (targetRoute) navigate(targetRoute);
      return;
    }

    if (inputPassword === savedAdminPassword) {
      sessionStorage.setItem("pdv_admin_unlocked", "true");
      setIsUnlocked(true);
      toast.success("Acesso liberado!");
      setPasswordModalOpen(false);
      if (targetRoute) navigate(targetRoute);
    } else {
      toast.error("Senha incorreta!");
    }
  };

  const handleLockNow = () => {
    sessionStorage.removeItem("pdv_admin_unlocked");
    setIsUnlocked(false);
    toast.info("Modo restrito ativado (Abas protegidas).");
  };

  // ── Profile ──────────────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("store_id").eq("auth_user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile?.store_id) {
      syncEngine.setStoreId(profile.store_id);
      syncEngine.start(60000);
    }
    return () => syncEngine.stop();
  }, [profile?.store_id]);

  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ["store-license-status", profile?.store_id],
    enabled: !!profile?.store_id,
    refetchInterval: 30000, // Checa a cada 30 segundos se a loja foi bloqueada pelo admin
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, config_orcamento, status, expires_at, block_reason, master_admin_password")
        .eq("id", profile!.store_id!)
        .single();
      if (error) {
        console.warn("Aviso ao verificar status da loja:", error);
        return null;
      }
      return data;
    },
  });

  const storeConfig = storeData;
  const isStoreBlocked = storeData?.status === "blocked" || storeData?.status === "suspended";
  const isStoreExpired = storeData?.expires_at ? new Date(storeData.expires_at).getTime() < Date.now() : false;
  const shouldBlockAccess = isStoreBlocked || isStoreExpired;

  // Atualiza a senha master da loja sincronizada com o Super Admin se houver
  useEffect(() => {
    if (storeData?.master_admin_password) {
      localStorage.setItem("pdv_admin_password", storeData.master_admin_password);
    }
  }, [storeData?.master_admin_password]);

  const userRole = sessionStorage.getItem("pdv_user_role");
  const isFuncionario = userRole === "funcionario";

  const isTabRestricted = (tabKey: string) => {
    if (isFuncionario) {
      // Funcionário só pode acessar PDV, Pedidos e Clientes
      const allowed = ["pdv", "pedidos", "clientes"];
      return !allowed.includes(tabKey);
    }
    // Só bloqueia abas se o lojista tiver realmente criado uma senha master
    if (!savedAdminPassword) return false;
    if (tabKey === "settings") return true;
    const lockConfig = localStorage.getItem(`lock_tab_${tabKey}`);
    return lockConfig === "true";
  };

  const navItems = [
    { to: "/dashboard",          icon: LayoutDashboard, label: "Dashboard",   visKey: null,                   tabKey: "dashboard" },
    { to: "/dashboard/pdv",      icon: ShoppingCart,    label: "PDV",         visKey: null,                   tabKey: "pdv" },
    { to: "/dashboard/delivery", icon: ShoppingCart,    label: "Delivery",    visKey: "nav_show_delivery",    tabKey: "delivery" },
    { to: "/dashboard/pedidos",  icon: ShoppingBag,     label: "Pedidos",     visKey: "nav_show_pedidos",     tabKey: "pedidos",  badge: true },
    { to: "/dashboard/clientes", icon: Users,           label: "Clientes",    visKey: "nav_show_clientes",    tabKey: "clientes" },
    { to: "/dashboard/products", icon: Package,         label: "Produtos",    visKey: null,                   tabKey: "products" },
    { to: "/dashboard/stock",    icon: TrendingUp,      label: "Estoque",     visKey: "nav_show_estoque",     tabKey: "stock" },
    { to: "/dashboard/reports",  icon: BarChart3,       label: "Relatórios",  visKey: "nav_show_relatorios",  tabKey: "reports" },
    ...(storeConfig?.config_orcamento ? [{ to: "/dashboard/orcamentos", icon: FileText, label: "Orçamentos", visKey: null, tabKey: "orcamentos" }] : []),
    { to: "/dashboard/settings", icon: Settings,        label: "Configurações", visKey: null,                 tabKey: "settings" },
  ].filter((item) => {
    if (isFuncionario) {
      const allowed = ["pdv", "pedidos", "clientes"];
      return allowed.includes(item.tabKey);
    }
    const restricted = isTabRestricted(item.tabKey);
    const hideWhenLocked = localStorage.getItem(`hide_when_locked_${item.tabKey}`) === "true";
    if (restricted && hideWhenLocked && !isUnlocked) return false;
    if (!item.visKey) return true;
    const stored = localStorage.getItem(item.visKey);
    return stored === null ? true : stored === "true";
  });

  const handleSwitchProfile = () => {
    sessionStorage.removeItem("pdv_user_role");
    sessionStorage.removeItem("pdv_admin_unlocked");
    navigate("/auth");
  };

  const storeId = profile?.store_id ?? user?.id ?? "";
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["store-orders-pending", storeId],
    refetchInterval: 15000,
    enabled: !!storeId,
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("orders").select("id,status").eq("store_id", storeId).eq("status", "pending");
        return data ?? [];
      } catch {
        const key = `orders_offline_${storeId}`;
        const all = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(all) ? all.filter((o: any) => o.status === "pending") : [];
      }
    },
  });
  const pendingCount = pendingOrders.length;

  if (shouldBlockAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Acesso Temporariamente Suspenso</h2>
            <p className="text-sm text-slate-400">
              {storeData?.block_reason || "A licença de uso do sistema para este estabelecimento está expirada ou pendente de regularização."}
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 text-xs text-slate-300 text-left space-y-1.5">
            <p className="font-semibold text-white">Como restabelecer o acesso?</p>
            <p>Entre em contato com o suporte ou com a administração do sistema para renovar sua licença.</p>
            {storeData?.expires_at && (
              <p className="text-[11px] text-amber-400 font-mono pt-1">
                Data de expiração: {new Date(storeData.expires_at).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Verificar Novamente
            </Button>
            <Button
              variant="destructive"
              onClick={signOut}
              className="flex-1"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-sidebar-primary font-['Space_Grotesk']">PDVTOTAL</span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-primary border border-sidebar-border">v1.3.3</span>
          </div>
          <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            const restricted = isTabRestricted(item.tabKey);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={(e) => handleProtectedNavigation(e, item.to, restricted)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {restricted && !isUnlocked && <Lock className="h-3 w-3 ml-auto opacity-50" />}
                {item.badge && pendingCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
          
          {isUnlocked && (
            <div className="mt-2 pt-2 border-t border-sidebar-border/40">
              <button onClick={handleLockNow} className="flex items-center gap-3 w-full px-3 py-2.5 text-amber-500 hover:bg-amber-500/10 rounded-lg text-sm font-medium">
                <Lock className="h-5 w-5" /> Bloquear Admin
              </button>
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-sidebar-border/40 space-y-1">
            <button
              onClick={handleSwitchProfile}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Trocar entre Dono e Funcionário"
            >
              <Users className="h-4 w-4" />
              <span>Trocar Perfil {isFuncionario ? "(Operador)" : "(Dono)"}</span>
            </button>

            <button
              onClick={signOut}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-red-400"
            >
              <LogOut className="h-5 w-5" />
              Sair da Conta
            </button>
          </div>
        </nav>
      </aside>

      {passwordModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 border">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500"/> Área Restrita</h3>
              <button onClick={() => setPasswordModalOpen(false)}><X className="h-5 w-5"/></button>
            </div>
            <form onSubmit={handleUnlock} className="space-y-4">
              {!savedAdminPassword ? (
                <>
                  <Input type="password" placeholder="Nova senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <Input type="password" placeholder="Confirmar senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </>
              ) : (
                <Input type="password" placeholder="Senha Master" value={inputPassword} onChange={e => setInputPassword(e.target.value)} autoFocus />
              )}
              <Button type="submit" className="w-full">Confirmar</Button>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 border-b border-border bg-card">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Alerta de Atualização na Barra Superior */}
          {updateInfo.status === 'available' && (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs text-blue-600 animate-pulse font-medium">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span>Nova versão <strong>{updateInfo.version}</strong> disponível!</span>
              <Button size="sm" onClick={handleStartDownload} className="h-7 text-xs px-2.5 bg-blue-600 hover:bg-blue-700 text-white gap-1 ml-2">
                <Download className="h-3 w-3" /> Atualizar Agora
              </Button>
            </div>
          )}

          {updateInfo.status === 'downloading' && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-lg text-xs text-amber-700 font-medium">
              <RefreshCw className="h-4 w-4 text-amber-600 animate-spin shrink-0" />
              <div className="flex flex-col gap-1 min-w-[140px]">
                <div className="flex justify-between items-center text-[11px]">
                  <span>Baixando atualização...</span>
                  <span className="font-bold font-mono">{updateInfo.percent ?? 0}%</span>
                </div>
                <div className="w-full bg-amber-200/50 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-amber-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${updateInfo.percent ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {updateInfo.status === 'downloaded' && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Versão <strong>{updateInfo.version}</strong> pronta!</span>
              <Button size="sm" onClick={handleApplyUpdate} className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 ml-2">
                Reiniciar e Instalar
              </Button>
            </div>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SyncIndicator />
            <span className="hidden sm:inline">{user?.email}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
