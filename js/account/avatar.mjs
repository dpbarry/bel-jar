/**
 * The face in the header (js/account/account.mjs, css/account.css).
 *
 * GitHub draws someone without a picture as an identicon: a 5x5 pattern of one
 * colour on a light square, a twelfth of its width for margin. A circle that
 * fills the square cuts the pattern's corner blocks off, and at header size
 * what is left reads as a blob. So an identicon is inset on its own background,
 * which shows the whole pattern; a photo fills the circle as ever. Which one it
 * is comes from the pixels: GitHub's avatar host allows reading them (CORS *),
 * and anything that cannot be read stays a photo.
 */

const seen = new Map(); // src -> background colour, or null for a photo

/**
 * The background colour of an identicon, as `rgb(r, g, b)`, or null when the
 * image is not one: a light margin band all one colour, and inside it one
 * colour besides. `data` is RGBA, `size` x `size`.
 */
export function identiconBackground(data, size) {
  if (!data || !size || data.length < size * size * 4) return null;
  const px = (x, y) => (y * size + x) * 4;
  const b = px(0, 0);
  const bg = [data[b], data[b + 1], data[b + 2]];
  if (data[b + 3] < 250 || bg[0] + bg[1] + bg[2] < 600) return null; // light and opaque
  const near = (i, c) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]) <= 12;
  // A pixel of slack at the pattern's edge for resampling.
  const band = Math.max(1, Math.round(size / 12) - 1);
  let ink = null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = px(x, y);
      if (near(i, bg)) continue;
      if (x < band || y < band || x >= size - band || y >= size - band) return null;
      if (!ink) ink = [data[i], data[i + 1], data[i + 2]];
      else if (!near(i, ink)) return null;
    }
  }
  return ink ? `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})` : null;
}

function read(img) {
  const size = img.naturalWidth;
  if (!size || size !== img.naturalHeight || size > 1024) return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  return identiconBackground(cx.getImageData(0, 0, size, size).data, size);
}

function apply(img, bg) {
  if (!bg) return;
  img.classList.add('is-identicon');
  img.style.setProperty('--avatar-bg', bg);
}

/** Once the picture is in: an identicon is marked to be inset (css/account.css). */
export function decorateAvatar(img) {
  const src = img.currentSrc || img.src;
  if (seen.has(src)) {
    apply(img, seen.get(src));
    return;
  }
  let bg = null;
  try { bg = read(img); } catch (_) { /* unreadable: a photo */ }
  seen.set(src, bg);
  apply(img, bg);
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
