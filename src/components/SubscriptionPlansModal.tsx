import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Copy, CheckCircle2, RefreshCw, Sparkles, FileText, Bot, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface PlanOption {
  id: "sem_nota" | "sem_nota_bot" | "com_nota";
  name: string;
  badge?: string;
  priceDisplay: string;
  periodDisplay: string;
  description: string;
  features: string[];
  recommended?: boolean;
}

export const SUBSCRIPTION_PLANS: PlanOption[] = [
  {
    id: "sem_nota",
    name: "Sem Nota Fiscal",
    priceDisplay: "R$ 70",
    periodDisplay: "/mês",
    description: "Ideal para MEI e pequenos comércios que não necessitam de emissão fiscal.",
    features: [
      "Frente de Caixa (PDV) Completo",
      "Controle de Estoque e Categorias",
      "Mesas, Comandas e Balcão",
      "Promissórias & Crediário",
      "Impressão Térmica 58mm/80mm",
      "Suporte por WhatsApp",
    ],
  },
  {
    id: "sem_nota_bot",
    name: "Sem Nota + Bot WhatsApp",
    badge: "Mais Popular",
    priceDisplay: "R$ 100",
    periodDisplay: "/mês",
    description: "Para quem quer automatizar o atendimento e pedidos pelo WhatsApp.",
    features: [
      "Tudo do Plano Sem Nota Fiscal",
      "Bot / Robô no WhatsApp",
      "Cardápio Digital Integrado",
      "Envio automático de status de pedidos",
      "Atendimento 24 horas aos clientes",
    ],
    recommended: true,
  },
  {
    id: "com_nota",
    name: "Com Nota Fiscal",
    badge: "Fiscal Completo",
    priceDisplay: "R$ 240",
    periodDisplay: "/mês (+ R$ 450 implantação)",
    description: "Emissão fiscal homologada NFC-e / NF-e com suporte tributário.",
    features: [
      "Emissão ilimitada de NFC-e e NF-e",
      "Homologação SEFAZ e CSC / Certificado",
      "Implantação e Configuração Fiscal (R$ 450)",
      "Reforma Tributária 2026 (CBS / IBS)",
      "Todos os recursos do PDV liberados",
    ],
  },
];

interface SubscriptionPlansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onPaymentSuccess?: () => void;
}

