/** 窗口尺寸变化时通知订阅方（虚拟列表内多卡片共享一条监听） */
const subscribers = new Set();
let listening = false;
let rafId = 0;

function flush() {
  rafId = 0;
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

function onWindowResize() {
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}

export function subscribeLayoutResize(fn) {
  subscribers.add(fn);
  if (!listening) {
    listening = true;
    window.addEventListener('resize', onWindowResize, { passive: true });
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && listening) {
      window.removeEventListener('resize', onWindowResize);
      listening = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
  };
}
