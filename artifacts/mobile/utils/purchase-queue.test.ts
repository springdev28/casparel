import { expect, it } from "vitest";
import { createPurchaseQueue } from "./purchase-queue";

it("keeps login, purchase and logout ordered while checkout is open", async () => {
  const queue = createPurchaseQueue();
  const calls: string[] = [];
  let finish!: () => void;
  const transaction = queue.run(async () => {
    calls.push("purchase");
    await new Promise<void>((resolve) => { finish = resolve; });
    calls.push("paid");
  });
  const logout = queue.run(async () => { calls.push("logout"); });
  await Promise.resolve();
  expect(calls).toEqual(["purchase"]);
  finish();
  await Promise.all([transaction, logout]);
  expect(calls).toEqual(["purchase", "paid", "logout"]);
});

it("allows identity recovery after a failed SDK call", async () => {
  const queue = createPurchaseQueue();
  await expect(queue.run(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  await expect(queue.run(async () => "recovered")).resolves.toBe("recovered");
});
