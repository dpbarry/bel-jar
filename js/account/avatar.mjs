/**
 * The face in the header (js/account/account.mjs, css/account.css).
 *
 * GitHub draws someone without a picture as an identicon: a 5x5 pattern of one
 * colour on a light square, a twelfth of its width for margin. A circle that
 * fills the square cuts the pattern's corner blocks off, and at header size
 * what is left reads as a blob. So an identicon is inset on its own background,
 * which shows the whole pattern, and the ring around it is the pattern's own
 * colour. A photo fills the circle as ever. Which one it is comes from the
 * pixels: GitHub's avatar host allows reading them (CORS *), and anything that
 * cannot be read stays a photo.
 */

const seen = new Map(); // src -> { background, ink }, or null for a photo

function rgb(c) {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * An identicon's ground and subject, or null when the image is not one: a
 * light margin band all one colour, and inside it one colour besides. `data`
 * is RGBA, `size` x `size`. Both colours are `rgb(r, g, b)`.
 *
 * The subject is the most common colour that is not the ground. A plain count
 * crowns the ground, which fills most of the square, and the first pixel that
 * differs is often a blend where a block was resampled. The blocks' interiors
 * outnumber that fringe, so the mode is the colour GitHub painted.
 */
export function identiconColours(data, size) {
  if (!data || !size || data.length < size * size * 4) return null;
  const px = (x, y) => (y * size + x) * 4;
  const b = px(0, 0);
  const bg = [data[b], data[b + 1], data[b + 2]];
  if (data[b + 3] < 250 || bg[0] + bg[1] + bg[2] < 600) return null; // light and opaque
  const near = (i, c) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]) <= 12;
  // A pixel of slack at the pattern's edge for resampling.
  const band = Math.max(1, Math.round(size / 12) - 1);
  const counts = new Map();
  let ink = null;
  let bestKey = 0;
  let bestN = 0;
  let bestFar = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = px(x, y);
      if (near(i, bg)) continue;
      if (x < band || y < band || x >= size - band || y >= size - band) return null;
      if (!ink) ink = [data[i], data[i + 1], data[i + 2]];
      else if (!near(i, ink)) return null;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      if (n < bestN) continue;
      const far = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (n > bestN || far > bestFar) {
        bestN = n;
        bestFar = far;
        bestKey = key;
      }
    }
  }
  if (!ink) return null;
  return {
    background: rgb(bg),
    ink: rgb([(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255]),
  };
}

/** The ground colour alone, as `rgb(r, g, b)`, or null when it is not an identicon. */
export function identiconBackground(data, size) {
  const colours = identiconColours(data, size);
  return colours ? colours.background : null;
}

function read(img) {
  const size = img.naturalWidth;
  if (!size || size !== img.naturalHeight || size > 1024) return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  return identiconColours(cx.getImageData(0, 0, size, size).data, size);
}

function apply(img, colours) {
  if (!colours) return;
  img.classList.add('is-identicon');
  img.style.setProperty('--avatar-bg', colours.background);
  img.style.setProperty('--avatar-ink', colours.ink);
}

/** Once the picture is in: an identicon is marked to be inset (css/account.css). */
export function decorateAvatar(img) {
  const src = img.currentSrc || img.src;
  if (seen.has(src)) {
    apply(img, seen.get(src));
    return;
  }
  let colours = null;
  try { colours = read(img); } catch (_) { /* unreadable: a photo */ }
  seen.set(src, colours);
  apply(img, colours);
}

function motionHeld() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return false;
  if (root.classList.contains('jar-motion-full')) return false;
  if (root.classList.contains('jar-motion-reduce')) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** True once an image can be painted, false if it failed. Anything else is ready. */
function whenPaintable(face) {
  if (!face || face.tagName !== 'IMG') return Promise.resolve(true);
  if (typeof face.decode === 'function') return face.decode().then(() => true, () => false);
  if (face.complete) return Promise.resolve(face.naturalWidth > 0);
  return new Promise((resolve) => {
    face.addEventListener('load', () => resolve(true), { once: true });
    face.addEventListener('error', () => resolve(false), { once: true });
  });
}

/**
 * Draw `face` in over the placeholder the button shipped with. False when
 * there is nothing to draw over, or motion is held back: the caller swaps at
 * once. The picture waits until its pixels are ready, so an identicon's ring
 * does not fade in grey and then jump. `onFail` runs when the picture cannot
 * be painted (account.mjs puts the initial there).
 */
export function revealAvatar(btn, face, onFail) {
  const prior = btn && btn.querySelector(':scope > .account-avatar--placeholder');
  if (btn && btn._avatarReveal) return true;
  if (!prior || motionHeld()) return false;
  const token = {};
  btn._avatarReveal = token;
  face.classList.add('is-arriving');
  let settled = false;
  const alive = () => btn._avatarReveal === token;
  const finish = () => {
    if (settled || !alive()) return;
    settled = true;
    btn._avatarReveal = null;
    face.classList.remove('is-arriving', 'is-shown');
    if (prior.isConnected) prior.remove();
  };
  const fail = () => {
    if (settled || !alive()) return;
    settled = true;
    btn._avatarReveal = null;
    if (onFail) onFail();
  };
  const start = () => {
    if (!alive()) return;
    if (!prior.isConnected) { btn._avatarReveal = null; return; }
    if (face.tagName === 'IMG' && face.complete && face.naturalWidth) decorateAvatar(face);
    btn.appendChild(face);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!alive() || !face.isConnected) {
        if (alive()) btn._avatarReveal = null;
        return;
      }
      face.classList.add('is-shown');
      face.addEventListener('transitionend', (ev) => {
        if (ev.target === face && ev.propertyName === 'opacity') finish();
      });
      // The fade is 400ms (css/account.css). This only collects one that never reports its end.
      window.setTimeout(finish, 800);
    }));
  };
  whenPaintable(face).then((ok) => { (ok ? start : fail)(); });
  return true;
}

/** An <img> for `src` that marks itself once loaded. */
export function avatarImage(src, cls) {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  // Read as CORS so its pixels can be read: GitHub's avatar host allows it.
  img.crossOrigin = 'anonymous';
  if (seen.has(src)) apply(img, seen.get(src));
  else img.addEventListener('load', () => decorateAvatar(img), { once: true });
  img.src = src;
  return img;
}
