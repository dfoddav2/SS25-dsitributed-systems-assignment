import { JWTPayload, jwtVerify, SignJWT } from "npm:jose";

let secretKey: Uint8Array;
let jwtExpiry: string;

// Initialize JWT secret key from environment variable
try {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  secretKey =
    new TextEncoder().encode(Deno.env.get("JWT_SECRET")) ||
    new TextEncoder().encode("my-super-secret-jwt-key");
  jwtExpiry = Deno.env.get("JWT_EXPIRY") || "1h";
  if (!jwtExpiry) {
    throw new Error("JWT_EXPIRY environment variable is required");
  }
} catch (error) {
  console.error("Error loading:", error);
  Deno.exit(1);
}

// JWT Creation logic - Jose
export async function createJWT(payload: JWTPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(jwtExpiry)
    .sign(secretKey);
}

// JWT Verification logic - Jose
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    console.log("JWT is valid:", payload);
    return payload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}
