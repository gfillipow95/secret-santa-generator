import { el } from './common.js';

const TOOLS = [
  { command: 'bold', label: 'B', title: 'Bold', style: 'font-weight:800' },
  { command: 'italic', label: 'I', title: 'Italic', style: 'font-style:italic' },
  { command: 'underline', label: 'U', title: 'Underline', style: 'text-decoration:underline' },
  { command: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { command: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
  { command: 'link', label: '🔗 Link', title: 'Add a link' },
];

const escape = (text) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * A small formatting editor: bold, italic, underline, lists, and links.
 * `html` is the saved list from the server, already cleaned. The server cleans
 * whatever comes back too, so this only has to be pleasant, not safe.
 */
export function createRichEditor({ label, html = '', placeholder = '' }) {
  const area = el('div', {
    class: 'rich-area',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    'data-placeholder': placeholder,
  });
  area.innerHTML = html;

  const buttons = TOOLS.map((tool) => el('button', {
    class: 'rich-tool',
    type: 'button',
    title: tool.title,
    'aria-label': tool.title,
    'aria-pressed': 'false',
    style: tool.style,
    // Keep the text selection when the button is pressed.
    onmousedown: (event) => event.preventDefault(),
    onclick: () => run(tool.command),
  }, tool.label));

  // Links are typed into a small box in the editor, not window.prompt(), which many
  // in-app browsers (and the desktop app's own browser) don't support.
  const linkInput = el('input', { type: 'url', inputmode: 'url', placeholder: 'https://example.com/gift', 'aria-label': 'Link address' });
  const linkRow = el('div', { class: 'rich-link-row', hidden: true },
    linkInput,
    el('button', { class: 'btn gold small', type: 'button', onclick: () => addLink() }, 'Add link'),
    el('button', { class: 'btn gold small', type: 'button', onclick: () => closeLinkRow() }, 'Cancel'),
  );
  let savedRange = null;

  function openLinkRow() {
    const selection = getSelection();
    if (selection?.rangeCount && area.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    } else {
      savedRange = document.createRange();
      savedRange.selectNodeContents(area);
      savedRange.collapse(false);
    }
    linkRow.hidden = false;
    linkInput.value = '';
    linkInput.focus();
  }

  function restoreSelection() {
    area.focus();
    if (!savedRange) return;
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  function closeLinkRow() {
    linkRow.hidden = true;
    restoreSelection();
  }

  function addLink() {
    const typed = linkInput.value.trim();
    if (!typed) {
      linkInput.focus();
      return;
    }
    const href = /^(https?:|mailto:)/i.test(typed) ? typed : `https://${typed}`;
    linkRow.hidden = true;
    restoreSelection();
    if (savedRange && !savedRange.collapsed) document.execCommand('createLink', false, href);
    else document.execCommand('insertHTML', false, `<a href="${escape(href)}">${escape(typed)}</a>&nbsp;`);
    showActive();
  }

  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addLink();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeLinkRow();
    }
  });

  // While editing, clicking a link puts the cursor in it like any editor, and shows a bar to open it in a new tab or remove it.
  const openLink = el('a', { class: 'btn gold small', target: '_blank', rel: 'noopener noreferrer nofollow' }, 'Open ↗');
  const linkAddress = el('span', { class: 'rich-link-address' });
  let clickedLink = null;
  const linkInfo = el('div', { class: 'rich-link-row', hidden: true },
    linkAddress,
    openLink,
    el('button', { class: 'btn gold small', type: 'button', onclick: () => removeLink() }, 'Remove link'),
  );

  function showLinkInfo(link) {
    clickedLink = link;
    linkAddress.textContent = link.getAttribute('href');
    openLink.href = link.href;
    linkInfo.hidden = !link;
  }

  function removeLink() {
    if (!clickedLink) return;
    const range = document.createRange();
    range.selectNodeContents(clickedLink);
    area.focus();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.execCommand('unlink');
    linkInfo.hidden = true;
    clickedLink = null;
  }

  area.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link || !area.contains(link)) {
      linkInfo.hidden = true;
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
      return;
    }
    showLinkInfo(link);
  });
  area.addEventListener('input', () => { linkInfo.hidden = true; });

  function run(command) {
    if (command === 'link') {
      openLinkRow();
      return;
    }
    area.focus();
    document.execCommand(command);
    showActive();
  }

  // Links are drawn bold and underlined, so those two buttons ignore that look inside a link.
  const LINK_LOOK = new Set(['bold', 'underline']);

  function showActive() {
    const anchor = getSelection()?.anchorNode;
    const inLink = Boolean(anchor && area.contains(anchor) && (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('a'));
    TOOLS.forEach((tool, i) => {
      const on = tool.command !== 'link' && !(inLink && LINK_LOOK.has(tool.command))
        && area.contains(anchor) && document.queryCommandState(tool.command);
      buttons[i].classList.toggle('on', on);
      buttons[i].setAttribute('aria-pressed', String(on));
    });
  }

  area.addEventListener('paste', (event) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  area.addEventListener('keyup', showActive);
  area.addEventListener('mouseup', showActive);
  area.addEventListener('focus', showActive);

  return {
    element: el('div', { class: 'rich-editor' },
      el('div', { class: 'rich-toolbar', role: 'toolbar', 'aria-label': `${label} formatting` }, buttons),
      linkRow,
      linkInfo,
      area,
    ),
    getHtml: () => area.innerHTML,
  };
}
