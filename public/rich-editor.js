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

  function addLink() {
    const typed = window.prompt('Paste the link (like https://example.com/gift)');
    if (!typed?.trim()) return;
    const href = /^(https?:|mailto:)/i.test(typed.trim()) ? typed.trim() : `https://${typed.trim()}`;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && area.contains(selection.anchorNode)) document.execCommand('createLink', false, href);
    else document.execCommand('insertHTML', false, `<a href="${escape(href)}">${escape(typed.trim())}</a>&nbsp;`);
  }

  function run(command) {
    area.focus();
    if (command === 'link') addLink();
    else document.execCommand(command);
    showActive();
  }

  function showActive() {
    TOOLS.forEach((tool, i) => {
      const on = tool.command !== 'link' && area.contains(getSelection()?.anchorNode) && document.queryCommandState(tool.command);
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
      area,
    ),
    getHtml: () => area.innerHTML,
  };
}