export function SubscriptionPlansModal({
  open,
  onOpenChange,
  storeId,
  onPaymentSuccess,
}: SubscriptionPlansModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [pixData, setPixData] = useState<{
    id: string;
    amount: number;
    asaas_payment_id: string;
    pix_qr_code: string | null;
    pix_copy_paste: string | null;
    plan_name: string;
  } | null>(null);

  // Limpa estado ao fechar
  useEffect(() => {
    if (!open) {
      setPixData(null);
      setSelectedPlan(null);
    }
  }, [open]);

  // Polling automático para checar pagamento a cada 5 segundos enquanto o modal com PIX estiver aberto
  useEffect(() => {
    if (!pixData?.asaas_payment_id || !open) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("asaas-subscription", {
          body: {
            action: "check_payment",
            storeId,
            paymentId: pixData.asaas_payment_id,
          },
        });

        if (data?.isPaid) {
          toast.success("🎉 Pagamento PIX confirmado com sucesso! Licença ativada por mais 30 dias.");
          onPaymentSuccess?.();
          onOpenChange(false);
        }
      } catch (err) {
        // silencioso no polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pixData, open, storeId, onPaymentSuccess, onOpenChange]);

  const handleGeneratePix = async (plan: PlanOption) => {
    try {
      setSelectedPlan(plan);
      setLoadingPix(true);

      const { data, error } = await supabase.functions.invoke("asaas-subscription", {
        body: {
          action: "create_pix",
          storeId,
          planId: plan.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPixData(data);
      toast.success("QR Code PIX gerado com sucesso! Efetue o pagamento pelo seu banco.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar PIX para assinatura.");
    } finally {
      setLoadingPix(false);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.pix_copy_paste) return;
    navigator.clipboard.writeText(pixData.pix_copy_paste);
    toast.success("Código PIX Copia e Cola copiado para a área de transferência!");
  };

  const handleManualCheck = async () => {
    if (!pixData?.asaas_payment_id) return;
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-subscription", {
        body: {
          action: "check_payment",
          storeId,
          paymentId: pixData.asaas_payment_id,
        },
      });

      if (error) throw error;

      if (data?.isPaid) {
        toast.success("🎉 Pagamento confirmado! Seu PDV foi liberado.");
        onPaymentSuccess?.();
        onOpenChange(false);
      } else {
        toast.info("Pagamento ainda em processamento. Assim que o banco compensar, a liberação é imediata.");
      }
    } catch (err: any) {
      toast.error(`Erro ao verificar: ${err.message}`);
    } finally {
      setCheckingPayment(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Zap className="h-6 w-6" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold font-['Space_Grotesk']">
                {pixData ? "Pagamento da Assinatura via PIX" : "Escolha o Plano do seu PDV"}
              </DialogTitle>
              <DialogDescription>
                {pixData
                  ? "Escaneie o QR Code ou utilize o Pix Copia e Cola. A ativação é automática e instantânea."
                  : "Acesso total a todos os recursos. Liberação imediata após o pagamento via PIX."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {pixData ? (
          <div className="space-y-6 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 mb-2">
                Aguardando Pagamento
              </Badge>
              <h3 className="text-lg font-bold text-emerald-950">{pixData.plan_name}</h3>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                R$ {pixData.amount.toFixed(2).replace(".", ",")}
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 bg-slate-50 border border-slate-200 rounded-2xl p-6">
              {pixData.pix_qr_code ? (
                <div className="text-center space-y-2">
                  <div className="p-3 bg-white border rounded-2xl shadow-sm inline-block">
                    <img
                      src={pixData.pix_qr_code}
                      alt="QR Code PIX"
                      className="w-56 h-56 object-contain rounded-lg"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Abra o app do seu banco e aponte a câmera
                  </p>
                </div>
              ) : (
                <div className="w-56 h-56 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-white text-muted-foreground text-center p-4">
                  <QrCode className="h-12 w-12 text-slate-400 mb-2" />
                  <span className="text-xs">QR Code gerado para a chave Pix Copia e Cola</span>
                </div>
              )}

              <div className="flex-1 space-y-4 w-full">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Copy className="h-3.5 w-3.5 text-blue-600" />
                    Código Pix Copia e Cola:
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={pixData.pix_copy_paste || "Código não disponível"}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none"
                    />
                    <Button onClick={handleCopyPix} className="gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-700">
                      <Copy className="h-4 w-4" />
                      Copiar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t text-xs text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    Liberação automática e instantânea pelo Asaas.
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    Sua licença será estendida por +30 dias.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleManualCheck}
                    disabled={checkingPayment}
                    variant="outline"
                    className="w-full gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${checkingPayment ? "animate-spin" : ""}`} />
                    {checkingPayment ? "Verificando..." : "Já paguei, verificar agora"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setPixData(null)}
                    className="text-xs text-muted-foreground"
                  >
                    Escolher outro plano
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col justify-between border-2 transition-all hover:shadow-lg ${
                  plan.recommended
                    ? "border-blue-600 bg-blue-50/20 shadow-md ring-2 ring-blue-500/20"
                    : "border-slate-200 bg-white"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white font-semibold text-[11px] shadow">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold text-slate-900">{plan.name}</CardTitle>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">{plan.priceDisplay}</span>
                    <span className="text-xs text-muted-foreground font-medium">{plan.periodDisplay}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {plan.description}
                  </p>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-2 border-t pt-4">
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleGeneratePix(plan)}
                    disabled={loadingPix && selectedPlan?.id === plan.id}
                    className={`w-full mt-4 gap-2 font-bold ${
                      plan.recommended
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    {loadingPix && selectedPlan?.id === plan.id ? "Gerando PIX..." : "Assinar com PIX"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
