import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { maskPhone } from "@/lib/utils";

interface ClienteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any | null;
  storeId: string | undefined;
}

export function ClienteFormModal({ isOpen, onClose, customer, storeId }: ClienteFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!customer;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptsPromotions, setAcceptsPromotions] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name || "");
      setPhone(customer.phone || "");
      setAddress(customer.address || "");
      setNotes(customer.notes || "");
      setAcceptsPromotions(customer.accepts_promotions || false);
    } else {
      setName("");
      setPhone("");
      setAddress("");
      setNotes("");
      setAcceptsPromotions(false);
    }
  }, [customer, isOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Loja não encontrada");
      
      const payload = {
        store_id: storeId,
        name,
        phone,
        address,
        notes,
        accepts_promotions: acceptsPromotions,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customers")
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Cliente atualizado!" : "Cliente cadastrado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["store-customers"] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar cliente: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome do cliente é obrigatório");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              placeholder="Ex: João da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input
              id="phone"
              placeholder="Ex: (11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço de Entrega</Label>
            <Input
              id="address"
              placeholder="Ex: Rua das Flores, 123"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (Descrição)</Label>
            <Textarea
              id="notes"
              placeholder="Ex: Cliente prefere entregas à tarde. Alérgico a amendoim."
              className="resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Mandar Promoções?</Label>
              <p className="text-sm text-muted-foreground">
                Permitir o envio de ofertas e cupons para este cliente.
              </p>
            </div>
            <Switch
              checked={acceptsPromotions}
              onCheckedChange={setAcceptsPromotions}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
