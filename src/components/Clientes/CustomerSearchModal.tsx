import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, MapPin, Phone } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

interface CustomerSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  onSelectCustomer: (customer: Customer) => void;
  onNewCustomer: () => void;
}

export function CustomerSearchModal({ isOpen, onClose, storeId, onSelectCustomer, onNewCustomer }: CustomerSearchModalProps) {
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["store-customers", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("store_id", storeId)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: isOpen && !!storeId,
  });

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const s = search.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(s) || (c.phone && c.phone.includes(s))
    );
  }, [customers, search]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center pr-6">
            <span>Buscar Cliente</span>
            <Button size="sm" onClick={() => { onClose(); onNewCustomer(); }} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
              <UserPlus className="h-4 w-4" />
              Novo
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            className="pl-9 h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-2 pb-4">
          {isLoading && <p className="text-center text-muted-foreground py-4 text-sm">Carregando clientes...</p>}
          {!isLoading && filteredCustomers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm mb-4">Nenhum cliente encontrado.</p>
              <Button variant="outline" onClick={() => { onClose(); onNewCustomer(); }}>
                Cadastrar "{search}"
              </Button>
            </div>
          )}
          {!isLoading && filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => {
                onSelectCustomer(customer);
                onClose();
              }}
              className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors group"
            >
              <div className="font-semibold text-sm group-hover:text-primary transition-colors">{customer.name}</div>
              {customer.phone && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </div>
              )}
              {customer.address && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 line-clamp-1">
                  <MapPin className="h-3 w-3 min-w-[12px]" /> {customer.address}
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
