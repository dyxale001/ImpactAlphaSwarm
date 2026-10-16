type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
export function spotlightPosition({ rect, viewportWidth, viewportHeight, cardHeight, mobile, navigation, assistant }: {
  rect?: Rect; viewportWidth: number; viewportHeight: number; cardHeight: number; mobile: boolean; navigation: boolean; assistant: boolean;
}) {
  const margin = 16;
  const width = Math.min(320, Math.max(0, viewportWidth - margin * 2));
  const minTop = mobile ? 72 : margin;
  const maxTop = Math.max(minTop, viewportHeight - cardHeight - margin);
  let left = viewportWidth - width - margin;
  let top = Math.min(80, maxTop);
  if (rect) {
    if (assistant) { left = rect.right - width; top = rect.top - cardHeight - 12; }
    else if (navigation && !mobile) { left = rect.right + 12; top = rect.top; }
    else top = rect.bottom + 12;
  }
  return {
    left: Math.max(margin, Math.min(left, viewportWidth - width - margin)),
    top: Math.max(minTop, Math.min(top, maxTop)),
  };
}

/** Scroll only the sidebar's own overflow region, never the document/main. */
export function revealSidebarTarget(target: HTMLElement) {
  const sidebar = target.closest('aside');
  if (!sidebar) return;
  const region = sidebar.getBoundingClientRect();
  if (region.height <= 0) return;
  const rect = target.getBoundingClientRect();
  if (rect.top < region.top + 8) sidebar.scrollTop -= region.top + 8 - rect.top;
  else if (rect.bottom > region.bottom - 8) sidebar.scrollTop += rect.bottom - region.bottom + 8;
}
