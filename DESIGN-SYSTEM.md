# DESIGN-SYSTEM.md

How FinDash's pages look, and the rules for turning a Figma design into code here. Written for AI coding agents
working through Figma's MCP server; AGENTS.md's rules still apply on top of these.

## In short

- No framework, no build step, no CSS library. Pages are hand-written HTML in `docs/`, styled by plain CSS files in
  `docs/css/`, made interactive by ES modules in `docs/js/`. Vercel serves `docs/` as it is.
- Design tokens are CSS custom properties on `:root`, redefined under `html[data-theme="light"]`. Dark is the
  default.
- Components are CSS classes plus small JavaScript functions that return HTML strings.
- Icons are inline SVGs in the Lucide style. Fonts are Inter and JetBrains Mono, served from `docs/fonts/`.
- Figma's output (React + Tailwind, absolute positions, temporary asset URLs) is a picture of the goal, never code to
  paste. Rebuild it from the tokens and classes below.

## 1. Design tokens

### Where they live

There is no shared token file. Each page family's stylesheet starts with its own copy of the set:

| Stylesheet | Used by | Tokens beyond the common set |
| --- | --- | --- |
| `docs/css/dashboard.css` | `/dashboard` | `--positive`, `--critical`, `--radius`, chart slots `--s1`…`--s4`, `--rest` |
| `docs/css/landing.css` | `/` (home) | `--accent-2`, `--critical` |
| `docs/css/login.css` | `/login`, `/waitlist` | `--accent-2`, `--positive`, `--critical` |
| `docs/css/help.css` | `/help`, `/about`, `/privacy`, `/terms`, `/developers`, `/contact`, `/thanks`, `/404`, `/restaurant-profit-and-loss` | none |
| `docs/css/site.css` | every page | none: it uses the page's tokens, and holds the `@font-face` rules |

The common set, from `docs/css/dashboard.css`:

```css
:root {
  color-scheme: dark;
  --ground: #050505;      /* the page behind everything */
  --card: #121212;        /* cards, panels, inputs' container */
  --card-2: #161616;      /* inputs, chips, a surface inside a card */
  --line: rgba(245, 245, 245, 0.1);       /* borders, and the dotted page background */
  --line-soft: rgba(245, 245, 245, 0.06);
  --ink: #f5f5f5;         /* main text */
  --ink-2: #b3b3b3;       /* secondary text */
  --ink-3: #8c8c8c;       /* labels, hints, muted text */
  --accent: #8b93f8;      /* brand: buttons, focus, selection. Never red or green (see below) */
  --accent-ink: #0b0b14;  /* text on --accent */
}

html[data-theme="light"] {
  color-scheme: light;
  --ground: #f6f6f7;
  --card: #ffffff;
  --card-2: #f1f1f2;
  --line: rgba(10, 10, 10, 0.12);
  --line-soft: rgba(10, 10, 10, 0.06);
  --ink: #0a0a0a;
  --ink-2: #4b4b50;
  --ink-3: #68686e;
  --accent: #4f46e5;
  --accent-ink: #ffffff;
}
```

Meaning colours (dark / light):

| Token | Dark | Light | For |
| --- | --- | --- | --- |
| `--positive` | `#94dc00` | `#187f25` (dashboard), `#1f7a2e` (login) | profit, good news |
| `--critical` | `#e5484d` | `#d6333b` | loss, over budget, errors |
| `--s1` | `#3ddc84` | `#1f9d53` | direct costs |
| `--s2` | `#5b9dff` | `#2f6fe0` | operating costs |
| `--s3` | `#ff9b4d` | `#d97a1f` | variable overhead |
| `--s4` | `#b794f6` | `#8955d9` | fixed overhead |
| `--rest` | `#94dc00` | `#1f9d2e` | what's left as profit |

### Rules for tokens

- **Map Figma variables onto these names.** When `get_variable_defs` or `get_design_context` gives a colour, use the
  token with that role (a card fill is `var(--card)`, body text is `var(--ink)`), not the hex value. A colour with no
  matching role becomes a new token, defined in both themes.
