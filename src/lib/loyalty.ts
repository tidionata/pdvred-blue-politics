export interface LoyaltyPromoConfig {
  enabled: boolean;
  name: string;
  mode: "auto" | "manual";
  targetPurchases: number;
  minPurchaseValue: number;
  rewardType: "gift" | "fixed_discount" | "percent_discount";
  rewardValue: number;
  rewardDescription: string;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyPromoConfig = {
  enabled: true,
  name: "Fidelidade 10 Compras",
  mode: "auto",
  targetPurchases: 10,
  minPurchaseValue: 0,
  rewardType: "fixed_discount",
  rewardValue: 10,
  rewardDescription: "R$ 10 de Desconto",
};

export function getLoyaltyPromoConfig(storeId?: string): LoyaltyPromoConfig {
  try {
    const key = storeId ? pdv_loyalty_promo_config_ : "pdv_loyalty_promo_config";
    const raw = localStorage.getItem(key) || localStorage.getItem("pdv_loyalty_promo_config");
    if (!raw) return DEFAULT_LOYALTY_CONFIG;
    return { ...DEFAULT_LOYALTY_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LOYALTY_CONFIG;
  }
}

export function saveLoyaltyPromoConfig(config: LoyaltyPromoConfig, storeId?: string) {
  try {
    const key = storeId ? pdv_loyalty_promo_config_ : "pdv_loyalty_promo_config";
    localStorage.setItem(key, JSON.stringify(config));
    localStorage.setItem("pdv_loyalty_promo_config", JSON.stringify(config));
  } catch (e) {
    console.error("Erro ao salvar fidelidade:", e);
  }
}

export function getCustomerPurchasesCount(customerId?: string, phone?: string): number {
  if (!customerId && !phone) return 0;
  try {
    const key = customerId ? loyalty_stamps_cust_ : loyalty_stamps_phone_;
    const val = localStorage.getItem(key);
    if (val !== null) return parseInt(val, 10) || 0;
    return 0;
  } catch {
    return 0;
  }
}

export function setCustomerPurchasesCount(customerId?: string, phone?: string, count: number = 0) {
  if (!customerId && !phone) return;
  try {
    if (customerId) {
      localStorage.setItem(loyalty_stamps_cust_, String(Math.max(0, count)));
    }
    if (phone) {
      const clean = phone.replace(/\D/g, "");
      if (clean) localStorage.setItem(loyalty_stamps_phone_, String(Math.max(0, count)));
    }
  } catch (e) {
    console.error("Erro ao salvar selos de fidelidade:", e);
  }
}

export function addCustomerPurchaseStamp(customerId?: string, phone?: string, amount: number = 0, config?: LoyaltyPromoConfig): { newCount: number; wonReward: boolean } {
  const currentConfig = config || getLoyaltyPromoConfig();
  if (!currentConfig.enabled) return { newCount: 0, wonReward: false };
  if (currentConfig.minPurchaseValue > 0 && amount < currentConfig.minPurchaseValue) {
    return { newCount: getCustomerPurchasesCount(customerId, phone), wonReward: false };
  }

  const currentCount = getCustomerPurchasesCount(customerId, phone);
  const nextCount = currentCount + 1;
  const target = Math.max(1, currentConfig.targetPurchases || 10);
  
  const wonReward = nextCount >= target;
  const finalCount = wonReward ? nextCount % target : nextCount;

  setCustomerPurchasesCount(customerId, phone, finalCount);
  return { newCount: finalCount, wonReward };
}
