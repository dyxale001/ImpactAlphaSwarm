/** A visibility-only timer. Each notification owns a fresh countdown. */
export function notificationCountdown(onDismiss: () => void, duration = 15_000) {
  let remaining = duration;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const pause = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };
  const resume = () => {
    if (disposed || timer !== undefined) return;
    startedAt = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      disposed = true;
      onDismiss();
    }, remaining);
  };
  const dispose = () => { pause(); disposed = true; };
  resume();
  return { pause, resume, dispose };
}
