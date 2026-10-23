import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

// ── Rotas por nível de acesso ─────────────────────────────────────────────────
// owner   → acesso total
// manager → acesso total EXCETO configurações de segurança
// cashier → apenas PDV e Dashboard (visualização)
const CASHIER_ALLOWED  = ["/dashboard", "/dashboard/pdv"];
const MANAGER_BLOCKED  = ["/dashboard/settings"]; // settings requer owner

type Role = "owner" | "manager" | "cashier";

function canAccess(role: Role | undefined, pathname: string): boolean {
  if (!role || role === "owner") return true;

  if (role === "manager") {
    return !MANAGER_BLOCKED.some((r) => pathname.startsWith(r));
  }

  if (role === "cashier") {
    return CASHIER_ALLOWED.some((r) => pathname === r || pathname.startsWith(r + "/"));
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Busca o role do usuário (com cache de 10 min — muda raramente)
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-role", user?.id],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Não autenticado → redireciona para login ─────────────────────────────────
  if (!user) return <Navigate to="/auth" replace />;

  // ── Verificação de role (IDOR / elevação de privilégio) ─────────────────────
  const role = profile?.role as Role | undefined;
  if (profile && !canAccess(role, location.pathname)) {
    // Redireciona para o PDV (único acesso do caixa) com mensagem discreta
    console.warn(`[Security] Acesso negado: role="${role}" tentou acessar "${location.pathname}"`);
    return <Navigate to="/dashboard/pdv" replace />;
  }

  return <>{children}</>;
}
