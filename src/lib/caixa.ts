export interface CaixaMovement {
  id: string;
  type: "suprimento" | "sangria";
  amount: number;
  reason: string;
  operatorName: string;
  createdAt: string;
}

export interface CaixaPaymentSummary {
  cash: number;
  pix: number;
  credit: number;
  debit: number;
  promissoria: number;
  other: number;
  totalSales: number;
  totalTransactions: number;
}

export interface CaixaSession {
  id: string;
  storeId?: string;
  openedAt: string;
  openedBy: string;
  initialAmount: number; // Fundo de troco inicial
  status: "open" | "closed";
  closedAt?: string;
  closedBy?: string;
  movements: CaixaMovement[];
  // Totais computados no fechamento ou em tempo real
  salesSummary: CaixaPaymentSummary;
  expectedCashInDrawer: number; // initialAmount + cashSales + suprimentos - sangrias + promissoriaCashPayments
  actualCashInDrawer?: number; // Contado pelo operador no fechamento
  difference?: number; // actual - expected (sobra positivo, falta negativo)
  notes?: string;
}

const STORAGE_ACTIVE_PREFIX = "pdv_caixa_active";
const STORAGE_HISTORY_PREFIX = "pdv_caixa_history";

function getActiveKey(storeId?: string): string {
  return storeId ? `${STORAGE_ACTIVE_PREFIX}_${storeId}` : STORAGE_ACTIVE_PREFIX;
}

function getHistoryKey(storeId?: string): string {
  return storeId ? `${STORAGE_HISTORY_PREFIX}_${storeId}` : STORAGE_HISTORY_PREFIX;
}

/**
 * Retorna o caixa atualmente aberto para a loja (ou null se estiver fechado)
 */
export function getActiveCaixa(storeId?: string): CaixaSession | null {
  try {
    const raw = localStorage.getItem(getActiveKey(storeId));
    if (!raw) return null;
    const session: CaixaSession = JSON.parse(raw);
    if (session.status === "open") return session;
    return null;
  } catch (e) {
    console.error("Erro ao carregar caixa ativo:", e);
    return null;
  }
}

/**
 * Abre um novo caixa
 */
export function openCaixa(storeId: string | undefined, openedBy: string, initialAmount: number): CaixaSession {
  const newSession: CaixaSession = {
    id: `cx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    storeId,
    openedAt: new Date().toISOString(),
    openedBy: openedBy || "Operador",
    initialAmount: Math.max(0, initialAmount || 0),
    status: "open",
    movements: [],
    salesSummary: {
      cash: 0,
      pix: 0,
      credit: 0,
      debit: 0,
      promissoria: 0,
      other: 0,
      totalSales: 0,
      totalTransactions: 0,
    },
    expectedCashInDrawer: Math.max(0, initialAmount || 0),
  };

  localStorage.setItem(getActiveKey(storeId), JSON.stringify(newSession));
  return newSession;
}

/**
 * Adiciona uma movimentação manual (Sangria ou Suprimento)
 */
export function addCaixaMovement(
  storeId: string | undefined,
  type: "suprimento" | "sangria",
  amount: number,
  reason: string,
  operatorName: string
): CaixaSession {
  const active = getActiveCaixa(storeId);
  if (!active) {
    throw new Error("Não há nenhum caixa aberto para registrar movimentação.");
  }

  const mov: CaixaMovement = {
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    amount: Math.abs(amount),
    reason: reason || (type === "suprimento" ? "Entrada de Troco" : "Sangria"),
    operatorName: operatorName || active.openedBy,
    createdAt: new Date().toISOString(),
  };

  active.movements.push(mov);
  
  if (type === "suprimento") {
    active.expectedCashInDrawer += mov.amount;
  } else {
    active.expectedCashInDrawer -= mov.amount;
  }

  localStorage.setItem(getActiveKey(storeId), JSON.stringify(active));
  return active;
}

/**
 * Registra uma venda no resumo do caixa aberto
 */
export function recordSaleInCaixa(
  storeId: string | undefined,
  paymentMethod: string,
  amount: number
): CaixaSession | null {
  const active = getActiveCaixa(storeId);
  if (!active) return null;

  const normalizedMethod = paymentMethod.toLowerCase();
  
  if (normalizedMethod === "cash" || normalizedMethod === "dinheiro") {
    active.salesSummary.cash += amount;
    active.expectedCashInDrawer += amount;
  } else if (normalizedMethod === "pix") {
    active.salesSummary.pix += amount;
  } else if (normalizedMethod === "credit" || normalizedMethod === "credito" || normalizedMethod === "cartao_credito") {
    active.salesSummary.credit += amount;
  } else if (normalizedMethod === "debit" || normalizedMethod === "debito" || normalizedMethod === "cartao_debito") {
    active.salesSummary.debit += amount;
  } else if (normalizedMethod === "promissoria") {
    // Promissória não entra no dinheiro físico de hoje
    active.salesSummary.promissoria += amount;
  } else {
    active.salesSummary.other += amount;
  }

  active.salesSummary.totalSales += amount;
  active.salesSummary.totalTransactions += 1;

  localStorage.setItem(getActiveKey(storeId), JSON.stringify(active));
  return active;
}

/**
 * Registra o recebimento/quitação de uma promissória
 */
export function recordPromissoriaPaymentInCaixa(
  storeId: string | undefined,
  paymentMethod: string,
  amount: number,
  customerName: string
): CaixaSession | null {
  const active = getActiveCaixa(storeId);
  if (!active) return null;

  const normalizedMethod = paymentMethod.toLowerCase();
  
  // Se foi paga em dinheiro, entra no dinheiro físico da gaveta como recebimento
  if (normalizedMethod === "cash" || normalizedMethod === "dinheiro") {
    const mov: CaixaMovement = {
      id: `mov-prom-${Date.now()}`,
      type: "suprimento",
      amount,
      reason: `Recebimento Promissória (${customerName})`,
      operatorName: active.openedBy,
      createdAt: new Date().toISOString(),
    };
    active.movements.push(mov);
    active.expectedCashInDrawer += amount;
  }

  localStorage.setItem(getActiveKey(storeId), JSON.stringify(active));
  return active;
}

/**
 * Fecha o caixa atual e o move para o histórico
 */
export function closeCaixa(
  storeId: string | undefined,
  closedBy: string,
  actualCashAmount: number,
  notes?: string
): CaixaSession {
  const active = getActiveCaixa(storeId);
  if (!active) {
    throw new Error("Não há nenhum caixa aberto para fechar.");
  }

  const expected = active.expectedCashInDrawer;
  const actual = Math.max(0, actualCashAmount || 0);
  const diff = actual - expected;

  const closedSession: CaixaSession = {
    ...active,
    status: "closed",
    closedAt: new Date().toISOString(),
    closedBy: closedBy || active.openedBy,
    actualCashInDrawer: actual,
    difference: diff,
    notes: notes || "",
  };

  // Remove do ativo
  localStorage.removeItem(getActiveKey(storeId));

  // Salva no histórico
  const history = getCaixaHistory(storeId);
  history.unshift(closedSession);
  localStorage.setItem(getHistoryKey(storeId), JSON.stringify(history));

  return closedSession;
}

/**
 * Retorna o histórico de caixas anteriores fechados
 */
export function getCaixaHistory(storeId?: string): CaixaSession[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(storeId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Erro ao carregar histórico de caixas:", e);
    return [];
  }
}
