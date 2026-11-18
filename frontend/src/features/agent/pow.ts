import { apiFetch } from "@/lib/api";

import { powChallengeSchema } from "./schemas";

// A new visitor's first message carries a small proof of work (see backend/app/security.py):
// find a nonce whose SHA-256 of "challenge:nonce" starts with `bits` zero bits. About a second
// for a person; expensive for a script that floods the AI budget.

export interface PowSolution {
  challenge: string;
  nonce: string;
}

export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

const BATCH = 256;

export async function solvePow(challenge: string, bits: number): Promise<string> {
  const encoder = new TextEncoder();
  for (let start = 0; ; start += BATCH) {
    const nonces = Array.from({ length: BATCH }, (_, i) => String(start + i));
    const digests = await Promise.all(
      nonces.map((n) => crypto.subtle.digest("SHA-256", encoder.encode(`${challenge}:${n}`))),
    );
    const hit = digests.findIndex((d) => leadingZeroBits(new Uint8Array(d)) >= bits);
    if (hit !== -1) return String(start + hit);
  }
}

export async function getPowSolution(): Promise<PowSolution> {
  const { challenge, bits } = await apiFetch("/api/pow", powChallengeSchema);
  return { challenge, nonce: await solvePow(challenge, bits) };
}
