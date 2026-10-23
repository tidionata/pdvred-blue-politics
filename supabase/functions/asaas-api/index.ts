import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload, storeId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identificar a loja
    let targetStoreId = storeId;

    if (!targetStoreId) {
      // Tentar pegar do header de auth
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
          global: { headers: { Authorization: authHeader } }
        });
        const { data: { user } } = await supabaseAuth.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseAuth.from('profiles').select('store_id').eq('id', user.id).single();
          targetStoreId = profile?.store_id;
        }
      }
    }

    if (!targetStoreId) {
      throw new Error('Loja não identificada. Envie storeId ou Authorization header.');
    }

    // Buscar a API Key da loja
    const { data: secret, error: secretError } = await supabase
      .from('store_secrets')
      .select('asaas_config')
      .eq('store_id', targetStoreId)
      .single();

    if (secretError || !secret?.asaas_config?.api_key) {
      throw new Error('Chave da API do Asaas não configurada para esta loja.');
    }

    const ASAAS_API_KEY = secret.asaas_config.api_key;
    const ASAAS_URL = 'https://api.asaas.com/v3';

    if (action === 'test_connection') {
      const checkRes = await fetch(`${ASAAS_URL}/customers?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        }
      });
      const checkData = await checkRes.json();
      
      if (!checkRes.ok) {
        return new Response(JSON.stringify({ error: 'Erro de conexão com Asaas', details: checkData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Conexão com Asaas realizada com sucesso!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'create_invoice') {
      const { customerName, customerCpfCnpj, value, serviceDescription } = payload;
      
      // 1. Verificar se o cliente já existe ou criá-lo
      const createCustomerRes = await fetch(`${ASAAS_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        },
        body: JSON.stringify({
          name: customerName || 'Cliente Consumidor',
          cpfCnpj: customerCpfCnpj || undefined
        })
      });
      
      const customerData = await createCustomerRes.json();
      if (!customerData.id) {
        throw new Error('Erro ao criar cliente no Asaas: ' + JSON.stringify(customerData));
      }
      
      const customerId = customerData.id;

      // 2. Emitir a Nota Fiscal de Serviço (NFS-e)
      const invoicePayload = {
        customer: customerId,
        serviceDescription: serviceDescription || 'Venda de produtos/serviços diversos',
        value: Number(value),
        effectiveDate: new Date().toISOString().split('T')[0],
        updatePayment: false, // se houver cobrança atrelada
      };

      const createInvoiceRes = await fetch(`${ASAAS_URL}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        },
        body: JSON.stringify(invoicePayload)
      });
      
      const invoiceData = await createInvoiceRes.json();
      
      if (!createInvoiceRes.ok) {
        return new Response(JSON.stringify({ error: 'Erro ao emitir nota no Asaas', details: invoiceData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response(JSON.stringify(invoiceData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
