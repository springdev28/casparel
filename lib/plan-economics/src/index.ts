/**
 * Canonical commercial limits and pricing for Casparel.
 *
 * This package is deliberately runtime-neutral so the API, web app, and
 * native app all consume the same values. Provider prices and the arithmetic
 * live here as well: changing a paid quota or a provider assumption therefore
 * changes the CI margin calculation in the same commit.
 */

export type SubscriptionTier =
  | "free"
  | "plus"
  | "pro"
  | "institutional";

export type SelfServePaidTier = Exclude<SubscriptionTier, "free" | "institutional">;
export type PlanCapacity =
  | "classes-owned"
  | "class-members"
  | "study-activities"
  | "resource-lists"
  | "learning-goals"
  | "canvases";

export type CapacityLimits = Record<PlanCapacity, number>;

export interface AiLimits {
  searchPerDay: number;
  searchPerMonth: number;
  deepPerDay: number;
  deepPerMonth: number;
}

export interface PlanPrice {
  monthlyUsd: number;
  annualUsd: number;
}

export interface CommercialPlan {
  label: string;
  ai: AiLimits;
  storageBytes: number;
  capacity: CapacityLimits;
  price: PlanPrice | null;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export const PLAN_CATALOG: Record<SubscriptionTier, CommercialPlan> = {
  free: {
    label: "Free",
    ai: { searchPerDay: 1, searchPerMonth: 3, deepPerDay: 1, deepPerMonth: 1 },
    storageBytes: 100 * MIB,
    capacity: { "classes-owned": 1, "class-members": 30, "study-activities": 25, "resource-lists": 5, "learning-goals": 10, canvases: 3 },
    price: null,
  },
  plus: {
    label: "Plus",
    ai: { searchPerDay: 3, searchPerMonth: 15, deepPerDay: 1, deepPerMonth: 3 },
    storageBytes: 1 * GIB,
    capacity: { "classes-owned": 5, "class-members": 100, "study-activities": 250, "resource-lists": 50, "learning-goals": 100, canvases: 30 },
    price: { monthlyUsd: 9.99, annualUsd: 107.99 },
  },
  pro: {
    label: "Pro",
    ai: { searchPerDay: 6, searchPerMonth: 29, deepPerDay: 2, deepPerMonth: 10 },
    storageBytes: 2 * GIB,
    capacity: { "classes-owned": 20, "class-members": 300, "study-activities": 1000, "resource-lists": 200, "learning-goals": 400, canvases: 100 },
    price: { monthlyUsd: 19.99, annualUsd: 215.99 },
  },
  institutional: {
    label: "Institutional",
    // Per-seat fairness guards. The contract-level pool below is the binding
    // financial ceiling across all licensed seats.
    ai: { searchPerDay: 3, searchPerMonth: 20, deepPerDay: 1, deepPerMonth: 5 },
    storageBytes: 10 * GIB,
    capacity: { "classes-owned": 50, "class-members": 500, "study-activities": 2500, "resource-lists": 500, "learning-goals": 800, canvases: 250 },
    // Internal revenue floor for the margin test: 30 seats at the bottom of
    // the public $2.50–$3.00 range. This is not a public quote or fixed price.
    price: { monthlyUsd: 75, annualUsd: 900 },
  },
};

/** One manually provisioned starter contract, shared by up to 30 active seats. */
export const INSTITUTIONAL_STARTER = {
  includedSeats: 30,
  searchPerDay: 25,
  searchPerMonth: 250,
  deepPerDay: 6,
  deepPerMonth: 55,
  storageBytes: 10 * GIB,
  seatMonthlyUsdRange: { minimum: 2.5, maximum: 3 },
} as const;

/** Default emergency ceilings across every non-admin account on the service. */
export const SERVICE_AI_BUDGETS = {
  discoveryPerDay: 200,
  discoveryPerMonth: 3_000,
  deepPerDay: 100,
  deepPerMonth: 1_000,
} as const;

/** Hard request ceilings used both by request builders and the cost model. */
export const AI_OPERATION_BOUNDS = {
  discovery: {
    model: "gpt-5-nano",
    maxPromptCharacters: 8_000,
    // The API has no max-input-tokens switch. Price the model's entire context
    // window so a large billed search context cannot break the plan margin.
    maxBillableInputTokens: 400_000,
    maxOutputTokens: 3_200,
    maxToolCalls: 1,
    searchContextSize: "low",
    reasoningEffort: "low",
    timeoutMs: 30_000,
    concurrentPerUser: 1,
  },
  deepResearch: {
    model: "gpt-5-mini",
    maxPromptCharacters: 16_000,
    maxBillableInputTokens: 400_000,
    maxOutputTokens: 4_500,
    maxToolCalls: 1,
    searchContextSize: "medium",
    reasoningEffort: "medium",
    timeoutMs: 60_000,
    concurrentPerUser: 1,
  },
} as const;

/** Update only this block when provider or channel pricing changes. */
export const ECONOMIC_ASSUMPTIONS = {
  gpt5MiniInputUsdPerMillion: 0.25,
  gpt5MiniOutputUsdPerMillion: 2,
  gpt5NanoInputUsdPerMillion: 0.05,
  gpt5NanoOutputUsdPerMillion: 0.4,
  webSearchUsdPerCall: 0.01,
  storageUsdPerGibMonth: 0.25,
  otherVariableUsdPerAccountMonth: 0.05,
  institutionalOtherVariableUsdPerMonth: 0.5,
  playStoreRevenueShare: 0.15,
  revenueCatRevenueShare: 0.01,
  invoicePaymentShare: 0.03,
  targetGrossMargin: 0.7,
  safetyMultiplier: 1.2,
} as const;

export function usd(value: number): number {
  return Number(value.toFixed(4));
}

export function discoveryRawCostUsd(): number {
  const b = AI_OPERATION_BOUNDS.discovery;
  const a = ECONOMIC_ASSUMPTIONS;
  return usd(
    (b.maxBillableInputTokens / 1_000_000) * a.gpt5NanoInputUsdPerMillion +
      (b.maxOutputTokens / 1_000_000) * a.gpt5NanoOutputUsdPerMillion +
      b.maxToolCalls * a.webSearchUsdPerCall,
  );
}

export function deepResearchRawCostUsd(): number {
  const b = AI_OPERATION_BOUNDS.deepResearch;
  const a = ECONOMIC_ASSUMPTIONS;
  return usd(
    (b.maxBillableInputTokens / 1_000_000) * a.gpt5MiniInputUsdPerMillion +
      (b.maxOutputTokens / 1_000_000) * a.gpt5MiniOutputUsdPerMillion +
      b.maxToolCalls * a.webSearchUsdPerCall,
  );
}

export interface PlanEconomics {
  tier: SubscriptionTier;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  annualDiscountPercent: number;
  rawMonthlyCostUsd: number;
  stressMonthlyCostUsd: number;
  netMonthlyRevenueUsd: number;
  monthlyGrossMargin: number;
  annualGrossMargin: number;
  minimumMonthlyPriceAtTargetMarginUsd: number;
  minimumMonthlyPriceUsd: { margin50: number; margin60: number; margin70: number };
}

export function economicsForTier(tier: Exclude<SubscriptionTier, "free">): PlanEconomics {
  const plan = PLAN_CATALOG[tier];
  if (!plan.price) throw new Error(`${tier} has no commercial price`);
  const a = ECONOMIC_ASSUMPTIONS;
  const institutional = tier === "institutional";
  const searchLimit = institutional ? INSTITUTIONAL_STARTER.searchPerMonth : plan.ai.searchPerMonth;
  const deepLimit = institutional ? INSTITUTIONAL_STARTER.deepPerMonth : plan.ai.deepPerMonth;
  const storageBytes = institutional ? INSTITUTIONAL_STARTER.storageBytes : plan.storageBytes;
  const other = institutional
    ? a.institutionalOtherVariableUsdPerMonth
    : a.otherVariableUsdPerAccountMonth;
  const raw =
    searchLimit * discoveryRawCostUsd() +
    deepLimit * deepResearchRawCostUsd() +
    (storageBytes / GIB) * a.storageUsdPerGibMonth +
    other;
  const stress = raw * a.safetyMultiplier;
  const fee = institutional
    ? a.invoicePaymentShare
    : a.playStoreRevenueShare + a.revenueCatRevenueShare;
  const netMonthly = plan.price.monthlyUsd * (1 - fee);
  const annualNet = plan.price.annualUsd * (1 - fee);
  const annualStress = stress * 12;
  const minimumPrice = (margin: number) => usd(stress / ((1 - fee) * (1 - margin)));
  return {
    tier,
    monthlyPriceUsd: plan.price.monthlyUsd,
    annualPriceUsd: plan.price.annualUsd,
    annualDiscountPercent: usd(1 - plan.price.annualUsd / (plan.price.monthlyUsd * 12)),
    rawMonthlyCostUsd: usd(raw),
    stressMonthlyCostUsd: usd(stress),
    netMonthlyRevenueUsd: usd(netMonthly),
    monthlyGrossMargin: usd((netMonthly - stress) / netMonthly),
    annualGrossMargin: usd((annualNet - annualStress) / annualNet),
    minimumMonthlyPriceAtTargetMarginUsd: minimumPrice(a.targetGrossMargin),
    minimumMonthlyPriceUsd: {
      margin50: minimumPrice(0.5),
      margin60: minimumPrice(0.6),
      margin70: minimumPrice(0.7),
    },
  };
}

export const PAID_TIERS: ReadonlyArray<Exclude<SubscriptionTier, "free">> = [
  "plus",
  "pro",
  "institutional",
];

/** Exact store product ids configured in RevenueCat's `default` offering. */
export const STORE_PRODUCTS: Record<SelfServePaidTier, { monthly: string; annual: string }> = {
  plus: { monthly: "casparel_plus_monthly", annual: "casparel_plus_yearly" },
  pro: { monthly: "casparel_pro_monthly", annual: "casparel_pro_yearly" },
};

export function tierForStoreProductId(productId: string): SelfServePaidTier | null {
  const normalized = productId.trim().toLowerCase();
  for (const [tier, products] of Object.entries(STORE_PRODUCTS) as Array<
    [SelfServePaidTier, { monthly: string; annual: string }]
  >) {
    if (normalized === products.monthly || normalized === products.annual) return tier;
  }
  return null;
}

export const PLAN_ECONOMICS = Object.fromEntries(
  PAID_TIERS.map((tier) => [tier, economicsForTier(tier)]),
) as Record<Exclude<SubscriptionTier, "free">, PlanEconomics>;

export function formatUsd(value: number): string {
  return `US$${value.toFixed(2)}`;
}

export function formatStorage(bytes: number): string {
  if (bytes >= GIB) return `${bytes / GIB} GB`;
  return `${Math.round(bytes / MIB)} MB`;
}
