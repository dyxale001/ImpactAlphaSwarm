import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Native modal top layer prevents background interaction. The explicit focus
 * loop also handles keyboard wrapping consistently across supported browsers. */
export default function PageExplanationDialog({ title, onClose, children, triggerRef, navigatingRef }: {
  title: string; onClose: () => void; children: ReactNode; triggerRef: RefObject<HTMLButtonElement | null>; navigatingRef: RefObject<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = triggerRef.current;
    const main = document.querySelector('main');
    const bodyOverflow = document.body.style.overflow;
    const mainOverflow = main?.style.overflow;
    const mainScroll = main?.scrollTop;
    document.body.style.overflow = 'hidden';
    if (main) main.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      if (main) {
        main.style.overflow = mainOverflow ?? '';
        main.scrollTop = navigatingRef.current ? 0 : mainScroll ?? 0;
      }
      if (!navigatingRef.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [triggerRef, navigatingRef]);

  return createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('*')].filter(element => element.matches('button:not(:disabled), a[href], [tabindex="0"]'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    className="fixed inset-0 m-auto max-h-[min(90dvh,56rem)] w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-2xl border-0 bg-brand-card p-0 text-brand-fg shadow-xl backdrop:bg-forest-900/50">
    <div className="flex max-h-[min(90dvh,56rem)] flex-col">
      <header className="hero-card flex shrink-0 items-start justify-between gap-3 rounded-none px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">About this page</p>
          <h2 id={titleId} className="mt-0.5 text-lg font-bold tracking-[-0.015em] text-brand-bg">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="rounded-full p-1.5 text-brand-bg/70 hover:bg-white/10 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"><X className="h-4 w-4" aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 space-y-7 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">{children}</div>
      <footer className="flex shrink-0 justify-end border-t border-brand-border/60 px-5 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="rounded-full bg-brand-primary px-4 py-2 text-xs font-bold text-brand-bg hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Got it</button>
      </footer>
    </div>
  </dialog>, document.body);
}
