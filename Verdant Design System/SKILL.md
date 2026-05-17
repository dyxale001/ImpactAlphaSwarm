---
name: verdant-design
description: Use this skill to generate well-branded interfaces and assets for Verdant — a fresh, finance-flavored visual system in dark forest green + lime + cream, set in Manrope. Suitable for both production work and throwaway prototypes/mocks/decks/landing pages. Contains essential design guidelines, color tokens, type rules, sample components, and a faithful UI-kit recreation of the source marketing page.
user-invocable: true
---

# Verdant Design System — Skill Manifest

This skill packages the Verdant design system so you can apply it consistently across any artifact: landing pages, dashboards, slides, mocks, throwaway prototypes, or production frontend code.

## Where to start

1. **Read `README.md`** first — it covers brand context, content fundamentals, visual foundations, and iconography in detail. It also points to every other file in the folder.
2. **`colors_and_type.css`** is the single source of truth for tokens. Drop it into any HTML page and you immediately get the system: Manrope type, semantic `h1–h6` bindings, color vars, spacing, radii, shadows, motion. Use it as-is for new throwaway artifacts.
3. **`tailwind.tokens.js`** mirrors the same tokens in a Tailwind-shaped object — drop into `theme.extend`.
4. **`preview/`** contains small specimen cards for each system primitive. Skim them when you need a reminder of what a button, badge, accent card, or icon token looks like.
5. **`ui_kits/marketing/`** is a pixel-faithful recreation of the source UI Board. Lift components from `Header.jsx`, `Hero.jsx`, `Features.jsx`, `Testimonials.jsx`, `FAQ.jsx` for any landing-page work. Read its `README.md` for what is / isn't replicated.

## Usage patterns

**Throwaway HTML mock or prototype:**
- Copy `colors_and_type.css` into your project and `<link>` it.
- Use the semantic vars (`var(--fg-heading)`, `var(--bg-accent)`, `var(--radius-2xl)`).
- For iconography, load Lucide via CDN; default stroke weight 1.8–2.

**Slide deck / static artifact:**
- Same as above. Optionally pull design motifs from the UI kit — the inverse forest banner with lime corner blobs, the lime accent gradient card, the circular forest "token" icons.
- Manrope sizes: 80–112 px for big display, 48–64 px for slide titles, 16–18 px for body.

**Production frontend code:**
- Wire `tailwind.tokens.js` into `theme.extend`.
- Mirror token names: `text-forest-700`, `bg-lime-500`, `rounded-2xl`, `shadow-md`.
- Avoid hardcoded hex values — always go through the scale.

## Brand-tone reminders

- Confident, declarative, second-person ("**Streamline** your spending").
- **Title Case** in display copy; **sentence case** in body; **ALL CAPS** with wide tracking in eyebrows.
- **No emoji.** Icons only.
- Lime is a spice — pills, single CTAs, glow blocks. Never a base.
- Cream `#F8F8F8` is the page surface; white `#FFFFFF` is for raised cards.

## If invoked with no guidance

Ask the user what they want to build or design. Likely options:
- A new marketing landing page → reuse the UI kit's components.
- A product UI screen (dashboard, settings, etc.) → keep the same palette + type but lean on the white card pattern.
- A slide deck → use Manrope Medium at 56–80 px, full-bleed cream background, lime accent blocks where you want emphasis.
- A throwaway one-off → just include `colors_and_type.css` and build with the semantic vars.

Then act as an expert designer, outputting HTML artifacts or production code as appropriate.
