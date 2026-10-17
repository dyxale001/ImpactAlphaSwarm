import { useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import PageExplanationDialog from '../guidance/PageExplanationDialog';
import { METHODOLOGY_CAVEAT, METHODOLOGY_SECTIONS, type MethodologyKey } from './methodologySections';

/**
 * "How is this calculated?": a button that opens the methodology in a dialog, one
 * tab per section of the stock page, starting on the section it was opened from.
 */
export default function MethodologyDialog({ section }: { section: MethodologyKey }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MethodologyKey>(section);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const current = METHODOLOGY_SECTIONS.find(s => s.key === active) ?? METHODOLOGY_SECTIONS[0];

  const choose = (key: MethodologyKey) => {
    setActive(key);
    // Each tab starts at its own top, not wherever the last one was scrolled to.
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setActive(section); setOpen(true); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="as-btn as-btn-sm as-btn-secondary shrink-0"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">How is this calculated?</span>
        <span className="sm:hidden">How?</span>
      </button>
      {open && (
        <PageExplanationDialog
          title={current.title}
          eyebrow="How it's calculated"
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
          navigatingRef={navigatingRef}
          bodyRef={bodyRef}
          toolbar={
            // The stock page's own tabs, phone grid included, so each section is
            // found under the name it has on the page.
            <div role="tablist" aria-label="Methodology sections"
              className="as-tabs grid w-full grid-cols-3 rounded-[20px] sm:flex sm:rounded-full">
              {METHODOLOGY_SECTIONS.map(s => (
                <button key={s.key} type="button" role="tab" aria-selected={s.key === active}
                  onClick={event => { choose(s.key); event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }}
                  className="as-tab shrink-0 px-2 sm:px-4">
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
            </div>
          }
        >
          <current.Content />
          <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">{METHODOLOGY_CAVEAT}</p>
        </PageExplanationDialog>
      )}
    </>
  );
}
