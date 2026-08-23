/**
 * @fileOverview Verification role: exercises Collection Load State.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { getCollectionLoadState } from "./collection-load-state";

describe("getCollectionLoadState", () => {
  it("reports a failed first load as an error, not an empty collection", () => {
    expect(
      getCollectionLoadState({
        data: undefined,
        isLoading: false,
        isError: true,
      }),
    ).toBe("error");
  });

  it("reports a successful empty response as empty", () => {
    expect(
      getCollectionLoadState({ data: [], isLoading: false, isError: false }),
    ).toBe("empty");
  });

  it("keeps stale data usable when a background refresh fails", () => {
    expect(
      getCollectionLoadState({
        data: [{ id: 1 }],
        isLoading: false,
        isError: true,
      }),
    ).toBe("ready");
  });
});
