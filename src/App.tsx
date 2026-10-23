import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

// ── Carregamento imediato (páginas críticas) ─────────────────────────────────
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// ── Lazy loading (carrega só quando o usuário acessar) ────────────────────────
const Dashboard    = lazy(() => import("./pages/Dashboard"));
const PDV          = lazy(() => import("./pages/PDV"));
const Products     = lazy(() => import("./pages/Products"));
const Stock        = lazy(() => import("./pages/Stock"));
const Reports      = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Pedidos      = lazy(() => import("./pages/Pedidos"));
const Clientes     = lazy(() => import("./pages/Clientes"));
const PDVPublico   = lazy(() => import("./pages/PDVPublico"));
const Cardapio     = lazy(() => import("./pages/Cardapio"));
const PedidoStatus = lazy(() => import("./pages/PedidoStatus"));
const NotFound     = lazy(() => import("./pages/NotFound"));

// ── QueryClient com cache otimizado ──────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mantém dados em cache por 5 min antes de considerar "stale"
      staleTime: 5 * 60 * 1000,
      // Mantém no cache por 10 min após o componente desmontar
      gcTime: 10 * 60 * 1000,
      // Não recarrega ao focar a janela (evita requisições desnecessárias)
      refetchOnWindowFocus: false,
      // Tenta 1 vez em caso de erro (padrão é 3), mas não tenta se for erro de rede (Failed to fetch)
      retry: (failureCount, error) => {
        if (error.message === 'Failed to fetch' || error.message?.includes('fetch')) return false;
        return failureCount < 1;
      },
    },
  },
});

// ── Spinner de fallback ───────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Públicas ─────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />

            {/* ── Links para atendentes / clientes ─────────────────── */}
            <Route path="/pdv/:storeId"      element={<PDVPublico />} />
            <Route path="/cardapio/:storeId" element={<Cardapio />} />
            <Route path="/pedido/:orderId"   element={<PedidoStatus />} />

            {/* ── Painel administrativo (requer login) ─────────────── */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index          element={<Dashboard />} />
              <Route path="pdv"      element={<PDV key="pdv" />} />
              <Route path="delivery" element={<PDV key="delivery" isDeliveryMode={true} />} />
              <Route path="products" element={<Products />} />
              <Route path="stock"    element={<Stock />} />
              <Route path="reports"  element={<Reports />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="pedidos"  element={<Pedidos />} />
              <Route path="clientes" element={<Clientes />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
