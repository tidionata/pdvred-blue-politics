import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLUGNOTAS_SANDBOX_URL = 'https://api.sandbox.plugnotas.com.br';
const PLUGNOTAS_PROD_URL = 'https://api.plugnotas.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();

    // Chave da API do PlugNotas salva como secret no Supabase
    const PLUGNOTAS_API_KEY = Deno.env.get('PLUGNOTAS_API_KEY');
    const SANDBOX_MODE = Deno.env.get('PLUGNOTAS_SANDBOX') !== 'false'; // padrão: sandbox ativo

    if (!PLUGNOTAS_API_KEY) {
      throw new Error('PLUGNOTAS_API_KEY não configurada no servidor.');
    }

    const BASE_URL = SANDBOX_MODE ? PLUGNOTAS_SANDBOX_URL : PLUGNOTAS_PROD_URL;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': PLUGNOTAS_API_KEY,
    };

    // ── TESTAR CONEXÃO ────────────────────────────────────────────────────────
    if (action === 'test_connection') {
      const res = await fetch(`${BASE_URL}/empresa`, { method: 'GET', headers });
      const data = await res.json();

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: 'Falha na conexão com PlugNotas',
          details: data,
          status: res.status,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Conexão com PlugNotas OK! Ambiente: ${SANDBOX_MODE ? 'Sandbox' : 'Produção'}`,
        empresas: Array.isArray(data) ? data.length : 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ── EMITIR NFS-e ─────────────────────────────────────────────────────────
    if (action === 'create_nfse') {
      const {
        cnpjPrestador,      // CNPJ da empresa emissora (sem formatação)
        nomeCliente,
        cpfCnpjCliente,
        emailCliente,
        valorTotal,
        descricaoServico,
        idExterno,          // ID do pedido no sistema (evita duplicidade)
      } = payload;

      if (!cnpjPrestador) {
        throw new Error('CNPJ do prestador não informado. Configure o CNPJ da sua empresa nas Configurações.');
      }

      const body = {
        idExterno: idExterno || `pdv_${Date.now()}`,
        prestador: {
          cpfCnpj: cnpjPrestador,
        },
        tomador: {
          tipoPessoa: (cpfCnpjCliente?.replace(/\D/g, '').length ?? 0) > 11 ? 'J' : 'F',
          nome: nomeCliente || 'Consumidor Final',
          cpfCnpj: cpfCnpjCliente?.replace(/\D/g, '') || undefined,
          email: emailCliente || undefined,
        },
        servico: [
          {
            descricao: descricaoServico || 'Venda de produtos e serviços',
            valorTotal: Number(valorTotal),
            issRetidoFonte: false,
          },
        ],
        valorTotal: Number(valorTotal),
      };

      const res = await fetch(`${BASE_URL}/nfse`, {
        method: 'POST',
        headers,
        body: JSON.stringify([body]),
      });

      const data = await res.json();

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: 'Erro ao emitir NFS-e no PlugNotas',
          details: data,
          status: res.status,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      return new Response(JSON.stringify({
        success: true,
        protocolo: data?.data?.protocolo || data?.protocol,
        id: data?.data?.id || data?.id,
        raw: data,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ── CONSULTAR STATUS DA NOTA ─────────────────────────────────────────────
    if (action === 'get_nfse') {
      const { protocolo } = payload;
      const res = await fetch(`${BASE_URL}/nfse/${protocolo}`, { method: 'GET', headers });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // ── BAIXAR PDF DA NOTA ───────────────────────────────────────────────────
    if (action === 'get_pdf_url') {
      const { protocolo } = payload;
      // Faz o fetch do PDF e retorna a URL pública (se disponível) ou o conteúdo
      const pdfRes = await fetch(`${BASE_URL}/nfse/${protocolo}/pdf`, {
        method: 'GET',
        headers: { 'x-api-key': PLUGNOTAS_API_KEY },
      });

      if (!pdfRes.ok) {
        const errData = await pdfRes.json().catch(() => ({}));
        return new Response(JSON.stringify({
          error: 'Não foi possível obter o PDF da nota',
          details: errData,
          protocolo,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Retorna o PDF como base64 para o frontend abrir
      const pdfBuffer = await pdfRes.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

      return new Response(JSON.stringify({
        success: true,
        pdf_base64: pdfBase64,
        protocolo,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
});
