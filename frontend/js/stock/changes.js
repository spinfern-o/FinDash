/* A small wake-up signal, without business records, keeps open pages in step. */
export function announceStockChange(owner) {
  try {
    localStorage.setItem('findash-stock-change', JSON.stringify({ owner: owner || null, at: crypto.randomUUID() }));
  } catch { /* Focus refresh also works when browser storage is unavailable. */ }
  window.dispatchEvent(new Event('findash-stock-saved'));
}

/* Reload only when it is safe: a form or unsaved edit must not be replaced. */
export function watchStockChanges(refresh) {
  window.addEventListener('storage', function (event) {
    if (event.key === 'findash-stock-change' || event.key === 'findash-stock-guest-v1') { refresh(); }
  });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { refresh(); }
  });
}
