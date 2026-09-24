/**
 * similiaOS client-side license verification.
 *
 * SECURITY CONTRACT
 * - Only HC3 (ECDSA P-256) licenses are accepted.
 * - The public verification key is safe to ship in the clinic app.
 * - No private key, HMAC master secret, issuer secret, or app secret is shipped.
 * - Legacy HC/HC2 licenses must be re-issued by the Activator as HC3.
 */

const PLAN_DAYS: Record<string, number> = {
  demo7: 7,
  "1m": 30,
  "6m": 183,
  "1y": 365,
  "1month": 30,
  "6months": 183,
  "1year": 365,
};

export const MAX_DEVICES = 5;
export const MAX_RESETS_PER_MONTH = 5;
export const LICENSE_PRODUCT_ID = "com.homeopathic.clinic.ai";
export const LICENSE_CODE_PREFIX_V3 = "HC3-";
/** Legacy constants kept only so older UI imports do not fail. They are not accepted. */
export const LICENSE_CODE_PREFIX_V2 = "HC2-";
export const LICENSE_CODE_PREFIX_V1 = "HC-";

const LICENSE_V3_PUBLIC_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "DS6fpJdyBQnSttqgy5WXnYehXgnY_YdUaqeeI4pSw4Q",
  y: "fSTgYm4RyPL523lNVKlamptSn2toaX54BncoD5z8wa8",
  ext: true,
  key_ops: ["verify"],
};

function b64urlDecodeBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

