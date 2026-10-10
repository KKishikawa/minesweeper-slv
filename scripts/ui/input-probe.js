// DevTools Snippet: run after loading the app; no network/storage writes.
(() => {
  window.inputProbe?.stop();
  const events = [];
  const restorers = [];
  let active = true;
  const record = (type, data = {}) => { if (active) events.push({ time: performance.now(), type, ...data }); };
  const kind = canvas => canvas.closest('.board-surface') ? 'board' : canvas.dataset.symbol ?? 'other';
  for (const property of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
    Object.defineProperty(HTMLCanvasElement.prototype, property, { ...descriptor, set(value) {
      record('canvas-size', { canvas: kind(this), property, before: this[property], after: value });
      descriptor.set.call(this, value);
    } });
    restorers.push(() => Object.defineProperty(HTMLCanvasElement.prototype, property, descriptor));
  }
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    record('draw', { canvas: kind(this.canvas) });
    return clear.apply(this, args);
  };
  restorers.push(() => { CanvasRenderingContext2D.prototype.clearRect = clear; });
  const listen = (name, listener) => {
    document.addEventListener(name, listener, true);
    restorers.push(() => document.removeEventListener(name, listener, true));
  };
  listen('keydown', event => record('key', { key: event.key, cell: event.target.dataset?.cell }));
  listen('focusin', event => record('focus', { cell: event.target.dataset?.cell, tag: event.target.tagName }));
  listen('scroll', () => record('scroll', { x: scrollX, y: scrollY }));
  const layoutObserver = PerformanceObserver.supportedEntryTypes.includes('layout-shift') ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) record('layout-shift', {
      value: entry.value, recentInput: entry.hadRecentInput,
      sources: entry.sources?.map(source => ({ class: source.node?.className, before: source.previousRect, after: source.currentRect })),
    });
  }) : null;
  layoutObserver?.observe({ type: 'layout-shift', buffered: false });
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) record('resize', { target: entry.target.className, width: entry.contentRect.width, height: entry.contentRect.height });
  });
  const observe = () => document.querySelectorAll('.workspace, .editor-mount, .result-card').forEach(el => resize.observe(el));
  let previous = '';
  let frame;
  function sample() {
    observe();
    const rect = selector => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    };
    const state = { phase: document.querySelector('.result-card')?.dataset.phase,
      pageHeight: document.documentElement.scrollHeight, scrollX, scrollY,
      focus: document.activeElement?.getAttribute('data-cell'),
      result: rect('.result-card'), board: rect('.board-surface'), workspace: rect('.workspace') };
    const serialized = JSON.stringify(state);
    if (serialized !== previous) { record('frame', state); previous = serialized; }
    if (active) frame = requestAnimationFrame(sample);
  }
  frame = requestAnimationFrame(sample);
  window.inputProbe = {
    reset() { events.length = 0; previous = ''; },
    report() { return { url: location.href, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      layoutShiftSupported: Boolean(layoutObserver), events: events.slice() }; },
    stop() { active = false; cancelAnimationFrame(frame); resize.disconnect(); layoutObserver?.disconnect(); restorers.reverse().forEach(restore => restore()); },
  };
})();
