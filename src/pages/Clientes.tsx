import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus, Search, User, FileText, CheckCircle2, LayoutGrid, List, Pencil, Sparkles, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClienteFormModal } from "@/components/Clientes/ClienteFormModal";
import { ClienteHistoricoModal } from "@/components/Clientes/ClienteHistoricoModal";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/lib/utils";
import { getLoyaltyPromoConfig, getCustomerPurchasesCount } from "@/lib/loyalty";

export default function Clientes() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("clientes_view_mode") as "grid" | "list") || "grid";
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [historyCustomer, setHistoryCustomer] = useState<any>(null);

  // Busca profile para pegar store_id correto
  const { data: profile } = useQuery({
    queryKey: ["profile", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("auth_user_id", session!.user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const storeId = profile?.store_id ?? session?.user?.id;

  // Busca loja
  const { data: store } = useQuery({
    queryKey: ["user-store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  // Busca clientes (Online + Offline)
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["store-customers", storeId],
    queryFn: async () => {
      let onlineList: any[] = [];
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("store_id", storeId!)
          .order("name");
        if (!error && data) {
          onlineList = data;
        }
      } catch (e) {
        console.warn("Erro ao buscar clientes online:", e);
      }

      // Busca também clientes salvos localmente
      const localKey = `customers_local_${storeId}`;
      const localList: any[] = JSON.parse(localStorage.getItem(localKey) || "[]");
      const onlinePhones = new Set(onlineList.map(c => c.phone?.replace(/\D/g, "")).filter(Boolean));
      const onlyLocal = localList.filter(c => !onlinePhones.has(c.phone?.replace(/\D/g, "")));

      return [...onlineList, ...onlyLocal];
    },
    enabled: !!storeId,
  });
  const loyaltyConfig = getLoyaltyPromoConfig(storeId);

  const filteredCustomers = customers?.filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  ) || [];

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const handleOpenHistory = (customer: any) => {
    setHistoryCustomer(customer);
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
            <p className="text-muted-foreground">
              Gerencie a base de clientes cadastrados e acompanhe o programa de fidelidade.
            </p>
          </div>
          <Button onClick={() => { setEditingCustomer(null); setIsFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        <main className="grid flex-1 items-start gap-4 p-0 sm:py-0 md:gap-8">
          <div className="flex flex-col gap-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Alternador de Visualização: Cards vs Colunas (Tabela) */}
                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border shrink-0">
                  <Button
                    type="button"
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs px-2.5"
                    onClick={() => {
                      setViewMode("grid");
                      localStorage.setItem("clientes_view_mode", "grid");
                    }}
                    title="Exibição em Cards"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Cards</span>
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs px-2.5"
                    onClick={() => {
                      setViewMode("list");
                      localStorage.setItem("clientes_view_mode", "list");
                    }}
                    title="Exibição em Colunas (Tabela)"
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>Colunas</span>
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Nenhum cliente encontrado.</p>
                </div>
              ) : viewMode === "list" ? (
                /* ── MODO TABELA / COLUNAS ── */
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone / WhatsApp</TableHead>
                        <TableHead className="hidden md:table-cell">Endereço</TableHead>
                        <TableHead>Fidelidade / Compras</TableHead>
                        <TableHead className="hidden lg:table-cell">Observações</TableHead>
                        <TableHead className="text-center">Promoções</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer: any) => {
                        const purchasesCount = getCustomerPurchasesCount(customer.id, customer.phone);
                        const target = loyaltyConfig.targetPurchases || 10;
                        const hasReward = loyaltyConfig.enabled && purchasesCount >= target;

                        return (
                          <TableRow key={customer.id} className="hover:bg-muted/30">
                            <TableCell className="font-semibold">
                              <span className="text-foreground">{customer.name}</span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {customer.phone ? (
                                <span className="text-muted-foreground font-sans">{formatPhoneDisplay(customer.phone)}</span>
                              ) : (
                                <span className="text-muted-foreground/60">—</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs truncate">
                              {customer.address || "—"}
                            </TableCell>
                            <TableCell>
                              {loyaltyConfig.enabled ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md text-xs font-semibold">
                                    <Sparkles className="h-3 w-3 text-amber-600" />
                                    <span>{purchasesCount} / {target}</span>
                                  </div>
                                  {hasReward && (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                                      🎁 Prêmio Pronto!
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-xs truncate">
                              {customer.notes ? (
                                <span className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                                  {customer.notes}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              {customer.accepts_promotions ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
                                  <CheckCircle2 className="h-3 w-3" /> Sim
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => handleOpenHistory(customer)}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Histórico</span>
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => handleEdit(customer)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Editar</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* ── MODO CARDS (GRADE) ── */
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCustomers.map((customer: any) => {
                    const purchasesCount = getCustomerPurchasesCount(customer.id, customer.phone);
                    const target = loyaltyConfig.targetPurchases || 10;
                    const hasReward = loyaltyConfig.enabled && purchasesCount >= target;

                    return (
                      <div 
                        key={customer.id} 
                        className="group border rounded-lg p-4 hover:border-primary/50 transition-colors bg-white shadow-sm flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg line-clamp-1">{customer.name}</h3>
                            {customer.accepts_promotions && (
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Aceita Promoções
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-1">
                            📞 {formatPhoneDisplay(customer.phone)}
                          </p>
                          
                          {customer.address && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              📍 {customer.address}
                            </p>
                          )}
                          
                          {/* Selos / Fidelidade */}
                          {loyaltyConfig.enabled && (
                            <div className="my-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs text-amber-900 font-semibold">
                                <Sparkles className="h-4 w-4 text-amber-600" />
                                <span>{loyaltyConfig.name || "Fidelidade"}:</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold bg-white px-2 py-0.5 rounded border border-amber-200 text-amber-900">
                                  {purchasesCount} / {target} compras
                                </span>
                                {hasReward && (
                                  <span className="text-xs bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded animate-pulse">
                                    🎁 Prêmio!
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {customer.notes && (
                            <p className="text-xs bg-amber-50 text-amber-900 border border-amber-100 p-2 rounded-md line-clamp-2">
                              📝 {customer.notes}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex gap-2 mt-4 pt-3 border-t">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleOpenHistory(customer)}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Histórico
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleEdit(customer)}
                          >
                            Editar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <ClienteFormModal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        customer={editingCustomer}
        storeId={storeId || store?.id}
      />

      <ClienteHistoricoModal
        isOpen={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
        customer={historyCustomer}
        storeId={storeId || store?.id}
      />
    </>
  );
}