function b64urlDecode(s: string): string {
  return new TextDecoder().decode(b64urlDecodeBytes(s));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Non-secret integrity hash retained for old callers; it is not a license trust boundary. */
export async function signLocalLicenseBlob(payload: string): Promise<string> {
  return (await sha256Hex(payload)).slice(0, 32);
}

async function verifyV3Signature(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      LICENSE_V3_PUBLIC_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      key,
      b64urlDecodeBytes(signature),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export async function hwidHash(hwid: string): Promise<string> {
  return (await sha256Hex(hwid.trim().toUpperCase())).slice(0, 24);
}

export async function getHardwareId(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const id = (await invoke("get_native_hwid")) as string;
    if (id && id.length >= 8) return id.toUpperCase();
  } catch {
    // Browser/dev fallback below.
  }

  const parts: string[] = [
    typeof navigator !== "undefined" ? navigator.userAgent : "node",
    typeof navigator !== "undefined" ? navigator.language : "",
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}x${screen.colorDepth}` : "",
    typeof navigator !== "undefined" ? String(navigator.hardwareConcurrency || "") : "",
  ];

  // Browser mode is intentionally weaker than native HWID and is retained for dev/testing.
  try {
    let nonce = localStorage.getItem("hc_device_nonce");
    if (!nonce) {
      nonce = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
      localStorage.setItem("hc_device_nonce", nonce);
    }
    parts.push(nonce);
  } catch {
    // ignore
  }

  return (await sha256Hex(parts.filter(Boolean).join("|"))).slice(0, 16).toUpperCase();
}

export async function getMachineLabel(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const label = (await invoke("get_native_machine_label")) as string;
    if (label) return label;
  } catch {
    // browser/dev
  }
  return "Device";
}

export interface CodeInfo {
  username: string;
  expiry: number;
  plan: string;
  issued: number;
  nonce: string;
  allowed_hwid_hashes: string[];
  max_devices: number;
}

export async function parseActivationCode(code: string): Promise<CodeInfo | null> {
  const clean = String(code || "").trim();
  if (!clean.toUpperCase().startsWith(LICENSE_CODE_PREFIX_V3)) return null;

  try {
    const raw = b64urlDecode(clean.slice(LICENSE_CODE_PREFIX_V3.length));
    const parts = raw.split("|");
    if (parts.length !== 8) return null;

    const [user, expiryText, plan, issuedText, nonce, hPart, product, signature] = parts;
    if (product !== LICENSE_PRODUCT_ID || !signature) return null;

    const expiry = Number(expiryText);
    const issued = Number(issuedText);
    if (!Number.isSafeInteger(expiry) || !Number.isSafeInteger(issued)) return null;
    if (!(plan in PLAN_DAYS) || !user || !nonce) return null;

    const payload = `${user}|${expiryText}|${plan}|${issuedText}|${nonce}|${hPart}|${product}`;
    if (!(await verifyV3Signature(payload, signature))) return null;

    const allowed = hPart ? hPart.split(",").filter(Boolean) : [];
    return {
      username: user.toLowerCase(),
      expiry,
      plan,
      issued,
      nonce,
      allowed_hwid_hashes: allowed,
      max_devices: Math.max(1, Math.min(allowed.length || MAX_DEVICES, MAX_DEVICES)),
    };
  } catch {
    return null;
  }
}

export interface LicenseFile {
  username: string;
  expiry: number;
  plan: string;
  code_hash: string;
  nonce: string;
  hwid: string;
  allowed_hwid_hashes?: string[];
  activation_code?: string;
  status?: "active" | "revoked" | "disabled" | "expired" | "pending";
  last_seen?: number;
  last_online_check?: number;
  file_sig?: string;
}

const LIC_KEY = "hc_license_json";
const LIC_BACKUP_KEY = "hc_license_bak";
const CLOCK_KEY = "hc_clock_guard";
const INTEGRITY_KEY = "hc_lic_integrity";

export function loadLicense(): LicenseFile | null {
  try {
    let raw = localStorage.getItem(LIC_KEY);
    if (!raw) {
      raw = localStorage.getItem(LIC_BACKUP_KEY);
      if (raw) localStorage.setItem(LIC_KEY, raw);
    }
    return raw ? (JSON.parse(raw) as LicenseFile) : null;
  } catch {
    return null;
  }
}

export function saveLicense(lic: LicenseFile) {
  const json = JSON.stringify(lic);
  localStorage.setItem(LIC_KEY, json);
  localStorage.setItem(LIC_BACKUP_KEY, json);
  if (lic.file_sig) localStorage.setItem(INTEGRITY_KEY, lic.file_sig.slice(0, 16));
}

export function trustedNow(): { now: number; ok: boolean; msg: string } {
  const now = Math.floor(Date.now() / 1000);
  let last = 0;
  try {
    last = Number(localStorage.getItem(CLOCK_KEY) || 0) || 0;
  } catch {
    // ignore
  }
  if (last && now + 2 * 86400 < last) {
    return {
      now: last,
      ok: false,
      msg: "System clock appears to have been moved backwards. Please set the correct date/time.",
    };
  }
  try {
    localStorage.setItem(CLOCK_KEY, String(Math.max(now, last)));
  } catch {
    // ignore
  }
  return { now, ok: true, msg: "ok" };
}

async function validateLicenseRecord(
  lic: LicenseFile | null,
  username: string,
  now: number
): Promise<{ active: boolean; message: string; daysLeft: number } | null> {
  if (!lic || lic.username.toLowerCase() !== username.toLowerCase()) return null;

  // A hardened license must retain the original signed HC3 blob. Re-hashing a
  // mutable local record is deliberately not treated as authentication.
  if (!lic.activation_code) {
    return {
      active: false,
      message: "This local license uses a legacy format. Re-activate with a new HC3 code.",
      daysLeft: 0,
    };
  }

  const info = await parseActivationCode(lic.activation_code);
  if (!info || info.username !== username.toLowerCase()) return null;

  const hwid = await getHardwareId();
  const myHash = await hwidHash(hwid);
  if (lic.hwid !== hwid) return null;
  if (info.allowed_hwid_hashes.length && !info.allowed_hwid_hashes.includes(myHash)) return null;

  if (lic.status === "revoked" || lic.status === "disabled") {
    return { active: false, message: "This license has been revoked or disabled.", daysLeft: 0 };
  }

  const lastSeen = lic.last_seen || 0;
  if (lastSeen && now + 2 * 86400 < lastSeen) {
    return { active: false, message: "System clock moved backwards after activation.", daysLeft: 0 };
  }
  if (now > info.expiry) {
    return { active: false, message: "License expired. Please contact the clinic administrator.", daysLeft: 0 };
  }

  lic.expiry = info.expiry;
  lic.plan = info.plan;
  lic.nonce = info.nonce;
  lic.allowed_hwid_hashes = info.allowed_hwid_hashes;
  lic.last_seen = Math.max(now, lastSeen);
  saveLicense(lic);

  const daysLeft = Math.max(0, Math.floor((info.expiry - now) / 86400));
  const until = new Date(info.expiry * 1000).toISOString().slice(0, 10);
  return {
    active: true,
    message: `Licensed until ${until} (${daysLeft} days left) · HWID ${lic.hwid.slice(0, 8)}…`,
    daysLeft,
  };
}

export async function activateAccount(
  username: string,
  code: string
): Promise<{ ok: boolean; message: string }> {
  const info = await parseActivationCode(code);
  if (!info) return { ok: false, message: "Invalid or tampered HC3 activation code." };

  const user = username.trim().toLowerCase();
  if (info.username !== user) {
    return { ok: false, message: "This code is bound to a different username." };
  }

  const { now, ok, msg } = trustedNow();
  if (!ok) return { ok: false, message: msg };
  if (now > info.expiry) return { ok: false, message: "This activation code has expired." };

  const hwid = await getHardwareId();
  const myHash = await hwidHash(hwid);
  if (info.allowed_hwid_hashes.length && !info.allowed_hwid_hashes.includes(myHash)) {
    return {
      ok: false,
      message:
        `This PC's Hardware ID is not in the allowed list.\\n\\nHWID: ${hwid}\\n\\nAsk the administrator to add this HWID and issue a new HC3 code.`,
    };
  }

  const codeHash = (await sha256Hex(code.trim())).slice(0, 24);
  const lic: LicenseFile = {
    username: user,
    expiry: info.expiry,
    plan: info.plan,
    code_hash: codeHash,
    nonce: info.nonce,
    hwid,
    allowed_hwid_hashes: info.allowed_hwid_hashes,
    activation_code: code.trim(),
    status: "active",
    last_seen: now,
    last_online_check: now,
  };

  // Non-secret corruption marker only; signature authenticity comes from HC3.
  lic.file_sig = (await sha256Hex(JSON.stringify(lic))).slice(0, 32);
  saveLicense(lic);

  const daysLeft = Math.max(0, Math.floor((info.expiry - now) / 86400));
  return {
    ok: true,
    message: `Account activated.\\nPlan: ${info.plan} · Hardware ID locked\\nDays remaining: ~${daysLeft}\\n\\nHWID: ${hwid}`,
  };
}

export async function checkLicenseForUser(
  username: string
): Promise<{ active: boolean; message: string; daysLeft: number }> {
  const { now, ok, msg } = trustedNow();
  if (!ok) return { active: false, message: msg, daysLeft: 0 };

  const result = await validateLicenseRecord(loadLicense(), username.trim().toLowerCase(), now);
  return result || {
    active: false,
    message: "No valid HC3 activation found. Please activate this account.",
    daysLeft: 0,
  };
}

/** Activation is always required; soft/unlicensed mode remains disabled. */
const HARD_GATE_KEY = "hc_hard_license_gate";
export function getHardLicenseGate(): boolean {
  return true;
}
export function setHardLicenseGate(_on: boolean) {
  try {
    localStorage.setItem(HARD_GATE_KEY, "1");
  } catch {
    // ignore
  }
}
