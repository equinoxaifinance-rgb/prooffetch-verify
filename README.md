# prooffetch-verify

Check a [ProofFetch](https://prooffetch.steellantern.com) response yourself, without trusting ProofFetch.

ProofFetch returns a public web page as numbered paragraphs with two SHA-256 fingerprints:

- `rawSha256`: the exact bytes the page's server sent.
- `contentSha256`: the page's text after a fixed cleanup (tags removed, whitespace tidied).

This tool recomputes both from the page bytes and confirms that every paragraph, `p1`, `p2` and on, comes from that text in order. The cleanup code is in [`normalize.mjs`](normalize.mjs), so you can read exactly what is hashed.

## Use it

Needs Node.js 20 or newer. No dependencies.

Clone this repository, then:

```sh
node verify.mjs response.json page.html
```

- `response.json` is the JSON ProofFetch returned.
- `page.html` is the page's raw bytes, for example your own copy saved when you fetched it. Leave it out to check only that the response is consistent with itself.

Try it on the included example, which carries the same fingerprints as ProofFetch's real paid response for example.com on 10 Oct 2026:

```sh
node verify.mjs examples/example.com.evidence.json examples/example.com.html
```

```
PASS  paragraph IDs run p1, p2, p3…  (1 paragraphs)
PASS  contentText is the numbered paragraphs  (rebuilt from document.paragraphs)
PASS  rawSha256 matches the bytes  (25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484)
PASS  contentSha256 matches the normalized text  (cbf3f738cc4646f250e5964ab74741b434912a67e1cce86c798bf71af1cf85c8)
PASS  every paragraph comes from the page, in order  (all found)

Verified.
```

Change one byte of `page.html` and both fingerprints fail.

## In code

```js
import { verifyEvidence } from './verify.mjs';
const { ok, checks } = await verifyEvidence(responseJson, pageBytes);
```

## What a pass means

A pass means the response matches the bytes you gave it. It doesn't show when or where those bytes came from: keep your own copy of the page, or fetch it again, to compare. A page that has changed since will fail, which is the point.

## License

MIT. Questions: bryan@steellantern.com.
