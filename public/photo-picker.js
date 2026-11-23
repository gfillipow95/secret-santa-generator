import { el, toast } from './common.js';
import { edgeBlackShare, whitenEdgeBlack } from './white-background.js';

const VIEW = 220;
const PREVIEW = 96;
const OUTPUT = 400;
const MIN_ZOOM = 0.4;
const MAX_SOURCE = 1600;
// Naming each format, rather than image/*, stops iPhones converting pictures to JPEG, which turns see-through backgrounds black.
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif';

/** Copies the picture onto a canvas (shrunk if huge) so its pixels can be cleaned up. */
function toCanvas(image) {
  const scale = Math.min(1, MAX_SOURCE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function whitened(canvas) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d');
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  whitenEdgeBlack(pixels);
  ctx.putImageData(pixels, 0, 0);
  return copy;
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("That file isn't a photo we can use. Try a JPEG or PNG."));
  image.src = src;
});

/**
 * Opens the photo picker for one person. Call it from a click: without a
 * current photo or a gallery it goes straight to the file chooser. Gallery
 * pictures are cropped and saved just like an uploaded photo. `save` gets a
 * square JPEG blob; `remove` is offered only when they already have a photo.
 */
export function openPhotoPicker({ name, photo, gallery = [], save, remove }) {
  const fileInput = el('input', { type: 'file', accept: ACCEPT, hidden: true });
  const crop = el('canvas', { class: 'crop', width: VIEW * devicePixelRatio, height: VIEW * devicePixelRatio, 'aria-label': `Drag to position ${name}'s photo` });
  const preview = el('canvas', { class: 'pic', width: PREVIEW * devicePixelRatio, height: PREVIEW * devicePixelRatio });
  const zoomInput = el('input', { type: 'range', min: MIN_ZOOM, max: 3, step: 0.01, value: 1, 'aria-label': 'Zoom' });
  const whiteInput = el('input', { type: 'checkbox', checked: true });
  const whiteToggle = el('label', { class: 'white-toggle', hidden: true }, whiteInput, 'White background');
  const saveButton = el('button', { class: 'btn', type: 'button' }, 'Save photo');
  const chooseButton = el('button', { class: 'btn gold', type: 'button', onclick: () => fileInput.click() }, 'Choose another');

  let image = null;
  let original = null;
  let cleaned = null;
  let zoom = 1;
  let x = 0;
  let y = 0;

  const coverScale = () => VIEW / Math.min(image.width, image.height);
  const size = () => ({ w: image.width * coverScale() * zoom, h: image.height * coverScale() * zoom });

  // Zoomed in, the picture must cover the frame; zoomed out, it must stay inside it.
  const keepIn = (offset, length) => Math.min(Math.max(offset, Math.min(0, VIEW - length)), Math.max(0, VIEW - length));
  const clamp = () => {
    const { w, h } = size();
    x = keepIn(x, w);
    y = keepIn(y, h);
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

  let source = 'upload';
  const show = async (src, from = 'upload') => {
    try {
      original = toCanvas(await loadImage(src));
    } catch (error) {
      toast(error.message, { error: true });
      return;
    }
    const blackEdge = edgeBlackShare(original.getContext('2d').getImageData(0, 0, original.width, original.height)) > 0.2;
    cleaned = blackEdge ? whitened(original) : null;
    whiteToggle.hidden = !blackEdge;
    whiteInput.checked = blackEdge;
    image = cleaned ?? original;
    zoom = 1;
    zoomInput.value = 1;
    const { w, h } = size();
    x = (VIEW - w) / 2;
    y = (VIEW - h) / 2;
    draw();
    source = from;
    setView('photo');
    if (!backdrop.isConnected) document.body.append(backdrop);
    saveButton.disabled = false;
  };

  whiteInput.addEventListener('change', () => {
    image = whiteInput.checked ? cleaned : original;
    draw();
  });

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

  const cancelButton = () => el('button', { class: 'btn gold', type: 'button', onclick: close }, 'Cancel');
  const uploadTab = el('button', { type: 'button', onclick: () => fileInput.click() }, 'Upload a photo');
  const galleryTab = el('button', { type: 'button', onclick: () => setView('gallery') }, 'Pick a hamster');
  const tiles = gallery.map((src) => el('button', {
    class: 'tile',
    type: 'button',
    'aria-label': 'Use this hamster',
    onclick: () => show(src, 'gallery'),
  }, el('img', { src, alt: '', loading: 'lazy' })));

  const galleryView = el('div', { class: 'gallery' },
    el('div', { class: 'tiles' }, tiles),
    el('div', { class: 'actions' },
      el('button', { class: 'btn gold', type: 'button', onclick: () => show(gallery[Math.floor(Math.random() * gallery.length)], 'gallery') }, 'Surprise me'),
      cancelButton(),
    ),
  );

  const photoView = el('div', {},
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
      whiteToggle,
      el('div', { class: 'actions' },
        chooseButton,
        removeButton,
        cancelButton(),
        saveButton,
      ),
  );

  function setView(view) {
    photoView.hidden = view !== 'photo';
    galleryView.hidden = view !== 'gallery';
    const hamster = view === 'gallery' || source === 'gallery';
    galleryTab.classList.toggle('on', hamster);
    uploadTab.classList.toggle('on', !hamster);
    galleryTab.setAttribute('aria-pressed', String(hamster));
    uploadTab.setAttribute('aria-pressed', String(!hamster));
  }

  const backdrop = el('div', { class: 'modal', onclick: (event) => { if (event.target === backdrop) close(); } },
    el('section', { class: 'card picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Photo for ${name}` },
      el('h2', {}, `Photo for ${name}`),
      gallery.length > 0 && el('div', { class: 'tabs' }, uploadTab, galleryTab),
      photoView,
      galleryView,
    ),
  );

  fileInput.addEventListener('cancel', () => { if (!backdrop.isConnected) close(); });
  document.body.append(fileInput);
  if (photo) {
    show(photo);
  } else if (gallery.length > 0) {
    setView('gallery');
    document.body.append(backdrop);
  } else {
    fileInput.click();
  }
}
