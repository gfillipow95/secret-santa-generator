import sanitizeHtml from 'sanitize-html';

// Formatted wishlists are shown on someone else's page, so they're cleaned to a
// short list of harmless tags on the way in and again on the way out.
const OPTIONS = {
  allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    div: 'p',
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
  },
};

export const cleanHtml = (html) => sanitizeHtml(html, OPTIONS);

export const escapeHtml = (text) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** The words of cleaned HTML as plain text, one line per paragraph or list item. */
export function textOf(clean) {
  return clean
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<li>/g, '• ')
    .replace(/<\/(p|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
