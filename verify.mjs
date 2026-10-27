#!/usr/bin/env node
// Check a ProofFetch response without trusting ProofFetch: recompute both SHA-256 fingerprints from
// the page bytes and confirm every numbered paragraph comes from that text, in order.
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './normalize.mjs';
import { pdfText, isPdf } from './pdf-text.mjs';

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const squash = (s) => s.replace(/\s+/gu, ' ').trim();

// evidence: the parsed JSON ProofFetch returned. bytes: the page's raw bytes (Uint8Array), or null to
// check only what the response says about itself. Returns { ok, checks: [{ name, ok, detail, skipped? }] }.
// For a PDF, the text is recomputed with unpdf (options.unpdf, else an installed unpdf); with none, or
// options.unpdf null, the text checks are skipped.
export async function verifyEvidence(evidence, bytes = null, options = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const skip = (name, detail) => checks.push({ name, ok: true, skipped: true, detail });
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
    let normalized;
    // the response says whether ProofFetch read these bytes as a PDF (a server can send %PDF- bytes as text/plain)
    if (doc.pdf) {
      const extractor = doc.pdf.extractor || 'unpdf';
      let unpdf = options.unpdf;
      if (unpdf === undefined) { try { unpdf = await import('unpdf'); } catch { unpdf = null; } }
      if (!unpdf) {
        skip('contentSha256 matches the PDF text', `install ${extractor} (npm i ${extractor}) to recompute the text of a PDF`);
        return { ok: checks.every((c) => c.ok), checks };
      }
      add('the bytes are a PDF', isPdf(bytes), 'starts with %PDF-');
      const pdf = await pdfText(bytes, unpdf, { maxPages: Number(doc.pdf.pagesRead) || 0, maxChars: Infinity });
      normalized = normalizeText(pdf.text, 'text/plain');
    } else {
      normalized = normalizeText(new TextDecoder('utf-8').decode(bytes), evidence?.http?.contentType || 'text/html');
    }
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
  for (const c of checks) console.log(`${c.skipped ? 'SKIP' : c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  const partial = checks.some((c) => c.skipped);
  console.log(!ok ? '\nNot verified.' : partial ? '\nVerified (raw bytes only; PDF text not checked).' : '\nVerified.');
  return ok ? 0 : 1;
}

// npx and npm link start the CLI through a symlink, so compare real paths.
function startedAsCli() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (startedAsCli()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(String(error?.message || error)); process.exitCode = 2; });
}
