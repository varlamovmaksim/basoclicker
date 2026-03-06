"use client";

const STORAGE_KEY = "tapper_dev_device_id";
const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";

/** Returns a stable device id for dev mode. Generated once per device, stored in localStorage. */
export function getDevDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** Headers to add to API requests in dev mode for deterministic user per device. */
export function getDevAuthHeaders(): Record<string, string> {
  if (!IS_DEV) return {};
  const fp = getDevDeviceFingerprint();
  if (!fp) return {};
  return { "X-Device-Fingerprint": fp };
}
