// ── Endpoints SEFAZ por UF — NFC-e / NF-e v4.00 ──────────────────────────────
// Fonte: Manual de Orientação ao Contribuinte MOC v7.0

export type SefazServico =
  | "NFeAutorizacao"
  | "NFeRetAutorizacao"
  | "NfeStatusServico"
  | "NfeInutilizacao"
  | "NfeConsultaProtocolo"
  | "NfeConsultaCadastro"
  | "RecepcaoEvento";

export const SERVICO_LABELS: Record<SefazServico, string> = {
  NFeAutorizacao:      "Autorização (envio)",
  NFeRetAutorizacao:   "Retorno Autorização",
  NfeStatusServico:    "Status do Serviço",
  NfeInutilizacao:     "Inutilização",
  NfeConsultaProtocolo:"Consulta Protocolo",
  NfeConsultaCadastro: "Consulta Cadastro",
  RecepcaoEvento:      "Recepção de Evento",
};

// UFs com SEFAZ própria
const AM: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
  NFeRetAutorizacao:   "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
  NfeStatusServico:    "https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4",
  NfeInutilizacao:     "https://nfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4",
  NfeConsultaProtocolo:"https://nfe.sefaz.am.gov.br/services2/services/NfeConsulta4",
  NfeConsultaCadastro: "https://nfe.sefaz.am.gov.br/services2/services/CadConsultaCadastro4",
  RecepcaoEvento:      "https://nfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4",
};
const BA: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
  NFeRetAutorizacao:   "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  NfeStatusServico:    "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
  NfeInutilizacao:     "https://nfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx",
  NfeConsultaProtocolo:"https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  NfeConsultaCadastro: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx",
  RecepcaoEvento:      "https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};
const GO: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4?wsdl",
  NFeRetAutorizacao:   "https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4?wsdl",
  NfeStatusServico:    "https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4?wsdl",
  NfeInutilizacao:     "https://nfe.sefaz.go.gov.br/nfe/services/NFeInutilizacao4?wsdl",
  NfeConsultaProtocolo:"https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4?wsdl",
  NfeConsultaCadastro: "https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4?wsdl",
  RecepcaoEvento:      "https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4?wsdl",
};
const MG: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
  NFeRetAutorizacao:   "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
  NfeStatusServico:    "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
  NfeInutilizacao:     "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4",
  NfeConsultaProtocolo:"https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
  NfeConsultaCadastro: "https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4",
  RecepcaoEvento:      "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
};
const MS: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
  NFeRetAutorizacao:   "https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
  NfeStatusServico:    "https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4",
  NfeInutilizacao:     "https://nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4",
  NfeConsultaProtocolo:"https://nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4",
  NfeConsultaCadastro: "https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4",
  RecepcaoEvento:      "https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4",
};
const MT: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4?wsdl",
  NFeRetAutorizacao:   "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4?wsdl",
  NfeStatusServico:    "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4?wsdl",
  NfeInutilizacao:     "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4?wsdl",
  NfeConsultaProtocolo:"https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4?wsdl",
  NfeConsultaCadastro: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4?wsdl",
  RecepcaoEvento:      "https://nfe.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4?wsdl",
};
const PE: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
  NFeRetAutorizacao:   "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
  NfeStatusServico:    "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4",
  NfeInutilizacao:     "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4",
  NfeConsultaProtocolo:"https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4",
  NfeConsultaCadastro: "https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4?wsdl",
  RecepcaoEvento:      "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4",
};
const PR: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl",
  NFeRetAutorizacao:   "https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4?wsdl",
  NfeStatusServico:    "https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4?wsdl",
  NfeInutilizacao:     "https://nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4?wsdl",
  NfeConsultaProtocolo:"https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4?wsdl",
  NfeConsultaCadastro: "https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4?wsdl",
  RecepcaoEvento:      "https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4?wsdl",
};
const RS: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  NFeRetAutorizacao:   "https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  NfeStatusServico:    "https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  NfeInutilizacao:     "https://nfe.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  NfeConsultaProtocolo:"https://nfe.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  NfeConsultaCadastro: "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
  RecepcaoEvento:      "https://nfe.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};
