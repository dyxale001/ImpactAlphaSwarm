# Marketing UI Kit — Verdant Design System

A pixel-faithful recreation of the source UI Board's marketing landing page, broken into reusable React components. Lives at `ui_kits/marketing/index.html`.

## Files

| File | Role |
|---|---|
| `index.html` | Page shell — loads React + Babel + Lucide, mounts the `<App>` |
| `styles.css` | All component styles. Plain CSS (no Tailwind dependency) so cards stay editable |
| `Primitives.jsx` | `Token`, `Pill`, `Eyebrow`, `Stars`, `Icon` — used everywhere |
| `Header.jsx` | Top bar — wordmark + center nav-pill + Sign In |
| `Hero.jsx` | Eyebrow → display headline → email capture + phone mock in lime block |
| `Features.jsx` | Feature ribbon (`Invoices ⚡ Reports …`) + 3-up "Comprehensive Feature Suite" |
| `Testimonials.jsx` | 5-up testimonial grid + integrations radial |
| `FAQ.jsx` | Search + accordion + dark CTA banner + brand-burst + footer pills |

## Notes

- **Icons:** Substituted with Lucide CDN. The original uses bespoke outline glyphs at the same stroke weight.
- **Photography:** Avatars and the video tile are coloured placeholders. Drop in real imagery via the `image-slot.js` component if needed.
- **Phone mock:** Hand-built from CSS — close to source but lossy. For production use a real device frame.
- **Tweaks:** None wired in yet. Add `<TweaksPanel>` if the user wants to toggle dark/light or accent variants.

## What's intentionally NOT replicated

- The case-study chrome (right-edge "Tools / Save / Share / Appreciate" rail and the silhouette photo header).
- The third-party tool logos in the integrations section are reduced to coloured wordmarks — request real SVGs if needed.
- The hero photography (people working, woman with phone) is omitted from the kit — the source uses them inside the case-study, not the product page proper.
