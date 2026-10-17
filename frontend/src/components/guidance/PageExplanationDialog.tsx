import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Native modal top layer prevents background interaction. The explicit focus
 * loop also handles keyboard wrapping consistently across supported browsers. */
export default function PageExplanationDialog({ title, onClose, children, triggerRef, navigatingRef, eyebrow = 'About this page', toolbar, bodyRef }: {
  title: string; onClose: () => void; children: ReactNode; triggerRef: RefObject<HTMLButtonElement | null>; navigatingRef: RefObject<boolean>;
  eyebrow?: string;
  /** Pinned under the header, outside the scrolling body: e.g. section tabs. */
  toolbar?: ReactNode;
  /** The scrolling body, so a caller can reset its scroll (e.g. on a tab change). */
  bodyRef?: RefObject<HTMLDivElement | null>;
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
    className="fixed inset-0 m-auto max-h-[min(90dvh,56rem)] w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-[24px] border-0 bg-white p-0 text-forest-900 shadow-[0_18px_48px_rgba(17,35,32,0.16)] backdrop:bg-forest-900/50">
    <div className="flex max-h-[min(90dvh,56rem)] flex-col">
      <header className="hero-card flex shrink-0 items-start justify-between gap-3 rounded-none px-5 py-5 sm:px-6">
        <div>
          <p className="band-eyebrow">{eyebrow}</p>
          <h2 id={titleId} className="mt-1 text-xl font-bold tracking-[-0.01em] text-white">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"><X className="h-4 w-4" aria-hidden="true" /></button>
      </header>
      {toolbar && <div className="shrink-0 border-b border-forest-900/10 px-5 py-3 sm:px-6">{toolbar}</div>}
      <div ref={bodyRef} className="min-h-0 space-y-8 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">{children}</div>
      <footer className="flex shrink-0 justify-end border-t border-forest-900/10 px-5 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="as-btn as-btn-sm as-btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Got it</button>
      </footer>
    </div>
  </dialog>, document.body);
}
