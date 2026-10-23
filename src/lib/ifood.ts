import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Intervalo de polling exigido pela homologação do iFood (mínimo de 30 segundos). */
export const IFOOD_POLLING_INTERVAL_MS = 30_000;

/** Chama a Edge Function ifood-manager e lança erro legível se algo falhar. */
export async function callIfood<T = any>(action: string, storeId: string, extra: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ifood-manager", {
    body: { action, storeId, ...extra },
  });
  if (error) throw new Error(error.message || "Falha ao comunicar com o iFood");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const IFOOD_STATUS_LABELS: Record<string, string> = {
  PLACED: "Novo",
  CONFIRMED: "Confirmado",
  PREPARATION_STARTED: "Em preparo",
  SEPARATION_STARTED: "Em separação",
  SEPARATION_ENDED: "Separado",
  READY_TO_PICKUP: "Pronto",
  DISPATCHED: "Despachado",
  CONCLUDED: "Concluído",
  CANCELLED: "Cancelado",
  CANCELLATION_REQUESTED: "Cancelamento solicitado",
  CANCELLATION_REQUEST_FAILED: "Cancelamento recusado",
};

export const IFOOD_DELIVERY_STATUS_LABELS: Record<string, string> = {
  ASSIGN_DRIVER: "Entregador atribuído",
  GOING_TO_ORIGIN: "Entregador a caminho da loja",
  ARRIVED_AT_ORIGIN: "Entregador chegou na loja",
  COLLECTED: "Pedido coletado",
  ARRIVED_AT_DESTINATION: "Entregador chegou no cliente",
  DELIVERY_RETURNING_TO_ORIGIN: "Entregador retornando à loja",
  DELIVERY_RETURNED_TO_ORIGIN: "Pedido devolvido à loja",
  DELIVERY_RETURN_CODE_REQUESTED: "Código de devolução solicitado",
};

export const IFOOD_PAYMENT_LABELS: Record<string, string> = {
  CREDIT: "Crédito", DEBIT: "Débito", CASH: "Dinheiro", PIX: "PIX",
  MEAL_VOUCHER: "Vale-refeição", FOOD_VOUCHER: "Vale-alimentação",
  DIGITAL_WALLET: "Carteira digital", GIFT_CARD: "Gift card", OTHER: "Outro",
};

export const IFOOD_SPONSOR_LABELS: Record<string, string> = {
  IFOOD: "iFood", MERCHANT: "Loja", EXTERNAL: "Parceiro externo", CHAIN: "Rede",
};

/** Motivos aceitos pela Plataforma de negociação (doc: negotiationReasons). */
export const IFOOD_NEGOTIATION_REASONS: Record<string, string> = {
  HIGH_STORE_DEMAND: "Loja com alta demanda",
  UNKNOWN_ISSUE: "Problema não especificado",
  CUSTOMER_SATISFACTION: "Satisfação do cliente",
  INVENTORY_CHECK: "Verificação de disponibilidade",
  SYSTEM_ISSUE: "Problema técnico",
  WRONG_ORDER: "Pedido incorreto",
  PRODUCT_QUALITY: "Qualidade do produto",
  LATE_DELIVERY: "Entrega atrasada",
  CUSTOMER_REQUEST: "Solicitação do cliente",
  STORE_SYSTEM_ISSUES: "Problemas no sistema da loja",
  STORE_INTERNAL_DIFFICULTIES: "Dificuldades internas da loja",
  LACK_OF_DRIVERS: "Falta de entregadores",
  OTHER_REASONS: "Outros motivos",
  OPERATIONAL_ISSUES: "Problemas operacionais",
  ORDER_OUT_FOR_DELIVERY: "Pedido já saiu para entrega",
  DRIVER_IS_ALREADY_AT_THE_ADDRESS: "Entregador já está no endereço",
};

/**
 * Faz o polling de eventos do iFood a cada 30s enquanto o app estiver aberto.
 * Só roda se a loja tiver Client ID/Secret configurados.
 */
export function useIfoodPolling(storeId?: string | null) {
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (!running.current && navigator.onLine) {
        running.current = true;
        try {
          const result = await callIfood<{ received: number; processed: number }>("poll_events", storeId);
          if (result?.received > 0) {
            queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] });
          }
        } catch (e: any) {
          // iFood não configurado → para de tentar até recarregar a página
          if (String(e?.message || "").includes("não configurado")) { cancelled = true; return; }
          console.warn("[iFood] polling:", e?.message);
        } finally {
          running.current = false;
        }
      }
      if (!cancelled) timer = setTimeout(tick, IFOOD_POLLING_INTERVAL_MS);
    };

    // Só ativa se houver credenciais configuradas
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("store_secrets").select("ifood_config").eq("store_id", storeId).maybeSingle();
        const cfg = data?.ifood_config || {};
        if (cfg.client_id && cfg.client_secret && cfg.enabled !== false) tick();
      } catch { /* offline */ }
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [storeId, queryClient]);
}
