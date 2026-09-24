import * as cheerio from 'cheerio';
import type { PageLink } from './types.js';

export interface ExtractedPage {
  title?: string;
  /** Full body text (includes link anchor text). Good for LLM context. */
  text: string;
  /** Body text with <a> anchor text removed — use for evidence/signal checks so a
   *  page cannot look like evidence merely because it LINKS to interview content. */
  contentText: string;
  links: PageLink[];
}

const MAX_TEXT_CHARS = 8_000;
const MAX_LINKS = 200;

/**
 * Parse an HTML page into clean text + resolved links. Scripts/styles are
 * dropped, whitespace collapsed, and text capped so downstream token budgets
 * stay sane. Relative links are resolved against `pageUrl` (§9 — follow relative
 * links, do not assume a host).
 */
export function extractPage(pageUrl: string, html: string): ExtractedPage {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, template').remove();

  const title = ($('title').first().text() || $('h1').first().text()).replace(/\s+/g, ' ').trim();

  const bodyText = (): string => ($('body').length ? $('body').text() : $.root().text());
  const text = bodyText().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);

  // Collect links BEFORE stripping anchors, so we still get the link list.
  const links: PageLink[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    if (links.length >= MAX_LINKS) return;
    const href = $(el).attr('href');
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
    abs.hash = '';
    const url = abs.toString();
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ url, text: $(el).text().replace(/\s+/g, ' ').trim() });
  });

  // Content text = body text with anchor text removed (so links don't masquerade
  // as page content when we decide whether a page is real interview evidence).
  $('a').remove();
  const contentText = bodyText().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);

  return { title: title || undefined, text, contentText, links };
}
