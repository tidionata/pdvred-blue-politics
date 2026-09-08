import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus, Search, User, FileText, CheckCircle2, LayoutGrid, List, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClienteFormModal } from "@/components/Clientes/ClienteFormModal";
import { ClienteHistoricoModal } from "@/components/Clientes/ClienteHistoricoModal";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/lib/utils";

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

  const handleAddNew = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  return (
    <>
      <div className="flex-1 flex flex-col h-full">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <User className="h-6 w-6 text-primary" />
                  Clientes
                </h1>
                <p className="text-muted-foreground text-sm">
                  Gerencie sua base de clientes e histórico de pedidos.
                </p>
              </div>

              <Button onClick={handleAddNew} className="w-full sm:w-auto gap-2">
                <Plus className="h-4 w-4" />
                Novo Cliente
              </Button>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Botões para alternar modo de visualização: Grade (Cards) vs Lista (Colunas) */}
                <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30 shrink-0 self-end sm:self-auto">
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
                        <TableHead className="hidden lg:table-cell">Observações</TableHead>
                        <TableHead className="text-center">Promoções</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer: any) => (
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* ── MODO CARDS (GRADE) ── */
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCustomers.map((customer: any) => (
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
                  ))}
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
