/**
 * @fileOverview Verification role: exercises Beta Ledger.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  addLedgerResult,
  createLedger,
  renderLedgerMarkdown,
  resolveBetaConfig,
} from "./beta-ledger.mjs";

describe("beta suite safety", () => {
  it("requires an explicit target", () => {
    expect(() => resolveBetaConfig({})).toThrow(/BETA_BASE_URL is required/);
  });

  it.each(["https://casparel.com", "https://www.casparel.com/"])(
    "always rejects production target %s",
    (url) => {
      expect(() =>
        resolveBetaConfig({
          BETA_BASE_URL: url,
          BETA_ALLOW_STAGING_RUN: "true",
        }),
      ).toThrow(/Refusing.*production/);
    },
  );

  it("requires an explicit opt-in for a remote staging target", () => {
    expect(() =>
      resolveBetaConfig({ BETA_BASE_URL: "https://beta.example.test" }),
    ).toThrow(/BETA_ALLOW_STAGING_RUN=true/);
  });

  it("allows localhost without a remote-run opt-in", () => {
    const config = resolveBetaConfig({
      BETA_BASE_URL: "http://127.0.0.1:23863/",
      BETA_RUN_ID: "safe-local-run",
    });
    expect(config.baseUrl).toBe("http://127.0.0.1:23863");
    expect(config.environment).toBe("local");
    expect(config.runId).toBe("safe-local-run");
  });

  it("allows an explicitly confirmed remote staging target", () => {
    const config = resolveBetaConfig({
      BETA_BASE_URL: "https://beta.example.test/",
      BETA_ALLOW_STAGING_RUN: "yes",
      BETA_ENVIRONMENT: "preview",
      BETA_RUN_ID: "confirmed-stage-run",
    });
    expect(config.environment).toBe("preview");
    expect(config.baseUrl).toBe("https://beta.example.test");
  });
});

describe("beta ledger", () => {
  it("enforces the audit vocabulary and renders readable output", () => {
    const config = resolveBetaConfig({
      BETA_BASE_URL: "http://localhost:23863",
      BETA_RUN_ID: "ledger-run",
    });
    const ledger = createLedger({ config, commit: "abc1234" });
    addLedgerResult(ledger, {
      id: "AUTH-001",
      persona: "fresh learner",
      status: "PASS",
      durationMs: 42,
      detail: "registered through UI",
      evidence: [],
    });
    expect(() =>
      addLedgerResult(ledger, {
        id: "BAD",
        persona: "none",
        status: "looks fine",
        durationMs: 0,
        detail: "",
        evidence: [],
      }),
    ).toThrow(/Invalid beta status/);
    expect(renderLedgerMarkdown(ledger)).toContain(
      "| AUTH-001 | fresh learner | PASS | 42 | registered through UI |",
    );
  });
});
