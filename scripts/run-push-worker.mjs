const url = process.env.PUSH_DELIVERY_BASE_URL;
const secret = process.env.PUSH_DELIVERY_SECRET;
if (
  !url ||
  !["https://dev.21life.win", "https://app.21life.win"].includes(
    url.replace(/\/$/, ""),
  )
)
  throw Error("Set the explicit canonical Dev or production API origin");
if (!secret || secret.length < 32) throw Error("Missing push worker secret");
// Never print the Authorization header, response bodies, or environment.
const response = await fetch(
  `${url.replace(/\/$/, "")}/api/internal/push-delivery`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(110000),
  },
);
if (!response.ok) throw Error("Push worker HTTP " + response.status);
const result = await response.json();
if (!Number.isInteger(result.processed) || result.processed < 0)
  throw Error("Invalid push worker response");
console.log("Push queue processed: " + result.processed);
