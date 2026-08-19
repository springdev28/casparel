/**
 * What a failed purchase actually was.
 *
 * The paywall used to report every non-cancellation as "Something went wrong.
 * Please try again." Two of these are not failures at all, and telling a
 * person they are is worse than saying nothing:
 *
 *  • `pending` is Ask to Buy or a bank's strong-customer-authentication step.
 *    The purchase is waiting for a parent or a bank, and it may well complete
 *    minutes later. "It failed, try again" invites a second charge attempt for
 *    something already in flight.
 *  • `already-owned` means they have paid. Answering a paying customer with
 *    "something went wrong" instead of restoring what they bought is the
 *    single worst message in a payment flow.
 *
 * `not-allowed` matters for this product specifically: school and family
 * devices switch purchasing off, and a pupil hitting that needs to know it is
 * the device, not the app or their card.
 *
 * The codes are RevenueCat's own `PurchasesErrorCode` strings, matched
 * loosely: the SDK reports them by name on both platforms, and matching on the
 * name rather than the numeric enum keeps this readable and version-tolerant.
 */
export type PurchaseFailure =
  | "cancelled"
  | "pending"
  | "already-owned"
  | "not-allowed"
  | "store-unavailable"
  | "network"
  | "configuration"
  | "unknown";

export function classifyPurchaseError(error: unknown): PurchaseFailure {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as {
    userCancelled?: boolean;
    code?: unknown;
    message?: unknown;
  };
  if (candidate.userCancelled) return "cancelled";
  // Both are normalised the same way. The message is a fallback for SDK
  // versions and platforms that report the name in prose rather than in the
  // code field, and it only works if "Payment pending" and "PAYMENT_PENDING"
  // end up looking alike -- normalising one and not the other made this
  // branch decorative.
  const normalise = (value: unknown) =>
    String(value ?? "")
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
  const code = normalise(candidate.code);
  const message = normalise(candidate.message);
  const says = (needle: string) => code.includes(needle) || message.includes(needle);

  if (says("PURCHASE_CANCELLED")) return "cancelled";
  if (says("PAYMENT_PENDING")) return "pending";
  if (says("PRODUCT_ALREADY_PURCHASED")) return "already-owned";
  if (says("PURCHASE_NOT_ALLOWED")) return "not-allowed";
  if (says("STORE_PROBLEM") || says("PRODUCT_NOT_AVAILABLE")) return "store-unavailable";
  if (says("NETWORK_ERROR") || says("OFFLINE")) return "network";
  if (
    says("CONFIGURATION_ERROR") ||
    says("INVALID_CREDENTIALS") ||
    says("RECEIPT_ALREADY_IN_USE")
  ) {
    return "configuration";
  }
  return "unknown";
}
