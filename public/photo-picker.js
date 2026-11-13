import { el, toast } from './common.js';

const VIEW = 220;
const PREVIEW = 96;
const OUTPUT = 400;

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("That file isn't a photo we can use. Try a JPEG or PNG."));
  image.src = src;
});

/**
 * Opens the photo picker for one person. Without a current photo it goes
 * straight to the file chooser, so call it from a click. `save` gets a
 * square JPEG blob; `remove` is offered only when they already have a photo.
 */
export function openPhotoPicker({ name, photo, save, remove }) {
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const crop = el('canvas', { class: 'crop', width: VIEW * devicePixelRatio, height: VIEW * devicePixelRatio, 'aria-label': `Drag to position ${name}'s photo` });
  const preview = el('canvas', { class: 'pic', width: PREVIEW * devicePixelRatio, height: PREVIEW * devicePixelRatio });
  const zoomInput = el('input', { type: 'range', min: 1, max: 3, step: 0.01, value: 1, 'aria-label': 'Zoom' });
  const saveButton = el('button', { class: 'btn', type: 'button' }, 'Save photo');
  const chooseButton = el('button', { class: 'btn gold', type: 'button', onclick: () => fileInput.click() }, 'Choose another');

  let image = null;
  let zoom = 1;
  let x = 0;
  let y = 0;

  const coverScale = () => VIEW / Math.min(image.width, image.height);
  const size = () => ({ w: image.width * coverScale() * zoom, h: image.height * coverScale() * zoom });

  const clamp = () => {
    const { w, h } = size();
    x = Math.min(0, Math.max(VIEW - w, x));
    y = Math.min(0, Math.max(VIEW - h, y));
  };

  const paint = (canvas) => {
    const ctx = canvas.getContext('2d');
    const f = canvas.width / VIEW;
    const { w, h } = size();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x * f, y * f, w * f, h * f);
  };

  const draw = () => {
    clamp();
    paint(crop);
    paint(preview);
  };

  const show = async (src) => {
    try {
      image = await loadImage(src);
    } catch (error) {
      toast(error.message, { error: true });
      return;
    }
    zoom = 1;
    zoomInput.value = 1;
    const { w, h } = size();
    x = (VIEW - w) / 2;
    y = (VIEW - h) / 2;
    draw();
    if (!backdrop.isConnected) document.body.append(backdrop);
    saveButton.disabled = false;
  };

  zoomInput.addEventListener('input', () => {
    const before = coverScale() * zoom;
    const centerX = (VIEW / 2 - x) / before;
    const centerY = (VIEW / 2 - y) / before;
    zoom = Number(zoomInput.value);
    const after = coverScale() * zoom;
    x = VIEW / 2 - centerX * after;
    y = VIEW / 2 - centerY * after;
    draw();
  });

  let drag = null;
  crop.addEventListener('pointerdown', (event) => {
    crop.setPointerCapture(event.pointerId);
    drag = { px: event.clientX, py: event.clientY, x, y };
  });
  crop.addEventListener('pointermove', (event) => {
    if (!drag) return;
    x = drag.x + event.clientX - drag.px;
    y = drag.y + event.clientY - drag.py;
    draw();
  });
  const endDrag = () => { drag = null; };
  crop.addEventListener('pointerup', endDrag);
  crop.addEventListener('pointercancel', endDrag);

  let objectUrl = null;
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    show(objectUrl);
    fileInput.value = '';
  });

  const close = () => {
    backdrop.remove();
    fileInput.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  const run = async (button, action) => {
    button.disabled = true;
    try {
      await action();
      close();
    } catch (error) {
      toast(error.message, { error: true });
      button.disabled = false;
    }
  };

  saveButton.addEventListener('click', () => run(saveButton, async () => {
    const output = el('canvas', { width: OUTPUT, height: OUTPUT });
    paint(output);
    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.85));
    await save(blob);
  }));

  const removeButton = photo && el('button', { class: 'btn gold', type: 'button' }, 'Remove');
  removeButton?.addEventListener('click', () => run(removeButton, remove));

  const backdrop = el('div', { class: 'modal', onclick: (event) => { if (event.target === backdrop) close(); } },
    el('section', { class: 'card picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Photo for ${name}` },
      el('h2', {}, `Photo for ${name}`),
      el('div', { class: 'picker-body' },
        el('div', {},
          crop,
          el('p', { class: 'hint' }, 'Drag to center their face'),
        ),
        el('div', { class: 'picker-preview' },
          el('p', { class: 'hint' }, 'Their Santa sees'),
          el('div', { class: 'polaroid mini-preview' }, preview, el('span', { class: 'caption' }, name)),
        ),
      ),
      el('label', { class: 'zoom' }, 'Zoom', zoomInput),
      el('div', { class: 'actions' },
        chooseButton,
        removeButton,
        el('button', { class: 'btn gold', type: 'button', onclick: close }, 'Cancel'),
        saveButton,
      ),
    ),
  );

  fileInput.addEventListener('cancel', () => { if (!backdrop.isConnected) close(); });
  document.body.append(fileInput);
  if (photo) show(photo);
  else fileInput.click();
}
