/**
 * Which deep-research allowance a person is actually up against.
 *
 * Deep research is enforced by two independent counters (see
 * routes/sourceReview.ts): `deepPerDay` over 24 hours and `deepPerMonth` over
 * a rolling 30 days. A request has to clear both.
 *
 * `/users/me/usage` reported one pair, and it reported the wrong one: the
 * larger of the two counters against the *daily* limit. Both clients read that
 * as "used >= limit" and lock the button.
 *
 * On Student Plus -- 8 a day, 80 a month -- one full day of use puts the
 * monthly counter at 8. The next morning the daily counter is 0 and eight
 * reports are genuinely available, but the endpoint reported 8 used against a
 * limit of 8, so the app showed a locked "View paid plans for deep AI
 * research" to a paying customer with their whole day's allowance intact. It
 * stayed locked for the rest of the thirty days, over 90% of what they had
 * bought.
 *
 * The right answer is the tighter of the two remainders, reported with the
 * window it came from, because that is the number the person can act on and
 * "today" and "in the next 30 days" are different promises.
 */

export type DeepRates = { deepPerDay: number; deepPerMonth: number };

export type DeepAllowance = {
  used: number;
  /** Null means uncapped, which is an administrator property only. */
  limit: number | null;
  window: "day" | "month";
};

export function deepAllowance(
  counters: { dayUsed: number; monthUsed: number },
  rates: DeepRates,
  unlimited = false,
): DeepAllowance {
  const dayUsed = Math.max(0, counters.dayUsed);
  const monthUsed = Math.max(0, counters.monthUsed);
  const remainingDay = Math.max(0, rates.deepPerDay - dayUsed);
  const remainingMonth = Math.max(0, rates.deepPerMonth - monthUsed);

  /*
   * Ties go to the month.
   *
   * Free's rates are equal by design -- deepPerDay is set to deepPerMonth so
   * the daily window can never be the binding cap -- so a fresh free account
   * has the same remainder in both. "2 remaining in the next 30 days" is the
   * true sentence there; "2 remaining today" overstates it thirtyfold.
   */
  const bindingIsMonth = remainingMonth <= remainingDay;

  return {
    used: bindingIsMonth ? monthUsed : dayUsed,
    limit: unlimited ? null : bindingIsMonth ? rates.deepPerMonth : rates.deepPerDay,
    window: bindingIsMonth ? "month" : "day",
  };
}
