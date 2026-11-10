import { readFileSync } from "node:fs";
const variant = process.argv[2];
if (!["dev", "production"].includes(variant))
  throw Error("Choose dev or production");
const file =
  variant === "dev"
    ? process.env.GOOGLE_SERVICES_FILE_DEV
    : process.env.GOOGLE_SERVICES_FILE;
if (!file)
  throw Error(
    "Missing Firebase Android configuration: " +
      (variant === "dev" ? "GOOGLE_SERVICES_FILE_DEV" : "GOOGLE_SERVICES_FILE"),
  );
const config = JSON.parse(readFileSync(file, "utf8"));
if (config.private_key || config.type === "service_account")
  throw Error(
    "A private FCM service-account key must never be packaged in the APK",
  );
const pkg = "com.phyrexianarena.app" + (variant === "dev" ? ".dev" : "");
if (
  !config.project_info?.project_number ||
  !config.project_info?.project_id ||
  !config.client?.some(
    (c) =>
      c.client_info?.android_client_info?.package_name === pkg &&
      c.api_key?.some((k) => k.current_key),
  )
)
  throw Error("Invalid Firebase Android configuration or package mismatch");
console.log("Firebase Android configuration verified for " + pkg);
