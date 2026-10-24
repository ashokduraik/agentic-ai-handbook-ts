/**
 * Post 02 walks through this file.
 *
 * Chunking: split markdown on headings, then by size with overlap.
 * Why heading-aware? A chunk that keeps its heading ("ICU › visiting") retrieves far better
 * than an arbitrary 500-char window, and gives you a meaningful citation label.
 */
export interface Chunk {
  id: string; // stable: source#index — lets you re-ingest idempotently
  source: string; // file name, used for citations
  heading: string; // "Doc title › Section"
  text: string;
}

export function chunkMarkdown(source: string, markdown: string, maxChars = 800, overlap = 120): Chunk[] {
  const chunks: Chunk[] = [];
  let title = '';
  // Split before every heading line, keep the heading with its body.
  for (const block of markdown.split(/\n(?=#{1,3} )/)) {
    const [first = '', ...rest] = block.split('\n');
    const level = /^(#{1,3}) /.exec(first)?.[1]?.length ?? 0;
    const headingText = first.replace(/^#{1,3} /, '').trim();
    if (level === 1) title = headingText;
    const body = (level ? rest.join('\n') : block).trim();
    if (!body) continue;
    const heading = level > 1 ? `${title} › ${headingText}` : title || headingText;
    // Long sections → sliding windows with overlap so facts on a boundary aren't lost.
    for (let start = 0; start < body.length; start += maxChars - overlap) {
      chunks.push({ id: `${source}#${chunks.length}`, source, heading, text: body.slice(start, start + maxChars) });
      if (start + maxChars >= body.length) break;
    }
  }
  return chunks;
}
