import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AssetsAnalysisLoading from '../components/dashboard/AssetsAnalysisLoading';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import type { AnalysisLoadingStage, AnalysisProgress } from '../types/analysisLifecycle';

// Render the real components using the existing Node runner. These tests cover the
// loading screen's public output, not the Assets page's async stage selection.
function render(stage: AnalysisLoadingStage, progress?: AnalysisProgress | null) {
  return renderToStaticMarkup(createElement(AssetsAnalysisLoading, { stage, progress }));
}
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const progress = (phase: AnalysisProgress['phase'], active: string[] = []): AnalysisProgress => ({ phase, active, message: '' });
const detailRows = (html: string) => [...(html.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);

describe('Assets analysis loading screen', () => {
  it.each([
    ['preparing', 'Preparing analysis', ['active', 'pending', 'pending']],
    ['processing', 'Processing analysis', ['complete', 'active', 'pending']],
    ['results', 'Loading results', ['complete', 'complete', 'active']],
  ] as const)('announces the %s stage and exposes the correct lifecycle order', (stage, heading, statuses) => {
    const html = render(stage);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/role="status"[^>]*aria-atomic="true"/);
    expect(html.match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]).toBe(heading);
    const lifecycle = html.match(/<ol\b[^>]*aria-label="Analysis lifecycle"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
    const steps = [...lifecycle.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
    expect(steps.map(text)).toEqual([
      `Preparing analysis — ${statuses[0]}`,
      `Processing analysis — ${statuses[1]}`,
      `Loading results — ${statuses[2]}`,
    ]);
    expect(steps.filter(step => step.includes('aria-current="step"'))).toHaveLength(1);
    expect(text(steps.find(step => step.includes('aria-current="step"'))!)).toBe(`${heading} — active`);
  });

  it.each([undefined, null])('renders safely before live progress arrives (%s)', liveProgress => {
    const html = render('processing', liveProgress);
    expect(detailRows(html).map(text)).toEqual(['Analysing market data', 'Analysing sentiment', 'Synthesising results', 'Preparing results']);
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html).toContain('aria-live="polite"');
  });

  it.each([
    ['initializing', [], []],
    ['analysis', ['quant', 'sentiment'], []],
    ['analysis', ['sentiment'], ['Analysing market data']],
    ['analysis', ['quant'], ['Analysing sentiment']],
    ['synthesis', [], ['Analysing market data', 'Analysing sentiment']],
    ['output', [], ['Analysing market data', 'Analysing sentiment', 'Synthesising results']],
    ['complete', [], ['Analysing market data', 'Analysing sentiment', 'Synthesising results', 'Preparing results']],
  ] as const)('shows completion checkmarks for finished work during %s (%j)', (phase, active, completed) => {
    const rows = detailRows(render('processing', progress(phase, [...active])));
    // Checkmarks are the screen's visible completion indicator; do not assert colours/layout.
    expect(rows.filter(row => row.includes('lucide-check')).map(text)).toEqual(completed);
  });

  it('marks preparation complete once selection has finished', () => {
    const initializing = render('preparing', progress('initializing'));
    const selected = render('preparing', { ...progress('initializing'), message: 'Selected 12 assets' });
    expect(detailRows(initializing).map(text)).toEqual(['Preparing your analysis']);
    expect(detailRows(initializing)[0]).not.toContain('lucide-check');
    expect(detailRows(selected)[0]).toContain('lucide-check');
  });

  it('shows only result-loading details after analysis completes', () => {
    const html = render('results', progress('complete'));
    expect(detailRows(html).map(text)).toEqual(['Loading results']);
    expect(html).not.toContain('Analysing market data');
    expect(text(html)).toContain('results appear automatically');
    expect(html).not.toContain('<button');
  });

  it('keeps decorative placeholders hidden from assistive technology', () => {
    const html = render('preparing');
    const afterStatusPanel = html.slice(html.indexOf('</section>') + '</section>'.length);
    expect(afterStatusPanel).toMatch(/^<\/div><div aria-hidden="true"/);
  });
});

describe('Assets recommendation-loading fallback', () => {
  it('renders loading feedback without interactive placeholder controls', () => {
    const html = renderToStaticMarkup(createElement(DashboardSkeleton));
    expect(text(html)).toBe('Loading...');
    expect(html).not.toMatch(/<(button|input|a)\b/);
  });
});
