// Get other service's urls from environment variables
export const AUTHENTICATION_SERVICE_URL =
  Deno.env.get("AUTHENTICATION_SERVICE_URL") || "http://localhost:8001";
