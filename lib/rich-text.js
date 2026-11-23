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

const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer nofollow"';
// Stops at spaces, tags, and quotes (raw or escaped), so an address can never break out of its link.
const WEB_ADDRESS = /(?:https?:\/\/|www\.)(?:(?!&(?:quot|#39|lt|gt);)[^\s<"'])+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]'"]+$/;

/**
 * Turns web addresses typed or pasted as plain words into links that open in a new tab.
 * Works on cleaned HTML and leaves existing links alone. Only how a list is shown changes, not what's saved.
 */
export function linkify(html) {
  let insideLink = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) insideLink++;
      else if (/^<\/a>/i.test(part)) insideLink--;
      return part;
    }
    if (insideLink) return part;
    return part.replace(WEB_ADDRESS, (match) => {
      const address = match.replace(TRAILING_PUNCTUATION, '');
      const trailing = match.slice(address.length);
      const href = /^www\./i.test(address) ? `https://${address}` : address;
      return `<a href="${href}" ${LINK_ATTRS}>${address}</a>${trailing}`;
    });
  }).join('');
}
