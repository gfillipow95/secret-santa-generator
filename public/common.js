export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Try again?');
  return data;
}

/** Builds DOM nodes. Strings become text nodes, so user-entered names are never parsed as HTML. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.toggle('error', error);
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), error ? 4500 : 2500);
}

export async function copy(text, message = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    window.prompt('Copy this:', text);
  }
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function countdown(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(year, month - 1, day) - today) / 86_400_000);
  if (days > 1) return `${days} sleeps to go`;
  if (days === 1) return 'Tomorrow!';
  if (days === 0) return "It's today!";
  return 'Hope it was merry!';
}

export function exchangeFacts({ budget, date }) {
  return [
    budget && el('span', { class: 'fact' }, `💰 ${budget}`),
    date && el('span', { class: 'fact' }, `📅 ${formatDate(date)}`),
    date && el('span', { class: 'fact' }, `⏳ ${countdown(date)}`),
  ];
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function letItSnow() {
  const canvas = el('canvas', { id: 'snow', 'aria-hidden': 'true' });
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let flakes = [];

  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    const count = Math.min(160, Math.round(innerWidth / 9));
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 2.4 + 0.8) * devicePixelRatio,
      speed: (Math.random() * 0.6 + 0.3) * devicePixelRatio,
      drift: Math.random() * Math.PI * 2,
    }));
  };

  const frame = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (const flake of flakes) {
      flake.y += flake.speed;
      flake.drift += 0.01;
      flake.x += Math.sin(flake.drift) * 0.4 * devicePixelRatio;
      if (flake.y > canvas.height + 5) {
        flake.y = -5;
        flake.x = Math.random() * canvas.width;
      }
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!prefersReducedMotion()) requestAnimationFrame(frame);
  };

  addEventListener('resize', resize);
  resize();
  frame();
}

export function confetti() {
  const canvas = el('canvas', { id: 'confetti', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  const colors = ['#b8322a', '#2e7d4f', '#e9b949', '#fdf6ea', '#e05a4f'];
  const pieces = Array.from({ length: prefersReducedMotion() ? 0 : 180 }, () => ({
    x: canvas.width / 2,
    y: canvas.height * 0.45,
    vx: (Math.random() - 0.5) * 22 * devicePixelRatio,
    vy: (Math.random() * -18 - 6) * devicePixelRatio,
    size: (Math.random() * 7 + 5) * devicePixelRatio,
    spin: Math.random() * Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  const frame = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const piece of pieces) {
      piece.vy += 0.45 * devicePixelRatio;
      piece.vx *= 0.985;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.spin += 0.15;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.spin);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (now - start < 3500) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

const RECENT_KEY = 'secret-santa:organized';

export function rememberExchange(name, adminToken) {
  try {
    const list = recentExchanges().filter((item) => item.adminToken !== adminToken);
    list.unshift({ name, adminToken });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    // Private windows can block storage. The organizer link still works.
  }
}

export function recentExchanges() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}
