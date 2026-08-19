/**
 * A paying customer is not told their deep research is spent when it is not.
 *
 * Deep research is enforced by two counters -- `deepPerDay` over 24 hours and
 * `deepPerMonth` over a rolling 30 days -- and a request must clear both.
 * `/users/me/usage` reported the larger of the two counters against the
 * *daily* limit, and both clients read "used >= limit" as "spent".
 *
 * On Student Plus, 8 a day and 80 a month: one full day of use leaves the
 * monthly counter at 8. Next morning the daily counter is 0 and eight reports
 * are genuinely available, but the endpoint said 8 used of 8 -- so the phone
 * showed a locked "View paid plans for deep AI research" to somebody already
 * paying, and kept showing it for the rest of the thirty days. Over 90% of
 * what they bought looked unavailable.
 *
 * These are the arithmetic, kept out of the route so they can be stated as
 * cases rather than as a database.
 */
import { describe, expect, it } from "vitest";
import { deepAllowance } from "./deepAllowance";
import { AI_RATES_BY_TIER } from "./entitlements";

const PLUS = AI_RATES_BY_TIER["student-plus"];
const FREE = AI_RATES_BY_TIER.free;

describe("a paid account", () => {
  it("has its whole day back the morning after using it", () => {
    // The defect, as one case: yesterday's eight are on the monthly counter,
    // today's counter is zero, and today's eight are available.
    const allowance = deepAllowance({ dayUsed: 0, monthUsed: 8 }, PLUS);
    expect(allowance.window).toBe("day");
    expect(allowance.used).toBe(0);
    expect(allowance.limit).toBe(PLUS.deepPerDay);
    expect(allowance.used < (allowance.limit ?? 0), "must not read as spent").toBe(true);
  });

  it("is told when today is what it has run out of", () => {
    const allowance = deepAllowance({ dayUsed: 8, monthUsed: 8 }, PLUS);
    expect(allowance.window).toBe("day");
    expect(allowance.used).toBe(PLUS.deepPerDay);
    expect(allowance.limit).toBe(PLUS.deepPerDay);
  });

  it("is told when the month is what it has run out of", () => {
    // Eighty of eighty spent, none today: the daily window has room and the
    // monthly one does not, so the monthly one is the answer.
    const allowance = deepAllowance({ dayUsed: 0, monthUsed: 80 }, PLUS);
    expect(allowance.window).toBe("month");
    expect(allowance.used).toBe(PLUS.deepPerMonth);
    expect(allowance.limit).toBe(PLUS.deepPerMonth);
  });

  it("reports the tighter of the two while both have room", () => {
    // 3 left today, 20 left this month.
    const allowance = deepAllowance({ dayUsed: 5, monthUsed: 60 }, PLUS);
    expect(allowance.window).toBe("day");
    expect((allowance.limit ?? 0) - allowance.used).toBe(3);
  });
});

describe("a free account", () => {
  it("is told its taste is a month's, not a day's", () => {
    // Free's rates are equal by design, so the honest sentence is the
    // thirty-day one: "2 remaining today" overstates it thirtyfold.
    const allowance = deepAllowance({ dayUsed: 0, monthUsed: 0 }, FREE);
    expect(allowance.window).toBe("month");
    expect(allowance.limit).toBe(FREE.deepPerMonth);
    expect(allowance.used).toBe(0);
  });

  it("still reads as spent once the taste is gone", () => {
    // Used last week: nothing on today's counter, and nothing left either.
    const allowance = deepAllowance({ dayUsed: 0, monthUsed: 2 }, FREE);
    expect(allowance.window).toBe("month");
    expect(allowance.used).toBe(2);
    expect(allowance.limit).toBe(2);
  });
});

describe("an administrator", () => {
  it("has no limit to report", () => {
    const allowance = deepAllowance({ dayUsed: 40, monthUsed: 900 }, PLUS, true);
    expect(allowance.limit).toBeNull();
  });
});

describe("every tier", () => {
  it("never reports more used than the limit it reports", () => {
    // The pairing has to be coherent: a used count from one window against a
    // limit from the other is what produced the original defect.
    for (const [tier, rates] of Object.entries(AI_RATES_BY_TIER)) {
      for (const dayUsed of [0, 1, rates.deepPerDay, rates.deepPerDay + 5]) {
        for (const monthUsed of [0, 1, rates.deepPerMonth, rates.deepPerMonth + 5]) {
          const allowance = deepAllowance({ dayUsed, monthUsed }, rates);
          const source = allowance.window === "day" ? dayUsed : monthUsed;
          expect(allowance.used, `${tier} ${dayUsed}/${monthUsed}`).toBe(source);
          expect(allowance.limit, `${tier} ${dayUsed}/${monthUsed}`).toBe(
            allowance.window === "day" ? rates.deepPerDay : rates.deepPerMonth,
          );
        }
      }
    }
  });
});
