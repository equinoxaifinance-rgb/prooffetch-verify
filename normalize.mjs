// The text normalization ProofFetch hashes for contentSha256, published so anyone can recompute it.
// It must stay byte-for-byte identical to the extractor ProofFetch runs; the tests pin it to real responses.

const unwanted = /<(script|style|noscript|svg|canvas|template|form|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/giu;
const unclosedUnwanted = /<(script|style|noscript|svg|canvas|template|form|iframe|object|embed)\b[^>]*>[\s\S]*$/iu;
const comments = /<!--[\s\S]*?-->/gu;
const blockBoundary = /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/giu;
const tag = /<[^>]+>/gu;

export function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x') || lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(lower.startsWith('#x') ? 2 : 1), lower.startsWith('#x') ? 16 : 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '�';
    }
    return named[lower] ?? match;
  });
}

// text: the page decoded as UTF-8. contentType: the response's Content-Type header.
export function normalizeText(text, contentType = 'text/html') {
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/iu.test(contentType);
  const stripped = isHtml
    ? decodeEntities(text.replace(comments, ' ').replace(unwanted, ' ').replace(unclosedUnwanted, ' ').replace(blockBoundary, '\n').replace(tag, ' '))
    : text;
  return stripped.replace(/\r\n?/gu, '\n').replace(/[\t\f\v ]+/gu, ' ')
    .split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
}
