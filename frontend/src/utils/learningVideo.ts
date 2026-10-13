export function learningVideoEmbed(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? null;
    if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1] ?? null;
    }
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    if (['vimeo.com','www.vimeo.com'].includes(host)) {
      const vimeo = url.pathname.match(/^\/(\d{1,12})\/?$/)?.[1];
      if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
    }
    return null;
  } catch { return null; }
}
