const runtime = {
  openWindow(url, target, allowReferrer = false) {
    return window.open(url, target, allowReferrer ? "noopener" : "noopener noreferrer");
  },
  refreshPage() {
    window.location.reload();
  },
  async hardReset() {
    return await window.__tldraw__hardReset?.();
  }
};
function setRuntimeOverrides(input) {
  Object.assign(runtime, input);
}
export {
  runtime,
  setRuntimeOverrides
};
//# sourceMappingURL=runtime.mjs.map
