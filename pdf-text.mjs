// The PDF text layer ProofFetch hashes for contentSha256, published so anyone can recompute it.
// Pass the unpdf module (npm unpdf, the exact version the response names in document.pdf.extractor):
// the same bytes through the same version give the same text. ProofFetch reads at most MAX_PDF_PAGES pages.
export const MAX_PDF_PAGES = 300;
// ProofFetch also stops after the page where the text passes MAX_PDF_CHARS; pagesRead in the response says where.
export const MAX_PDF_CHARS = 2_000_000;

export const isPdf = (bytes) => bytes?.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;

// options.deadline (ms since epoch): throw pdf_time_budget if a page starts after it.
// Returns { text, pages, pagesRead, title, language }. text is each page's text items in order, a new
// line wherever the PDF ends a line, and a new line between pages; normalizeText(text, 'text/plain') tidies it.
export async function pdfText(bytes, unpdf, { maxPages = MAX_PDF_PAGES, maxChars = MAX_PDF_CHARS, deadline = Infinity } = {}) {
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  try {
    const last = Math.min(pdf.numPages, maxPages);
    const out = [];
    let chars = 0;
    let pagesRead = 0;
    for (let n = 1; n <= last && chars < maxChars; n += 1) {
      if (Date.now() > deadline) throw new Error('pdf_time_budget');
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ''}`).join('');
      out.push(text);
      chars += text.length;
      pagesRead = n;
      page.cleanup();
    }
    let title = null;
    let language = null;
    try {
      const meta = await pdf.getMetadata();
      title = String(meta?.info?.Title || '').replace(/\s+/gu, ' ').trim() || null;
      language = String(meta?.info?.Language || '').trim() || null;
    } catch { /* metadata is optional */ }
    return { text: out.join('\n'), pages: pdf.numPages, pagesRead, title, language };
  } finally {
    await (pdf.loadingTask?.destroy?.() ?? pdf.destroy?.());
  }
}
