import crypto from "crypto";

export function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

export function tokenExpiry(hours = 24) {
  const expires = new Date();
  expires.setHours(expires.getHours() + hours);
  return expires;
}