- **Every token needs a light value too.** Add it under `:root` and under `html[data-theme="light"]`, in every
  stylesheet whose pages use it. Check contrast in both themes.
- **Red and green mean money.** `--critical` is loss and `--positive` is profit. Buttons, links and highlights use
  `--accent` (indigo), so a button never reads as bad or good news. Don't bring in a Figma kit's red or green brand
  colour for anything that isn't a loss or a gain.
- **Mixing colours:** tints come from `color-mix()`, e.g.
  `border-color: color-mix(in srgb, var(--critical) 55%, transparent)`.
- **Known drift:** the copies differ slightly (light `--positive`; `--mono` is JetBrains Mono on the landing and login
  pages but the system monospace on the dashboard and help pages). Match the page you are working on. Don't make the
  copies agree as a side effect of another change.

### Typography

- **Typefaces:** Inter for everything; JetBrains Mono (`var(--mono)`) for small uppercase labels, tags and nav links.
  Both are variable fonts in `docs/fonts/`, declared once in `docs/css/site.css`:

  ```css
  @font-face {
    font-family: "Inter";
    font-weight: 100 900;
    font-display: swap;
    src: url("/fonts/inter.woff2") format("woff2");
    unicode-range: U+0000-00FF, /* … Latin only */;
  }
  ```

  The files cover Latin only. Chinese, Thai, Arabic and other scripts fall back to the system's fonts, which is
  intended. Figma fonts other than these two are replaced by Inter, unless the user asks for a new typeface. A new
  typeface is a self-hosted `.woff2` with its licence beside it. A test fails if any page loads Google Fonts.
- **Sizes:** written in `px`, with no scale tokens. The ones in use: 11px (mono labels), 12px (hints, small text),
  13px (buttons, secondary text), 14px (dashboard body), 15px (card titles, inputs, help-page body). Headings use
  `clamp()`, e.g. `font-size: clamp(26px, 4vw, 34px); font-weight: 800; letter-spacing: -0.035em;`.
- **Labels:** the mono label style is used throughout:

  ```css
  label {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  ```

### Spacing, radius, shadow

- **Spacing:** `px` values, mostly multiples of 2. Card padding is `18px 20px`, the card grid gap is `16px`, and the
  page gutter is `clamp(16px, 4vw, 32px)`. Round Figma's spacing to the nearest value already used nearby.
- **Radius:** 8px (small buttons), 10px (buttons, inputs, messages), 12px (`--radius`, dashboard cards), 14px (login
  and waitlist cards), 999px (pills such as `.scope`), 50% (round buttons).
- **Shadow:** almost none. Surfaces are told apart by `--card` vs `--ground` and a 1px `var(--line)` border. The only
  real shadow is the cookie notice's `0 8px 30px rgba(0, 0, 0, 0.35)`.
- **Background:** the home, login, waitlist and dashboard pages have a dotted grid:
  `background-image: radial-gradient(var(--line) 0.7px, transparent 0.7px); background-size: 26px 26px;` (28px on the
  dashboard). The help-family pages are plain `var(--ground)`, for reading.

### Light and dark mode

`docs/js/theme-init.js` is an ordinary script in each page's `<head>`. Before anything is drawn, it sets
`data-theme="light"` on `<html>` when the visitor chose light (saved as `findash-theme`) or their computer prefers it.
`docs/js/theme-toggle.js` wires the sun and moon button `#theme-toggle`. Design both themes. If the Figma file has
only one, build the other from the token table above.

## 2. Components

### Architecture

No component library and no Storybook. Every component is a CSS class with a small function around it:

- **HTML-string functions** build markup, one file per card in `docs/js/dashboard/cards/`. The shared card frame:

  ```js
  /* docs/js/dashboard/cards/card.js */
  export function cardHtml(className, title, subtitle, scope, body) {
    let subtitleHtml = "";
    if (subtitle) {
      subtitleHtml = `<p class="sub">${subtitle}</p>`;
    }
    let scopeHtml = "";
    if (scope) {
      scopeHtml = `<span class="scope">${scope}</span>`;
    }
    return `<section class="card ${className}">
      <div class="card-head">
        <div><h2>${title}</h2>${subtitleHtml}</div>
        ${scopeHtml}
      </div>
      ${body}
    </section>`;
  }
  ```

