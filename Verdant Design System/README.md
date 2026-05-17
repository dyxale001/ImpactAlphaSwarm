# Verdant Design System

A fresh, finance-flavored visual system built around **dark forest green + lime + cream**, set in **Manrope**. Extracted from a single source UI Board: a concept-rebrand case-study mock for an expense-management product. The system is brand-agnostic and intended for use across product UI, marketing surfaces, and short-form decks.

> Source: `uploads/20260515_145614000_iOS.png` — a vertical UI Board PNG (2741 × 22774). The board explicitly publishes four hex codes and the Manrope type family; all other tokens (tints, shades, spacing, radii, motion) are inferred from observed component patterns.

## Brand at a glance

| Attribute | Value |
|---|---|
| **Type** | Manrope — Light (300), Regular (400), Medium (500), with Semibold (600) reserved for emphasis |
| **Page surface** | `#F8F8F8` cream-white |
| **Heading green** | `#1B3530` (forest) |
| **Body green** | `#112320` (near-black, slightly cooler) |
| **Accent** | `#C7F269` lime — used sparingly: pills, accent CTAs, glow blocks |
| **Inverse surface** | Forest `#112320` with lime accents over it |
| **Tagline tone** | Confident, declarative, second-person ("**Streamline Your Spending Goals**") |
| **Iconography** | Soft outlined glyphs on circular forest "tokens"; bolt `⚡` used as separator |

---

## Index

| Path | What it is |
|---|---|
| `colors_and_type.css` | Single CSS file: CSS variables for color, type, spacing, radii, shadows + semantic h1–h6 bindings. **Start here.** |
| `tailwind.tokens.js` | Same tokens, ready to drop into `theme.extend` in a Tailwind config. |
| `assets/` | Logos, illustration recreations (wordmark, badge, full-bleed gradient block, sample app card). |
| `preview/` | One small HTML card per system primitive — feeds the Design System tab. |
| `ui_kits/marketing/` | Pixel-faithful recreation of the source UI Board (hero, feature suite, testimonials, FAQ, CTA, footer). React/Babel JSX. |
| `SKILL.md` | Cross-compatible Agent Skill manifest so this folder works inside Claude Code as well. |

---

## Content fundamentals

The source voice is **confident, declarative, and short**. Sentences rarely run past 12 words on hero surfaces; supporting copy is concise and feature-led.

**Tone & person**
- Second-person ("**your** spending goals", "**you** need", "easy **expense** tracking"). Never first-person.
- Verbs lead: *Streamline · Simplify · Connect · Manage · Capture · Track · Forward · Make purchases…*
- Confident, not aspirational. Says what the product does, not how it feels.
- Marketing tone is warm-corporate: trustworthy without being stiff. Reviews and testimonials use casual phrasing ("Quick and easy to use…", "Love the email receipt auto-import feature").

**Casing**
- Display copy uses **Title Case** on every meaningful word ("Streamline Your Spending Goals", "Comprehensive Feature Suite", "Frequently Ask Questions").
- Body copy is **sentence case**.
- Eyebrows and meta labels are **ALL CAPS** with wide tracking: `WELCOME TO`, `ESTABLISHED IN 2024`, `PRIVACY POLICY`.
- Brand mark sometimes carries an `®` superscript on the hero ("Goals®").

**Punctuation**
- Em-dashes are used freely in body copy: *"manage spending—all in one app"*. No spaces around the em-dash.
- Pull quotes use stylized opening/closing curly quotes with spaces inside: `" Managing corporate spending… "`.

**Examples to mimic**
- Hero: **"Streamline Your Spending Goals"** + lead "Effortlessly track expenses, capture receipts, and manage spending—all in one app".
- Section eyebrow → headline → 1 supporting sentence pattern: `WELCOME TO EXPENSIFY` → big H1 → one-sentence lead.
- CTA banner: 6-word imperative ("Simplify Expense Management") + email-capture input.
- Testimonials: 1–2 sentence quotes attributed with name + role + company.

**Emoji & special chars**
- **No emoji.** Iconography is custom SVG / circular tokens.
- Mid-sentence decorative glyphs (a small bolt ⚡ icon, a wallet glyph) are used as inline separators in nav lists.
- Stars (★) are used in ratings, gold `#F2C94C` on `#EDEDED` empty.

---

## Visual foundations

### Color philosophy
- **Forest greens carry weight** — they own all type, primary CTAs on light backgrounds, and inverse surfaces.
- **Lime is a spice**, never a base. Used in three roles: (1) pill badges with forest text on top, (2) full lime panels behind product imagery to draw the eye, (3) the lime-CTA pattern when sitting on a forest banner.
- **Cream (`#F8F8F8`) is the room**, not the furniture. The entire page lives on it; cards lift to `#FFFFFF` to feel raised.
- Photography is **warm, lightly desaturated, daylight-lit**. People imagery only — no abstract textures, no gradients-as-imagery.

### Typography
- **One family, three weights:** Manrope Light, Regular, Medium.
- Display copy uses **Medium** at very large sizes (often 56–96px) with **tight (-0.02em) tracking** and balanced wrapping.
- Body uses **Regular at 16/18px** with normal line-height (1.5).
- Eyebrows/labels use **Regular at 12–14px**, ALL CAPS, `+0.14em` tracking.
- A consistent visual quirk: inline decorative tokens (circular icon + word) appear **inside** headlines, sized to cap-height, splitting the line ("Streamline ⊙ Your Spending Goals").

### Spacing & rhythm
- **4px base unit.** Most surfaces breathe on 24/32/48/96 spacing.
- Sections separated by **96–128px** of vertical air.
- Inside cards: **24–32px** padding minimum.
- Inline elements (nav chips, feature pills) sit on a **12–16px gap** rhythm.

