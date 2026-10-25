#!/usr/bin/env node
// Check a ProofFetch response without trusting ProofFetch: recompute both SHA-256 fingerprints from
// the page bytes and confirm every numbered paragraph comes from that text, in order.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './normalize.mjs';

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const squash = (s) => s.replace(/\s+/gu, ' ').trim();

// evidence: the parsed JSON ProofFetch returned. bytes: the page's raw bytes (Uint8Array), or null to
// check only what the response says about itself. Returns { ok, checks: [{ name, ok, detail }] }.
export async function verifyEvidence(evidence, bytes = null) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const doc = evidence?.document || {};
  const integrity = evidence?.integrity || {};
  const paragraphs = Array.isArray(doc.paragraphs) ? doc.paragraphs : [];

  add('paragraph IDs run p1, p2, p3…', paragraphs.length > 0 && paragraphs.every((p, i) => p?.id === `p${i + 1}`),
    `${paragraphs.length} paragraphs`);
  if (typeof doc.contentText === 'string') {
    add('contentText is the numbered paragraphs', doc.contentText === paragraphs.map((p) => `[${p.id}] ${p.text}`).join('\n\n'), 'rebuilt from document.paragraphs');
  }
  const commerce = evidence?.commerce?.contentSha256;
  if (commerce) add('receipt names the same content fingerprint', commerce === integrity.contentSha256, commerce);

  if (bytes) {
    const raw = await sha256Hex(bytes);
    add('rawSha256 matches the bytes', raw === integrity.rawSha256, raw);
    const text = new TextDecoder('utf-8').decode(bytes);
    const normalized = normalizeText(text, evidence?.http?.contentType || 'text/html');
    const content = await sha256Hex(normalized);
    add('contentSha256 matches the normalized text', content === integrity.contentSha256, content);
    // Paragraphs join the page's lines with spaces and may stop at the requested character limit.
    const flat = squash(normalized);
    let at = 0;
    const missing = [];
    for (const p of paragraphs) {
      const found = flat.indexOf(squash(p.text), at);
      if (found < 0) missing.push(p.id); else at = found + squash(p.text).length;
    }
    add('every paragraph comes from the page, in order', missing.length === 0, missing.length ? `not found: ${missing.join(', ')}` : 'all found');
  }
  return { ok: checks.every((c) => c.ok), checks };
}

async function main(argv) {
  const [evidencePath, bytesPath] = argv;
  if (!evidencePath) {
    console.log('Usage: prooffetch-verify <response.json> [page-bytes]\n\nWithout page bytes, checks the response against itself.\nWith the page bytes (for example from your own download), recomputes both fingerprints.');
    return 2;
  }
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const bytes = bytesPath ? new Uint8Array(await readFile(bytesPath)) : null;
  const { ok, checks } = await verifyEvidence(evidence, bytes);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  console.log(ok ? '\nVerified.' : '\nNot verified.');
  return ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(String(error?.message || error)); process.exitCode = 2; });
}
