const MIN_DELAY = 120;
const MAX_DELAY = 350;
export const SETTLE_DELAY_MS = 250;

let lastEditAt = 0;
let typingVelocity = 0;

export function noteTypingVelocity() {
  const now = Date.now();
  if (lastEditAt > 0) {
    const gap = now - lastEditAt;
    typingVelocity = typingVelocity * 0.7 + gap * 0.3;
  }
  lastEditAt = now;
}

export function computeSettleDelayMs(syntaxSnap, { preludePaths = 0 } = {}) {
  const docLen = syntaxSnap?.doc?.length ?? 0;
  const sizeFactor = Math.min(1, docLen / 12000);
  const suiteFactor = preludePaths > 0 ? 0.25 : 0;
  const fastTyping = typingVelocity > 0 && typingVelocity < 180;
  const base = MIN_DELAY + (MAX_DELAY - MIN_DELAY) * (sizeFactor + suiteFactor);
  const delay = fastTyping ? Math.max(MIN_DELAY, base * 0.75) : base;
  return Math.round(Math.min(MAX_DELAY, Math.max(MIN_DELAY, delay)));
}

export function resetSettleDelayState() {
  lastEditAt = 0;
  typingVelocity = 0;
}
