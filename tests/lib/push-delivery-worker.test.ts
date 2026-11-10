import { describe, it, expect } from "vitest";
import { deliveryOutcome } from "@/lib/push-delivery-worker";
describe("persistent push delivery outcomes", () => {
  it("tracks Expo acceptance separately from provider receipt", () => {
    expect(
      deliveryOutcome({ status: "ok", id: "ticket" }, false, 0),
    ).toMatchObject({ status: "receipt", ticket_id: "ticket" });
    expect(deliveryOutcome({ status: "ok" }, true, 0)).toMatchObject({
      status: "delivered",
    });
  });
  it("does not retry permanent payload and credential errors", () => {
    for (const error of [
      "MessageTooBig",
      "InvalidCredentials",
      "DeviceNotRegistered",
    ])
      expect(
        deliveryOutcome({ status: "error", details: { error } }, false, 0),
      ).toMatchObject({ status: "failed", provider_code: error });
  });
  it("bounds transient retries", () => {
    expect(deliveryOutcome(undefined, false, 0)).toMatchObject({
      status: "pending",
    });
    expect(deliveryOutcome(undefined, false, 5)).toMatchObject({
      status: "failed",
    });
  });
  it("never resends when receipt is missing", () => {
    expect(deliveryOutcome(undefined, true, 0)).toMatchObject({
      status: "receipt",
    });
  });
});
