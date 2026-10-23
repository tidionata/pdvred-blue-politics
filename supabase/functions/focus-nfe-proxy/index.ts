import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { storeId, payload, ref } = await req.json()

    if (!storeId) {
      throw new Error("ID da loja não fornecido ao proxy")
    }

    // 1. Inicializa o cliente Supabase com a Service Role Key (Server Side Only)
    // Isso permite ler a tabela store_secrets mesmo que o usuário logado (caixa) não tenha permissão de RLS.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Busca o token da Focus NFe de forma segura
    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from("store_secrets")
      .select("nfe_config")
      .eq("store_id", storeId)
      .single()

    if (secretsError || !secrets?.nfe_config) {
      throw new Error(`Configurações da Focus NFe não encontradas para a loja ${storeId}`)
    }

    const config = secrets.nfe_config as any
    const token = config.token
    const ambiente = config.ambiente

    if (!token) {
      throw new Error("Token da Focus NFe não configurado no banco de dados.")
    }

    const baseUrl = ambiente === "producao" 
      ? "https://api.focusnfe.com.br" 
      : "https://homologacao.focusnfe.com.br"

    console.log(`[Proxy] Emitindo NFC-e via Backend para ref: ${ref} (Loja: ${storeId})`)

    const response = await fetch(`${baseUrl}/v2/nfce?ref=${ref}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(token + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })

  } catch (error) {
    console.error(`[Proxy Error] ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
