import { supabase } from "@/integrations/supabase/client";

export interface FocusNfeItem {
  numero_item: string;
  codigo_produto: string;
  descricao: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  icms_situacao_tributaria: string;
  icms_origem: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;
  // Reforma Tributária 2026
  situacao_tributaria_ibs_cbs?: string;
  classificacao_tributaria?: string;
  base_calculo_ibs_cbs?: number;
  aliquota_cbs?: number;
  aliquota_ibs?: number;
}

export interface FocusNfeSale {
  data_emissao: string;
  natureza_operacao: string;
  tipo_documento: number;
  local_destino: number;
  finalidade_emissao: number;
  consumidor_final: number;
  presenca_comprador: number;
  modalidade_frete: number;
  valor_total_bruto: number;
  valor_total_itens: number;
  items: FocusNfeItem[];
  formas_pagamento: {
    forma_pagamento: string;
    valor_pagamento: number;
  }[];
}

export async function emitirNfce(storeId: string, saleData: any) {
  try {
    // 1. Mapear dados da venda para o formato Focus NFe
    const nfePayload: FocusNfeSale = {
      data_emissao: new Date().toISOString(),
      natureza_operacao: "Venda de mercadoria",
      tipo_documento: 1, // 1 = Nota Fiscal
      local_destino: 1,  // 1 = Interna
      finalidade_emissao: 1, // 1 = Normal
      consumidor_final: 1, // 1 = Sim
      presenca_comprador: 1, // 1 = Presencial
      modalidade_frete: 9, // 9 = Sem frete
      valor_total_bruto: saleData.total,
      valor_total_itens: saleData.total,
      items: saleData.items.map((item: any, index: number) => {
        const itemSubtotal = item.unitPrice * item.quantity;
        // Calcula o desconto proporcional para o item se houver desconto total na venda
        const totalBeforeDiscount = saleData.items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0);
        const discountValue = totalBeforeDiscount - saleData.total;
        const itemDiscount = totalBeforeDiscount > 0 ? (itemSubtotal / totalBeforeDiscount) * discountValue : 0;
        const ibsCbsBase = Math.max(0, itemSubtotal - itemDiscount);

        return {
          numero_item: String(index + 1),
          codigo_produto: item.product.barcode || item.product.id.substring(0, 8),
          descricao: item.product.name,
          cfop: "5102", // Padrão revenda interna
          unidade_comercial: item.product.unit || "UN",
          quantidade_comercial: item.quantity,
          valor_unitario_comercial: item.unitPrice,
          valor_bruto: itemSubtotal,
          icms_situacao_tributaria: "102", // Simples Nacional - Tributada sem permissão de crédito
          icms_origem: "0", // Nacional
          pis_situacao_tributaria: "07", // Isento
          cofins_situacao_tributaria: "07", // Isento
          
          // Reforma Tributária 2026
          situacao_tributaria_ibs_cbs: "00", // Tributada integralmente
          classificacao_tributaria: item.product.tax_ibs_cbs_classificacao || "010101", // Fallback para exemplo se não configurado
          base_calculo_ibs_cbs: Number(ibsCbsBase.toFixed(2)),
          aliquota_cbs: 0.9, 
          aliquota_ibs: 0.1,
        };
      }),
      formas_pagamento: [
        {
          forma_pagamento: mapPaymentMethod(saleData.paymentMethod),
          valor_pagamento: saleData.total,
        }
      ]
    };

    // 2. Enviar para a Focus NFe via Supabase Edge Function (Proxy Seguro)
    // O TOKEN NÃO É ENVIADO PELO FRONTEND. A Edge Function busca o token no banco de dados
    // usando a Service Role Key, garantindo que o caixa consiga emitir sem ver o token.
    const { data, error: functionError } = await supabase.functions.invoke("focus-nfe-proxy", {
      body: {
        storeId,
        payload: nfePayload,
        ref: saleData.id
      },
    });

    if (functionError) throw new Error(functionError.message || "Erro no proxy de NFe");

    return data;
  } catch (error: any) {
    console.error("Erro na emissão:", error);
    throw error;
  }
}

function mapPaymentMethod(method: string) {
  switch (method) {
    case "cash": return "01";
    case "credit": return "03";
    case "debit": return "04";
    case "pix": return "17";
    default: return "99";
  }
}