const SP: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
  NFeRetAutorizacao:   "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
  NfeStatusServico:    "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  NfeInutilizacao:     "https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx",
  NfeConsultaProtocolo:"https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
  NfeConsultaCadastro: "https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx",
  RecepcaoEvento:      "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
};

// SVAN — Sefaz Virtual Ambiente Nacional (MA)
const SVAN: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  NFeRetAutorizacao:   "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  NfeStatusServico:    "https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx",
  NfeInutilizacao:     "https://www.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx",
  NfeConsultaProtocolo:"https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  NfeConsultaCadastro: "— (não disponível na SVAN)",
  RecepcaoEvento:      "https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

// SVRS — Sefaz Virtual Rio Grande do Sul
const SVRS: Record<SefazServico, string> = {
  NFeAutorizacao:      "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  NFeRetAutorizacao:   "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  NfeStatusServico:    "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  NfeInutilizacao:     "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  NfeConsultaProtocolo:"https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  NfeConsultaCadastro: "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
  RecepcaoEvento:      "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};

// Mapa UF → endpoints + nome do autorizador
export type UfCode = string;

export interface SefazInfo {
  autorizador: string;
  endpoints: Record<SefazServico, string>;
}

export const SEFAZ_BY_UF: Record<UfCode, SefazInfo> = {
  AC: { autorizador: "SVRS",  endpoints: SVRS },
  AL: { autorizador: "SVRS",  endpoints: SVRS },
  AM: { autorizador: "SEFAZ-AM", endpoints: AM },
  AP: { autorizador: "SVRS",  endpoints: SVRS },
  BA: { autorizador: "SEFAZ-BA", endpoints: BA },
  CE: { autorizador: "SVRS",  endpoints: SVRS },
  DF: { autorizador: "SVRS",  endpoints: SVRS },
  ES: { autorizador: "SVRS",  endpoints: SVRS },
  GO: { autorizador: "SEFAZ-GO", endpoints: GO },
  MA: { autorizador: "SVAN",  endpoints: SVAN },
  MG: { autorizador: "SEFAZ-MG", endpoints: MG },
  MS: { autorizador: "SEFAZ-MS", endpoints: MS },
  MT: { autorizador: "SEFAZ-MT", endpoints: MT },
  PA: { autorizador: "SVRS",  endpoints: SVRS },
  PB: { autorizador: "SVRS",  endpoints: SVRS },
  PE: { autorizador: "SEFAZ-PE", endpoints: PE },
  PI: { autorizador: "SVRS",  endpoints: SVRS },
  PR: { autorizador: "SEFAZ-PR", endpoints: PR },
  RJ: { autorizador: "SVRS",  endpoints: SVRS },
  RN: { autorizador: "SVRS",  endpoints: SVRS },
  RO: { autorizador: "SVRS",  endpoints: SVRS },
  RR: { autorizador: "SVRS",  endpoints: SVRS },
  RS: { autorizador: "SEFAZ-RS", endpoints: RS },
  SC: { autorizador: "SVRS",  endpoints: SVRS },
  SE: { autorizador: "SVRS",  endpoints: SVRS },
  SP: { autorizador: "SEFAZ-SP", endpoints: SP },
  TO: { autorizador: "SVRS",  endpoints: SVRS },
};

export const UF_NAMES: Record<UfCode, string> = {
  AC:"Acre", AL:"Alagoas", AM:"Amazonas", AP:"Amapá", BA:"Bahia",
  CE:"Ceará", DF:"Distrito Federal", ES:"Espírito Santo", GO:"Goiás",
  MA:"Maranhão", MG:"Minas Gerais", MS:"Mato Grosso do Sul",
  MT:"Mato Grosso", PA:"Pará", PB:"Paraíba", PE:"Pernambuco",
  PI:"Piauí", PR:"Paraná", RJ:"Rio de Janeiro", RN:"Rio Grande do Norte",
  RO:"Rondônia", RR:"Roraima", RS:"Rio Grande do Sul", SC:"Santa Catarina",
  SE:"Sergipe", SP:"São Paulo", TO:"Tocantins",
};
