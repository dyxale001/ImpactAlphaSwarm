import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpotlightTour } from '../../hooks/useSpotlightTour';
import { revealSidebarTarget, spotlightPosition } from '../../utils/spotlightPosition';
import { spotlightSteps, type SpotlightStep } from '../../utils/spotlightTour';

function Tour({ steps, dismiss }: { steps: SpotlightStep[]; dismiss: (status: 'skipped' | 'finished') => void }) {
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; highlight?: { left: number; top: number; width: number; height: number }; mobile: boolean; missing: boolean }>({ left: 16, top: 80, mobile: false, missing: false });
  const cardRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dismissRef = useRef(dismiss); dismissRef.current = dismiss;
  const id = useId();
  const current = steps[step];
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector('aside');
    const sidebarScroll = sidebar?.scrollTop;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); dismissRef.current('skipped'); } };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (sidebar && sidebarScroll !== undefined) sidebar.scrollTop = sidebarScroll;
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>(window.innerWidth >= 1024 ? 'aside [data-spotlight-nav="/dashboard"]' : '[data-spotlight="mobile-navigation"]')?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [step]);
  useLayoutEffect(() => {
    function measure(reveal = false) {
      const mobile = window.innerWidth < 1024;
      const navigation = current.target === 'navigation';
      const assistant = current.target === 'assistant';
      const selector = assistant ? '[data-spotlight="floating-assistant"]'
        : navigation ? mobile ? '[data-spotlight="mobile-navigation"]' : `aside [data-spotlight-nav="${current.path}"]`
        : '[data-spotlight="dashboard"]';
      const target = document.querySelector<HTMLElement>(selector);
      if (reveal && navigation && !mobile && target) revealSidebarTarget(target);
      const rect = target?.getBoundingClientRect();
      const region = navigation && !mobile ? target?.closest('aside')?.getBoundingClientRect() : undefined;
      const insideSidebar = !region?.height || (rect && rect.top >= region.top && rect.bottom <= region.bottom);
      const visible = Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && insideSidebar && !(assistant && target?.getAttribute('aria-expanded') === 'true'));
      const point = spotlightPosition({ rect: visible ? rect : undefined,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        cardHeight: cardRef.current?.getBoundingClientRect().height || 250,
        mobile, navigation, assistant });
      setPosition({ ...point, mobile, missing: !visible,
        highlight: visible && rect ? { left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 } : undefined });
    }
    const onResize = () => measure(true);
    const onScroll = () => measure();
    measure(true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    if (cardRef.current) resizeObserver?.observe(cardRef.current);
    const observer = new MutationObserver(() => measure());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'hidden'] });
    return () => {
      window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll, true);
      resizeObserver?.disconnect(); observer.disconnect();
    };
  }, [current]);
  return createPortal(<>
    {/* The ring around the highlighted item, whose outer shadow shades the rest
        of the page so the item reads as spotlit. It takes no clicks, so the page
        underneath stays usable while the tour is open. */}
    {position.highlight && <div aria-hidden="true" className="pointer-events-none fixed z-[55] rounded-[20px] border-2 border-lime-500 shadow-[0_0_0_4px_rgba(199,242,105,0.35),0_0_0_9999px_rgba(17,35,32,0.32)] transition-[left,top,width,height] duration-200" style={position.highlight} />}
    <section ref={cardRef} role="dialog" aria-modal="false" aria-labelledby={id}
      className="fixed z-[55] w-80 max-w-[calc(100vw_-_2rem)] overflow-y-auto rounded-[20px] border border-forest-900/10 bg-white p-5 text-forest-900 shadow-float"
      style={{ left: position.left, top: position.top, maxHeight: `calc(100dvh - ${position.top + 16}px)` }}>
      <p className="text-xs font-medium text-brand-muted-fg">Quick tour · {step + 1} of {steps.length}</p>
      <h2 ref={headingRef} tabIndex={-1} id={id} className="mt-1.5 text-lg font-bold tracking-[-0.01em] text-forest-900 outline-none">{current.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-forest-900">{current.body}</p>
      {position.mobile && current.target === 'navigation' && <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">Find {current.title} in the navigation menu. You can explore it after the tour; the menu stays closed.</p>}
      {position.missing && current.target === 'assistant' && <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">The quick-help button is not currently available as an opening control. You can finish the tour and use Ask AlphaSwarm in navigation.</p>}
      {position.missing && !position.mobile && current.target === 'navigation' && <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">This entry is not currently visible. Find {current.title} in navigation when it is available.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => dismiss('skipped')} className="min-h-11 rounded-full px-1 text-xs font-semibold text-brand-muted-fg underline underline-offset-4 hover:text-forest-900 focus-visible:outline-2 focus-visible:outline-forest-700">Skip tour</button>
        {step > 0 && <button type="button" onClick={() => setStep(value => value - 1)} className="as-btn as-btn-sm as-btn-secondary">Back</button>}
        <button type="button" onClick={() => step === steps.length - 1 ? dismiss('finished') : setStep(value => value + 1)} className="as-btn as-btn-sm as-btn-primary ml-auto">{step === steps.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </section>
  </>, document.body);
}

export default function UserSpotlightTour() {
  const { open, error, dismiss, clearError, userId } = useSpotlightTour();
  if (error) return <div role="status" className="rounded-[12px] border border-forest-900/10 bg-white p-3 text-xs text-brand-muted-fg">{error} <button type="button" onClick={clearError} className="min-h-11 rounded px-2 font-semibold text-forest-700 underline focus-visible:outline-2 focus-visible:outline-forest-700">Dismiss</button></div>;
  if (!open) return null;
  return <Tour key={userId} steps={spotlightSteps()} dismiss={status => void dismiss(status)} />;
}