- **`wire…` functions** attach event listeners after the HTML is on the page (`wireToolbar`, `wireImportBox`,
  `wireAllocationTooltip`, `wireItemLog`).
- **State** lives in `docs/js/dashboard/state.js`. `draw-dashboard.js` redraws the cards from it.
- **Arithmetic is never in a component.** Figures come from `periods.js`, `cost-groups.js`, `import/` and `analysis.js`,
  which the public API also uses (AGENTS.md).
- **Escaping:** any text from a file, a photo, the API or the visitor goes through `escapeHtml` (from
  `docs/js/dashboard/format.js`) before it's put in HTML. A test checks that text read from a photo is never run as
  markup.

### What exists, by class

| Component | Classes | Defined in |
| --- | --- | --- |
| Card | `.card`, `.card.wide` (full width), `.card-head`, `.sub`, `.scope` (period pill) | `dashboard.css` |
| Card grid | `.grid` (two columns, 16px gap) | `dashboard.css` |
| Headline number | `.stat`, `.lab`, `.num`, `.chg` (`.chg.down` for bad news) | `dashboard.css`, `cards/headline-numbers.js` |
| Button | `.btn`, `.btn.primary`, `.btn.small` | `dashboard.css`, `help.css` |
| Big button | `.submit` (full-width accent button on forms) | `login.css` |
| Landing button | `.cta`, `.cta-row` | `landing.css` |
| Term help | `.help` (a "?" drawn in CSS), `.help-pop` (its explanation) | `dashboard.css`, `help-tips.js` |
| Chart tooltip | `.tip`, `.tip.on` | `dashboard.css` |
| Form field | `label`, `.label-row`, `.optional`, `.hint`, `.field-hint`, `input`, `select`, `textarea` | `login.css`, `waitlist.css` |
| Password field | `.pw-wrap`, `.show-pw` | `login.css` |
| Message | `.message`, `.message.bad`, `.message.good` | `login.css` |
| Tag | `.tag` (mono uppercase, accent colour) | `login.css` |
| Page frame | `.frame` (1180px column with side borders), `.cross.tl` / `.cross.tr` (corner marks) | `landing.css`, `login.css` |
| Header | `.brand`, `.nav-tag`, `.enter-link`, `.theme-toggle` | `landing.css`, `login.css` |
| Dashboard header | `.masthead`, `.wordmark`, `.nav-link`, `.account-link` | `dashboard.css` |
| Cookie notice, sticky dock | `.bottom-dock`, `.cookie-notice` | `site.css` |
| Questions and answers | `.faq-item` (`<details>`) | `site.css` |
| Footer links | `.footer-legal` | `site.css` |

A button looks like this:

```css
.btn {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--ink);
  border-radius: 10px;
  padding: 8px 14px;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```

### Rules for components

- **Reuse a class before making one.** Give a Figma "Button / Primary" `.btn.primary` (or `.submit` on a form page),
  a Figma card `.card`, a badge `.scope` or `.tag`. Add a new class only when nothing listed can express the design.
  Put it in the stylesheet of the page that uses it, or in `site.css` when every page will.
- **Keep the element ids and roles the tests use** (`#theme-toggle`, `#months`, `#submit`, `#message`,
  `#waitlist-form`, `#joined`, and others in `tests/browser/`). A redesign changes how things look, not what the
  tests find.
- **Real elements:** buttons are `<button type="button">`, links are `<a>`, and each field has a `<label for>`. One
  `<h1>` per page, and headings never skip a level (a test checks). Interactive states need `:hover`, `:focus-visible`
  and, where it applies, `:disabled` and `[aria-invalid="true"]`.
- **Hiding:** use the `hidden` attribute. `login.css` forces `[hidden] { display: none !important; }` so it beats a
  class's `display`. On other pages, don't give an element that can be hidden a `display` of its own, or add the
  same rule to that page's stylesheet.
