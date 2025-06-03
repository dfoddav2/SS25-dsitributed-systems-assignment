// Get other service's urls from environment variables
export const AUTHENTICATION_SERVICE_URL =
  Deno.env.get("AUTHENTICATION_SERVICE_URL") || "http://localhost:8001";

export const SKIP_AUTHENTICATION =
  Boolean(Deno.env.get("SKIP_TRANSACTION_SERVICE_AUTHENTICATION")) || false;
