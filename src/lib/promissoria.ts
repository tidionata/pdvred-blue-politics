export interface PromissoriaInstallment {
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: "pending" | "paid";
  paidAt?: string;
  paymentMethod?: string;
}

export interface Promissoria {
  id: string;
  storeId?: string;
  saleId?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerDocument?: string; // CPF / RG
  totalAmount: number;
  plan: "30" | "30_60" | "30_60_90" | "pulo_mes";
  installmentsCount: number;
  installments: PromissoriaInstallment[];
  status: "pending" | "partially_paid" | "paid" | "cancelled";
  createdAt: string;
  notes?: string;
}

export interface PromissoriaConfig {
  enabled: boolean;
  allowedPlans: Array<"30" | "30_60" | "30_60_90" | "pulo_mes">;
  defaultPlan?: string;
  requireDocument?: boolean;
}

const STORAGE_CONFIG_KEY = "pdv_promissoria_config";
const STORAGE_DATA_KEY = "pdv_promissorias_list";

export const DEFAULT_PROMISSORIA_CONFIG: PromissoriaConfig = {
  enabled: false,
  allowedPlans: ["30", "30_60", "30_60_90", "pulo_mes"],
  defaultPlan: "30",
  requireDocument: false,
};

export function getPromissoriaConfig(storeId?: string): PromissoriaConfig {
  try {
    const key = storeId ? `${STORAGE_CONFIG_KEY}_${storeId}` : STORAGE_CONFIG_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return DEFAULT_PROMISSORIA_CONFIG;
    return { ...DEFAULT_PROMISSORIA_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_PROMISSORIA_CONFIG;
  }
}

export function savePromissoriaConfig(config: PromissoriaConfig, storeId?: string): void {
  const key = storeId ? `${STORAGE_CONFIG_KEY}_${storeId}` : STORAGE_CONFIG_KEY;
  localStorage.setItem(key, JSON.stringify(config));
  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
}

export function calculateInstallments(
  total: number,
  plan: "30" | "30_60" | "30_60_90" | "pulo_mes",
  baseDate: Date = new Date()
): PromissoriaInstallment[] {
  const installments: PromissoriaInstallment[] = [];

  if (plan === "30") {
    const due = new Date(baseDate);
    due.setDate(due.getDate() + 30);
    installments.push({
      installmentNumber: 1,
      dueDate: due.toISOString().slice(0, 10),
      amount: total,
      status: "pending",
    });
  } else if (plan === "30_60") {
    const part = Number((total / 2).toFixed(2));
    const remainder = Number((total - part).toFixed(2));

    const due1 = new Date(baseDate);
    due1.setDate(due1.getDate() + 30);

    const due2 = new Date(baseDate);
    due2.setDate(due2.getDate() + 60);

    installments.push(
      { installmentNumber: 1, dueDate: due1.toISOString().slice(0, 10), amount: part, status: "pending" },
      { installmentNumber: 2, dueDate: due2.toISOString().slice(0, 10), amount: remainder, status: "pending" }
    );
  } else if (plan === "30_60_90") {
    const part = Number((total / 3).toFixed(2));
    const remainder = Number((total - part * 2).toFixed(2));

    const due1 = new Date(baseDate);
    due1.setDate(due1.getDate() + 30);

    const due2 = new Date(baseDate);
    due2.setDate(due2.getDate() + 60);

    const due3 = new Date(baseDate);
    due3.setDate(due3.getDate() + 90);

    installments.push(
      { installmentNumber: 1, dueDate: due1.toISOString().slice(0, 10), amount: part, status: "pending" },
      { installmentNumber: 2, dueDate: due2.toISOString().slice(0, 10), amount: part, status: "pending" },
      { installmentNumber: 3, dueDate: due3.toISOString().slice(0, 10), amount: remainder, status: "pending" }
    );
  } else if (plan === "pulo_mes") {
    const due = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 10);
    if (due.getTime() <= baseDate.getTime()) {
      due.setMonth(due.getMonth() + 1);
    }
    installments.push({
      installmentNumber: 1,
      dueDate: due.toISOString().slice(0, 10),
      amount: total,
      status: "pending",
    });
  }

  return installments;
}

export function getAllPromissorias(storeId?: string): Promissoria[] {
  try {
    const raw = localStorage.getItem(STORAGE_DATA_KEY);
    const list: Promissoria[] = raw ? JSON.parse(raw) : [];
    if (!storeId) return list;
    return list.filter((p) => !p.storeId || p.storeId === storeId);
  } catch (e) {
    return [];
  }
}

export function createPromissoria(promissoria: Omit<Promissoria, "id" | "createdAt" | "status">): Promissoria {
  const list = getAllPromissorias();
  const newRecord: Promissoria = {
    ...promissoria,
    id: `prom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  list.unshift(newRecord);
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(list));
  return newRecord;
}

export function payInstallment(
  promissoriaId: string,
  installmentNumber: number,
  paymentMethod: string = "dinheiro"
): Promissoria | null {
  const list = getAllPromissorias();
  const idx = list.findIndex((p) => p.id === promissoriaId);
  if (idx === -1) return null;

  const prom = list[idx];
  let hasPending = false;
  let allPaid = true;

  prom.installments = prom.installments.map((inst) => {
    if (inst.installmentNumber === installmentNumber) {
      return {
        ...inst,
        status: "paid",
        paidAt: new Date().toISOString(),
        paymentMethod,
      };
    }
    if (inst.status === "pending") {
      hasPending = true;
      allPaid = false;
    }
    return inst;
  });

  if (allPaid) {
    prom.status = "paid";
  } else if (hasPending) {
    prom.status = "partially_paid";
  }

  list[idx] = prom;
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(list));
  return prom;
}

export function cancelPromissoria(promissoriaId: string): boolean {
  const list = getAllPromissorias();
  const idx = list.findIndex((p) => p.id === promissoriaId);
  if (idx === -1) return false;
  list[idx].status = "cancelled";
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(list));
  return true;
}