### Backgrounds
- **Flat solid cream** is the default — no gradients, no patterns, no textures.
- **Accent panels** appear inside cards: a `#C7F269 → #EDFACC` soft vertical gradient sits behind product mocks. Very subtle.
- **Inverse banners** (`#112320`) get a decorative **lime corner blob** in the top-right and a lime arc in the bottom-left for visual interest.
- **No** background patterns or noise overlays anywhere.

### Borders
- Used **sparingly**. Cards lift via shadow, not stroke.
- When present, borders are `rgba(17, 35, 32, 0.08–0.14)` — almost invisible.
- One pattern uses a **thin lime outline** (`1.5px #C7F269`) on the dark "Instant Virtual Card Access" panel — fully internal, glow-like.

### Shadows
- Quiet, only on raised cards: `0 8px 24px rgba(17, 35, 32, 0.06)`.
- Bigger drop (`0 18px 48px rgba(17, 35, 32, 0.08)`) on testimonial cards and the floating phone mockup.
- **No** colored shadows or neon glows.

### Corner radii
- **Pills dominate** (`999px`) for: buttons, badges, nav chips, footer links, input fields.
- **Soft rectangles** for cards: `24–32px`.
- **Phones, monitor**: `40px+`.
- Avoid anything sharper than `8px`; this system is universally soft-cornered.

### Hover / press / focus
- **Hover** on dark CTAs: lighten via `opacity: 0.85`.
- **Hover** on lime CTAs: nudge to `lime-400` (`#D4F58A`); no shadow change.
- **Press** state: subtle `transform: scale(0.98)` over 120ms.
- **Focus ring:** soft lime halo, `0 0 0 4px rgba(199, 242, 105, 0.45)` — visible on inputs and buttons.
- **Card hover** (on the marketing site grid): shadow steps from `md` → `lg`; no border change.

### Animation
- Functional, not decorative. Standard easing `cubic-bezier(0.2, 0.6, 0.2, 1)`, durations 120ms / 200ms / 320ms.
- **No bounces, no springs, no parallax, no scroll-jacking.**
- Fade + tiny y-translate (8–12px) is the only entry animation in scope.

### Transparency & blur
- Used in **one place**: the rating widget on the hero overlays slightly onto the lime block. Otherwise everything is opaque.
- **No** glassmorphism. No `backdrop-filter` anywhere.

### Layout rules
- **Two columns** is the dominant section pattern — left headline, right supporting copy.
- Hero is **content-left, mock-right** with the mock breaking out of its block by ~10%.
- Decks of items use a **3-up** card grid most often.
- Sticky/fixed elements: a **right-edge utility rail** (Tools / Save / Share / Appreciate) appears in the case-study chrome but is **not** part of the product system — strip it when reusing.

### Photography vibe
- **Warm daylight, lightly grainy, shallow depth-of-field.** Single subjects or small groups, looking at devices or each other.
- **Color cast:** warm cream highlights, neutral midtones, slight green pull in shadows (pairs with the forest palette).
- **No** stock-photo blue/teal corporate look. **No** black & white.

### Cards
- **Default card:** white surface, `#FFFFFF`, `24px` radius, `0 8px 24px rgba(17, 35, 32, 0.06)` shadow, **no border**, `24–32px` padding.
- **Accent card:** lime-tinted gradient (`#C7F269` → `#EDFACC`) interior, no shadow, dark forest copy.
- **Inverse card:** `#112320` background, lime accents inside, white type. Used for premium / pro features.

---

## Iconography

The source UI Board does **not** ship a named icon system. It uses bespoke outline glyphs throughout — wallet, clipboard, gear, lock, credit-card, calendar, eye, bolt, search, chevron — all hairline `1.5px` strokes, rounded line caps, no fills.

**Our recommendation for downstream builds**

1. **Default to [Lucide](https://lucide.dev/)** via CDN. Lucide's stroke weight (`2px`, rounded caps, no fill) is the closest commodity match to the source's bespoke glyphs. We use Lucide throughout `ui_kits/` and `preview/`.
2. **Flag this as a substitution.** The original icons are bespoke; if you need exact parity, request the original SVG set from the source designer.
3. **One repeating motif**: a small forest-green circular "token" (≈24–32px) with a single white/lime icon inside, used inline with headlines and as section markers. We recreate this as a `<TokenIcon>` component in the UI kit.

**Specifics**
- ⚡ Bolt symbol is used as a **textual** separator between nav items (`Invoices ⚡ Expense Reports ⚡ Travel Management`). Use Lucide `Zap` or the unicode `⚡` (renders as emoji on some platforms — Lucide is safer).
- **Star rating:** filled gold (`#F2C94C`) star + empty gray (`#E2E2E2`) star. Lucide `Star` filled / unfilled.
- **Chevrons & arrows:** thin (`1.5px`), no fill. Right-arrow CTAs (`↗`) use Lucide `ArrowUpRight`.
- **Emoji:** never used. The brand is icon-driven.
- **Unicode chars as icons:** `®` superscript on the brand mark is the only intentional use.

Lucide CDN tag (used across the UI kit):
```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
```

---

## Notes & substitutions

- **Font files:** Manrope is loaded from Google Fonts via `@import url(...)` in `colors_and_type.css`. The original source likely uses the Google Fonts version of Manrope at weights 300/400/500. No `.ttf` files are bundled.
- **Icon system:** substituted with Lucide CDN (flagged above).
- **Photography:** the source uses stock-photo people imagery. We use `<image-slot>` placeholders in the UI kit so the user can drop their own photos in.
- **Brand mark:** the original wordmark is a bespoke set-tight Manrope-ish bold setting of "Expensify". Our `assets/wordmark.svg` is a faithful Manrope ExtraBold recreation. Flag for replacement if the production brand requires exact parity.
