import { describe, expect, it } from "vitest";
import {
  AI_OPERATION_BOUNDS,
  ECONOMIC_ASSUMPTIONS,
  INSTITUTIONAL_STARTER,
  PAID_TIERS,
  PLAN_CATALOG,
  PLAN_ECONOMICS,
  SERVICE_AI_BUDGETS,
  STORE_PRODUCTS,
} from "@workspace/plan-economics";

describe("commercial plans remain safe at maximum permitted usage", () => {
  it("defines monthly and annual prices for every paid plan", () => {
    for (const tier of PAID_TIERS) {
      expect(PLAN_CATALOG[tier].price, tier).not.toBeNull();
    }
  });

  it("keeps self-serve monthly and annual worst-case margin at target", () => {
    for (const tier of PAID_TIERS) {
      const result = PLAN_ECONOMICS[tier];
      expect(result.stressMonthlyCostUsd, tier).toBeGreaterThan(0);
      expect(result.monthlyGrossMargin, tier).toBeGreaterThanOrEqual(
        ECONOMIC_ASSUMPTIONS.targetGrossMargin,
      );
      expect(result.annualGrossMargin, tier).toBeGreaterThanOrEqual(
        ECONOMIC_ASSUMPTIONS.targetGrossMargin,
      );
    }
  });

  it("uses a deliberate 8–12% annual discount, not two free months", () => {
    for (const tier of PAID_TIERS.filter((candidate) => candidate !== "institutional")) {
      const discount = PLAN_ECONOMICS[tier].annualDiscountPercent;
      expect(discount, tier).toBeGreaterThanOrEqual(0.08);
      expect(discount, tier).toBeLessThanOrEqual(0.12);
    }
  });

  it("hard-bounds every paid AI operation", () => {
    for (const bounds of Object.values(AI_OPERATION_BOUNDS)) {
      expect(bounds.model).toMatch(/^gpt-/);
      expect(bounds.maxPromptCharacters).toBeGreaterThan(0);
      expect(bounds.maxBillableInputTokens).toBe(400_000);
      expect(bounds.maxOutputTokens).toBeGreaterThan(0);
      expect(bounds.maxToolCalls).toBe(1);
      expect(bounds.timeoutMs).toBeLessThanOrEqual(60_000);
      expect(bounds.concurrentPerUser).toBe(1);
    }
    for (const limit of Object.values(SERVICE_AI_BUDGETS)) {
      expect(limit).toBeGreaterThan(0);
    }
    for (const plan of Object.values(PLAN_CATALOG)) {
      expect(plan.ai.searchPerMonth).toBeGreaterThan(0);
      expect(plan.ai.deepPerMonth).toBeGreaterThan(0);
      expect(plan.storageBytes).toBeGreaterThan(0);
    }
  });

  it("bounds the starter school contract with one shared pool", () => {
    expect(INSTITUTIONAL_STARTER.includedSeats).toBe(30);
    expect(INSTITUTIONAL_STARTER.seatMonthlyUsdRange).toEqual({
      minimum: 2.5,
      maximum: 3,
    });
    expect(INSTITUTIONAL_STARTER.searchPerMonth).toBeLessThan(3000);
    expect(INSTITUTIONAL_STARTER.deepPerMonth).toBeLessThan(1000);
    expect(PLAN_ECONOMICS.institutional.annualGrossMargin).toBeGreaterThanOrEqual(
      ECONOMIC_ASSUMPTIONS.targetGrossMargin,
    );
  });

  it("has explicit product ids for every self-serve tier", () => {
    expect(Object.keys(STORE_PRODUCTS).sort()).toEqual(
      PAID_TIERS.filter((tier) => tier !== "institutional").sort(),
    );
    expect(STORE_PRODUCTS).toEqual({
      plus: {
        monthly: "casparel_plus_monthly",
        annual: "casparel_plus_yearly",
      },
      pro: {
        monthly: "casparel_pro_monthly",
        annual: "casparel_pro_yearly",
      },
    });
  });
});
