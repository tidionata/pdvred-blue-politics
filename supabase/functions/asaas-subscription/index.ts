import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Planos e valores cadastrados
const PLANS_CONFIG: Record<string, { name: string; amount: number; isFiscal: boolean }> = {
  sem_nota: {
    name: "PDV Sem Nota Fiscal",
    amount: 70.0,
    isFiscal: false,
  },
  sem_nota_bot: {
    name: "PDV Sem Nota Fiscal + Bot WhatsApp",
    amount: 100.0,
    isFiscal: false,
  },
  com_nota: {
    name: "PDV Com Nota Fiscal (Implantação R$ 450 + 1ª Mensalidade R$ 240)",
    amount: 690.0, // 450 implantação + 240 mês
    isFiscal: true,
  },
  com_nota_recorrente: {
    name: "PDV Com Nota Fiscal (Mensalidade)",
    amount: 240.0,
    isFiscal: true,
  },
};

const ASAAS_BASE_URL = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const db = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // 1. WEBHOOK DO ASAAS (Confirmação de pagamento Pix em tempo real)
    const url = new URL(req.url);
    if (url.pathname.endsWith("/webhook") || req.headers.get("asaas-access-token")) {
      const body = await req.json().catch(() => ({}));
      const event = body.event;
      const payment = body.payment;

      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        const paymentId = payment?.id;
        if (paymentId) {
          // Busca a cobrança no banco
          const { data: charge } = await db
            .from("subscription_charges")
            .select("*")
            .eq("asaas_payment_id", paymentId)
            .maybeSingle();

          if (charge) {
            const paidAt = new Date().toISOString();
            // Atualiza cobrança como paga
            await db
              .from("subscription_charges")
              .update({ status: "CONFIRMED", paid_at: paidAt })
              .eq("id", charge.id);

            // Estende por 30 dias na tabela stores
            const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await db
              .from("stores")
              .update({
                status: "active",
                expires_at: newExpiresAt,
                plan_type: charge.plan_id.startsWith("com_nota") ? "business" : "pro",
                block_reason: null,
              })
              .eq("id", charge.store_id);

            // Atualiza subscriptions
            await db
              .from("subscriptions")
              .upsert({
                store_id: charge.store_id,
                plan: charge.plan_id.startsWith("com_nota") ? "business" : "pro",
                status: "active",
                current_period_end: newExpiresAt,
                updated_at: paidAt,
              });
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. REQUISIÇÕES DA APLICAÇÃO (Gerar Pix de cobrança)
    const body = await req.json().catch(() => ({}));
    const { action, storeId, planId } = body;

    if (!storeId) throw new Error("storeId é obrigatório");

    // Identificar a chave Asaas Master (usa a variável de ambiente global ou a salva no banco)
    let asaasMasterKey = Deno.env.get("ASAAS_MASTER_API_KEY") || Deno.env.get("ASAAS_API_KEY");

    if (!asaasMasterKey) {
      // Fallback: busca das configurações da loja administradora
      const { data: adminSecret } = await db
        .from("store_secrets")
        .select("asaas_config")
        .eq("store_id", storeId)
        .maybeSingle();
      asaasMasterKey = adminSecret?.asaas_config?.api_key;
    }

    if (!asaasMasterKey) {
      throw new Error(
        "Chave de API do Asaas para recebimento não encontrada. Configure ASAAS_MASTER_API_KEY no Supabase ou adicione em Configurações > Asaas."
      );
    }

    if (action === "create_pix") {
      const plan = PLANS_CONFIG[planId] || PLANS_CONFIG.sem_nota;

      // Busca dados da loja e do dono para registrar no Asaas
      const { data: store } = await db
        .from("stores")
        .select("id, name, owner_email")
        .eq("id", storeId)
        .single();

      // 1. Criar ou consultar cliente no Asaas
      const custRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: asaasMasterKey,
        },
        body: JSON.stringify({
          name: store?.name || "Lojista PDV",
          email: store?.owner_email || undefined,
          externalReference: storeId,
        }),
      });

      const custData = await custRes.json().catch(() => ({}));
      const asaasCustomerId = custData.id;
      if (!asaasCustomerId) {
        throw new Error(`Erro ao registrar cliente no Asaas: ${custData.message || JSON.stringify(custData)}`);
      }

      // 2. Criar cobrança PIX no Asaas
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // vence em 24h
      const payRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: asaasMasterKey,
        },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "PIX",
          value: plan.amount,
          dueDate,
          description: `Mensalidade PDV Total - ${plan.name}`,
          externalReference: storeId,
        }),
      });

      const payData = await payRes.json().catch(() => ({}));
      if (!payData.id) {
        throw new Error(`Erro ao gerar cobrança no Asaas: ${payData.message || JSON.stringify(payData)}`);
      }

      // 3. Obter QR Code PIX e Copia e Cola
      const qrRes = await fetch(`${ASAAS_BASE_URL}/payments/${payData.id}/pixQrCode`, {
        headers: {
          access_token: asaasMasterKey,
        },
      });
      const qrData = await qrRes.json().catch(() => ({}));

      // 4. Salvar cobrança na tabela local
      const { data: savedCharge, error: chargeErr } = await db
        .from("subscription_charges")
        .insert({
          store_id: storeId,
          plan_id: planId,
          plan_name: plan.name,
          amount: plan.amount,
          asaas_payment_id: payData.id,
          asaas_customer_id: asaasCustomerId,
          status: "PENDING",
          pix_qr_code: qrData.encodedImage ? `data:image/png;base64,${qrData.encodedImage}` : null,
          pix_copy_paste: qrData.payload || null,
          pix_expiration_date: qrData.expirationDate || null,
        })
        .select()
        .single();

      if (chargeErr) throw chargeErr;

      return new Response(JSON.stringify(savedCharge), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "check_payment") {
      const { paymentId } = body;
      if (!paymentId) throw new Error("paymentId é obrigatório");

      const res = await fetch(`${ASAAS_BASE_URL}/payments/${paymentId}`, {
        headers: { access_token: asaasMasterKey },
      });
      const data = await res.json().catch(() => ({}));

      const isPaid = data.status === "RECEIVED" || data.status === "CONFIRMED";
      if (isPaid) {
        const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db
          .from("subscription_charges")
          .update({ status: "CONFIRMED", paid_at: new Date().toISOString() })
          .eq("asaas_payment_id", paymentId);

        await db
          .from("stores")
          .update({
            status: "active",
            expires_at: newExpiresAt,
            block_reason: null,
          })
          .eq("id", storeId);
      }

      return new Response(JSON.stringify({ isPaid, status: data.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