- **Charts are HTML, not a library:** bars are `<div>`s with an inline `height` (`cards/net-profit-chart.js`). Colour
  them with the meaning tokens (`--s1`…`--s4`, `--positive`, `--critical`).

## 3. Frameworks, libraries, build

- **Pages:** HTML5 + vanilla JavaScript ES modules (`<script type="module">`), loaded straight from `docs/js/`. Nothing
  is bundled, transpiled or minified. `package.json` has no front-end dependencies.
- **CSS:** plain CSS with custom properties, without nesting. No Tailwind, Sass, PostCSS, CSS Modules or CSS-in-JS.
- **Server:** Node functions in `api/` on Vercel. `middleware.js` serves the Markdown versions of pages to agents.
- **Generated parts:** `python3 tools/build-pages.py` writes each page's `<head>` block (between the `page-head`
  markers), structured data, the glossary, the dashboard's `<link rel="modulepreload">` list and the Markdown versions.
  After changing a page, its title or its text, run it, and never edit those blocks by hand.
- **Tests:** `npm test` (Node's test runner, with Playwright for the browser tests).
- **Planned (not built yet):** the owner has chosen to move the interactive pages (dashboard, login and account,
  waitlist) to React with Vite, built from their Figma template, with the content pages staying HTML. That work
  starts after the waitlist PR merges. Until it lands, write HTML, CSS and vanilla JS. When it does, this section
  and section 7 need updating, and the logic modules (`import/`, `periods.js`, `cost-groups.js`, `analysis.js`,
  `items.js`, `export/`, `photos/photo-reader.js`) are reused unchanged.

## 4. Assets

- **Where:** everything served lives in `docs/`, at the root (`og-image.png`, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.ico`, `screenshot-dashboard.jpg`) or in `docs/fonts/`.
  Pages show no `<img>` today. Images are only for icons, the share preview and structured data.
- **The security policy decides what loads** (`vercel.json`):

  ```
  default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  font-src 'self'; img-src 'self' data:; connect-src 'self'; ...
  ```

  So images, fonts and scripts must come from this site. A Figma asset URL (from `get_design_context` or
  `download_assets`), a CDN or Google Fonts is blocked in production. Download every asset into `docs/` (e.g. a new
  `docs/images/`), reference it by a root path (`/images/…`), and leave no Figma URL in the code.
- **Optimising:** there is no pipeline, so do it by hand. Prefer SVG (inline, for icons); compress PNG and JPEG
  before committing; give every `<img>` `width`, `height` and `alt` (or `alt=""` when decorative). A test keeps the
  dashboard's layout shift under 0.1.
- **Caching and CDN:** Vercel's edge network serves `docs/`, with no other CDN. `vercel.json` gives fonts
  `max-age=31536000, immutable` and the icons and share image `max-age=604800`. A new folder of long-lived assets
  gets its own `Cache-Control` rule there. Filenames carry no hashes, so an `immutable` file must be renamed when it
  changes.
- **Share image:** `docs/og-image.png` (1200×630) is rendered from `tools/og-image/og-image.html` by
  `tools/og-image/render.mjs`. Change the HTML and re-render; don't edit the PNG.

## 5. Icons

- **Where:** inline in the HTML (`docs/*.html`) or in the JavaScript that builds the markup. There is no icon
  package, sprite or icon folder.
- **Style:** Lucide's (24×24 grid, outline). Copy this shape:

  ```html
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  ```

  - `stroke="currentColor"` so the icon takes the text colour and follows the theme.
  - Size with the `width` and `height` attributes, 14–20px.
  - Stroke width 2.2–2.5, because the icons are drawn small.
- **Brand mark:** three rising bars, `<path d="M4 19V11"/><path d="M12 19V5"/><path d="M20 19V15"/>`, beside
  "findash" plus an accent-coloured full stop (`.brand` on the landing, login and waitlist pages). The dashboard and
  content pages use the text wordmark `.wordmark`.
- **Small symbols are text or CSS:** ↑ and ↓ for changes, and the "?" of `.help`, drawn by `::before`.
- **Accessibility (tested on every page):** an SVG must be decorative (inside `aria-hidden="true"`), labelled
  (`aria-label` or `<title>`), or inside an element whose text or `aria-label` names it. An icon-only button gets
  `aria-label`.
- **Naming:** none needed. When a Figma icon has a Lucide equivalent, use Lucide's paths with the stroke settings
  above. Otherwise export the Figma vector as SVG and set its strokes to `currentColor`.

## 6. Styling approach

- **Method:** global stylesheets with short, plain class names (`.card`, `.btn`, `.tag`), one stylesheet per page
  family (table in section 1) plus `site.css` on every page. There's no BEM, no utility classes and no scoping.
  Classes are short and are combined with modifiers (`.btn.primary`, `.chg.down`, `.message.bad`).
- **Inline styles:** only for values computed at run time, such as a chart bar's height. Never for design values.
- **Responsive:** desktop first, with `max-width` media queries. The breakpoints in use are 380, 560, 640, 760,
  860/900 and 1199px. Fluid sizes use `clamp()`. The dashboard's `.grid` falls from two columns to one at 760px.
  Tests load every page at 360,
  768 and 1024px and fail on any sideways scroll, so wide content (tables, the language grid) goes inside a wrapper
  that scrolls on its own.
- **Motion:** short transitions (0.12–0.15s) on border, background, filter and transform. Respect
  `@media (prefers-reduced-motion: reduce)`.
- **Print:** `dashboard.css` has `@media print` rules for the dashboard and the count sheet (`.no-print`,
  `.print-only`, `body.printing-count-sheet`), and `site.css` hides the bottom dock.

## 7. Project structure

```
docs/                    The website, served as it is
  *.html                 One file per page (dashboard, login, waitlist, help, …)
  css/                   One stylesheet per page family, plus site.css
  js/                    Page scripts (login.js, waitlist.js, theme-*.js, cookie-notice.js, …)
  js/dashboard/          The dashboard
    main.js              Starting point: wires the page up
    state.js             What the page keeps track of
    draw-dashboard.js    Month buttons, heading, every card
    cards/               One file per card (card.js is the shared frame)
    import/ photos/ export/  Reading spreadsheets and photos; the template and Excel export
  fonts/                 Inter and JetBrains Mono, with their licences
api/                     Server functions (12 allowed on Vercel's Hobby plan; 10 used)
lib/                     Code shared by the functions and the middleware
tools/build-pages.py     Writes the generated parts of every page
tests/                   Unit, API and browser tests
```

Each page is a feature: its HTML, its stylesheet and its script. On the dashboard, each card is one file in
`cards/`, each with an HTML function and, where needed, a wiring function. Write it the way AGENTS.md asks: ordinary
named `function`s with a comment saying what each is for, whole-word names, one step per line, small files.

## Figma to FinDash, step by step

1. **Read the design.** Load the `figma-design-to-code` skill, then call `get_design_context` on the frame. Use
   `get_metadata` first if you need the page's node ids. The connector opens design files (`figma.com/design/…`) that
   the signed-in account can edit. A view-only file or a Figma Sites link (`figma.com/site/…`) is refused, so ask for
   an editable design-file copy.
2. **Map it.**
   - Each Figma colour or variable becomes a token from section 1.
   - Each Figma component becomes a class from section 2.
   - Each icon becomes an inline Lucide-style SVG.
   - Write down anything with no match before adding it.
3. **Build it** in the page's HTML, its stylesheet and its script, with flex and grid in place of Figma's absolute
   positions. Keep the existing ids, text alternatives and heading order.
4. **Assets:** download them into `docs/`, check each file is non-empty and in the right place, and leave no Figma
   URL behind.
5. **Check it.**
   - Look at both themes, and at 360px and a wide screen.
   - Run `python3 tools/build-pages.py` if a title or the page's text changed, then `npm test`.
   - Compare a screenshot of the page with the Figma screenshot.
6. **Words:** the copy follows AGENTS.md. FinDash is never described as accounting, bookkeeping, invoicing,
   payments, payroll, tax or cash-flow software, whatever a template's placeholder text says.
