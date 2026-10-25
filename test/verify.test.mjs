import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyEvidence } from '../verify.mjs';

const evidence = JSON.parse(readFileSync(new URL('../examples/example.com.evidence.json', import.meta.url), 'utf8'));
const bytes = new Uint8Array(readFileSync(new URL('../examples/example.com.html', import.meta.url)));

test('the example.com response verifies against its bytes, with the fingerprints of the real paid response', async () => {
  assert.equal(evidence.integrity.rawSha256, '25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484');
  assert.equal(evidence.integrity.contentSha256, 'cbf3f738cc4646f250e5964ab74741b434912a67e1cce86c798bf71af1cf85c8');
  const result = await verifyEvidence(evidence, bytes);
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.equal(result.checks.length, 5);
});

test('one changed byte in the page fails both fingerprints', async () => {
  const changed = bytes.slice(); changed[Buffer.from(bytes).indexOf('documentation')] = 0x44; // "documentation" becomes "Documentation"
  const result = await verifyEvidence(evidence, changed);
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.name.startsWith('rawSha256')).ok, false);
  assert.equal(result.checks.find((c) => c.name.startsWith('contentSha256')).ok, false);
});

test('an edited paragraph is caught even when the fingerprints are left alone', async () => {
  const edited = structuredClone(evidence);
  edited.document.paragraphs[0].text = edited.document.paragraphs[0].text.replace('without needing permission', 'with permission');
  const result = await verifyEvidence(edited, bytes);
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.name.startsWith('every paragraph')).ok, false);
  assert.equal(result.checks.find((c) => c.name.startsWith('contentText')).ok, false);
});

test('without bytes, the response is checked against itself', async () => {
  const result = await verifyEvidence(evidence);
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((c) => c.name), ['paragraph IDs run p1, p2, p3…', 'contentText is the numbered paragraphs']);
});

test('the CLI runs when started through a symlink, as npx does', async () => {
  const { mkdtempSync, symlinkSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const link = join(mkdtempSync(join(tmpdir(), 'pfv-')), 'prooffetch-verify');
  symlinkSync(fileURLToPath(new URL('../verify.mjs', import.meta.url)), link);
  const out = execFileSync(process.execPath, [link, fileURLToPath(new URL('../examples/example.com.evidence.json', import.meta.url)), fileURLToPath(new URL('../examples/example.com.html', import.meta.url))], { encoding: 'utf8' });
  assert.match(out, /Verified\./);
});
