# DESIGN-SYSTEM.md

How FinDash's pages look, and the rules for turning a Figma design into code here. Written for AI coding agents
working through Figma's MCP server; AGENTS.md's rules still apply on top of these.

## In short

- The look comes from the FinDash Figma file (https://www.figma.com/design/RsZgRDOoDJvBLLWVozZclQ/FinDash-Design),
  built on the "Area" kit, with these parts:
  - white pages, with serif headings in Crimson Text
  - DM Sans for body text and Roboto Mono for small captions
  - olive pill buttons, and sections divided by thin rules
- Pages open in light. A dark version, drawn from the same colours, is one click away.
- No framework, no build step, no CSS library. Pages are hand-written HTML in `frontend/`, styled by plain CSS files in
  `frontend/css/` and made interactive by ES modules in `frontend/js/`. Vercel serves `frontend/` as it is.
- Every colour, font and shared component is in `frontend/css/site.css`, which every page loads. Each page's own
  stylesheet only adds what that page has.
- `tools/build-pages.py` writes the nav bar and the footer into every page, the same everywhere.
- Figma's output (React + Tailwind, absolute positions, temporary asset URLs) is a picture of the goal, never code to
  paste. Rebuild it from the tokens and classes below.
- The home page moves as it scrolls, like the kit's site: data attributes in the HTML, one small script
  (`frontend/js/scroll-motion.js`) and CSS transforms. See section 8.
- Until launch the app is closed: `/dashboard` and `/stock` send visitors to the waitlist, and every "way in" on
  the public pages is **Join the waitlist**. See section 9.

## 1. Design tokens

All in `frontend/css/site.css`, as CSS custom properties on `:root` (light), redefined under `html[data-theme="dark"]`.

| Token | Light | Dark | Figma variable | For |
| --- | --- | --- | --- | --- |
| `--ground` | `#ffffff` | `#0e100b` | Background 1 | the page |
| `--card` | `#ffffff` | `#15180f` | Background 1 | cards, told apart by `--line` |
| `--card-2` | `#f5f5f3` | `#1c2016` | (derived) | text boxes, chips, a surface in a card |
| `--surface` | `#e4e4e4` | `#262a1f` | Light Grey - Surfaces | arrow buttons, toggles, month pills |
| `--line` | `#e9e9e9` | `#2b2f24` | Divider 1 | dividers and borders |
| `--line-strong` | `#929292` | `#5d6253` | Accent 6 | the rule above a big section, table heads |
| `--ink` | `#000000` | `#f3f4ee` | Text/Headline | headings, main text |
| `--ink-2` | `#6f6f6f` | `#b7baae` | Text/Paragraph | paragraphs |
| `--ink-3` | `#737373` | `#9a9e90` | (derived) | labels, hints: `#929292` is too faint for small text |
| `--ink-faint` | `#929292` | `#6f7366` | Accent 6 | only large figures (the 01 02 03 of steps) |
| `--accent` | `#485c11` | `#c2d69a` | Accent 1 | the olive of buttons, links and focus |
| `--accent-ink` | `#ffffff` | `#141a05` | Text/On accent 1 | text on `--accent` |
| `--accent-soft` | `#dfecc6` | `#2e3819` | Accent 2 | soft pill buttons, tags, selection |
| `--accent-hover` | `#8e9c78` | `#8e9c78` | Accent 3 (Mid Green) | what a button turns on hover; the hero block |
| `--caption` | `#485c11` | `#b8cc8c` | Text/Captions | the mono captions |
| `--positive` | `#15803d` | `#34d399` | (FinDash) | profit, good news |
| `--critical` | `#c62828` | `#f87171` | (FinDash) | loss, over budget, errors |
| `--s1` … `--s4`, `--rest` | teal, blue, ochre, violet, green | lighter | (FinDash) | the four cost groups and profit |

Type, shape and spacing tokens: `--font-sans`, `--font-serif` and `--mono`, then the radii (`--radius` 20px for
cards, `--radius-control` 12px for text boxes, `--radius-image` 30px for photos, `--radius-pill` for buttons),
`--shadow-card`, `--page-width` (1200px) and `--gutter`.

### Rules for tokens

- **Map Figma variables onto these names.** The table gives each token's Figma variable; use the token, not the
  hex value. A colour with no matching role becomes a new token in `site.css`, with a dark value too.
- **Money colours stay apart from the brand.** Olive is the brand: buttons, links, captions. Profit is a bluer green
  (`--positive`) and loss is red (`--critical`), so a button never reads as good or bad news and the profit colour
  never looks like a button. Don't use `--accent` for a figure.
- **Contrast:** `--ink-3` and darker for any text under 18px. The kit's `#929292` is only for large figures.
- **Print** (`dashboard.css`, `@media print`) resets the tokens to the light values, whatever the screen theme.

### Typography

Three typefaces, from the Figma file, served from `frontend/fonts/`. They cover Latin only: other scripts such as
Thai fall back to the system's fonts, and the stock page adds Noto Sans SC ("FinDash Chinese" in `stock.css`) so
Chinese reads the same everywhere:

| Role | Font | Size, line height, tracking | Class or where |
| --- | --- | --- | --- |
| Display | Crimson Text 400 | 160px (`clamp`ed), 0.9, -0.0425em | `.display`; the home page's `.hero-title` (150px, one line on a laptop) |
| Heading 1 | Crimson Text 400 | 60px (`clamp`ed), 0.9, -0.03em | `.heading-1`; page `h1`s |
| Heading 2 | Crimson Text 400 | 40px, 1, -0.03em | `.heading-2`; reading pages' `h2` |
| Heading 3 | Crimson Text 400 | 18px, 1, -0.03em | `.heading-3`; card titles at 24px |
| Paragraph | DM Sans 400 | 15px, 1.4 | `body`, `.paragraph` (`--ink-2`) |
| Link, button | DM Sans 700 | 14px, 1.4, -0.025em | nav links, `.button`, labels |
| Caption | Roboto Mono 400 | 12px, 1.4, -0.01em, `--caption` | `.caption`, `.tag`, `.eyebrow`, table heads |
| Large figure | DM Sans 400–500 | 28–80px, 1, -0.04em | KPI numbers, the 01 02 03 of steps |

Captions are in sentence case: no uppercase, no wide letter spacing. A new typeface is a self-hosted `.woff2` with
its licence beside it, declared in `site.css`. A test fails if any page loads Google Fonts.

### Light and dark

`frontend/js/theme-init.js` is an ordinary script in each page's `<head>`. Before anything is drawn, it sets
`data-theme="dark"` on `<html>` when the visitor chose dark (saved as `findash-theme`). Otherwise the page is light.
`frontend/js/theme-toggle.js` wires the sun and moon button `#theme-toggle` in the nav. Check every change in both.

## 2. Components

### Architecture

No component library and no Storybook. A component is a CSS class (in `site.css` when every page has it, otherwise
in that page's stylesheet), sometimes with a small JavaScript function around it:

- **The nav bar and footer** are written into every page by `tools/build-pages.py` (`nav_html`, `footer_html`),
  between `site-nav` and `site-footer` markers. Change them there and run the script; never edit the blocks.
- **HTML-string functions** build the dashboard's markup, one file per card in `frontend/js/dashboard/cards/`
  (`cards/card.js` is the shared frame). **`wire…` functions** attach event listeners afterwards.
- **State** lives in `frontend/js/dashboard/state.js`; **arithmetic** is never in a component (AGENTS.md).
- **Escaping:** any text from a file, a photo, the API or the visitor goes through `escapeHtml`
  (`frontend/js/dashboard/format.js`) before it's put in HTML.

### The kit's components, and where they are

| Kit component | FinDash class | Where |
| --- | --- | --- |
| Navigation (desktop, tablet) | `.site-nav`, `.wordmark`, `.nav-links`, `.nav-end` | `site.css`, written by build-pages |
| Navigation mobile (closed, open) | `.nav-menu` (a `<details>`), `.nav-menu-panel` | `site.css` |
| Button, Type=Primary / Hover | `.button` (pale green, sage on hover) | `site.css` |
| Button linkout, State=Default / Hover | `.button.solid` + `.button-arrow` (olive, ↗) | `site.css` |
| Arrow right / left | `.arrow-button` | `site.css` |
| Footer | `.site-footer`, `.footer-links`, `.footer-credits` | `site.css`, written by build-pages |
| Caption above a heading | `.caption`, `.tag`, `.eyebrow` | `site.css`, `login.css`, `landing.css` |
| Headline and icons (benefits) | `.section`, `.section-text`, `.benefits` | `landing.css` |
| Features carousel (numbered list + photo) | `.split`, `.numbered`, `.photo-tall` | `landing.css` |
| Specifications table | `.specs`, `.preview` (first cell raised) | `landing.css`; the waitlist's `.language-table` |
| Table item | `.preview .cell`, `.language-table td` | `landing.css`, `waitlist.css` |
| How it works (3-up) | `.steps-section`, `.three-up`, `.step-number` | `landing.css` |
| Centered CTA | `.centered-cta` | `landing.css` |
| Hero image (device on a sage block) | `.hero-visual`, `.hero-block`, `.device` | `landing.css` |
| Photo | `.photo`, `.photo-wide` | `landing.css` |

The kit has no text boxes, dropdowns, tick boxes, cards or charts. They are drawn from its colours and shapes:

| FinDash part | Class | Look |
| --- | --- | --- |
| Card | `.card`, `.card.wide`, `.card-head`, `.sub`, `.scope` | white, 1px `--line`, 20px corners; serif title; mono caption pill for the period |
| Text box, dropdown | `input`, `select`, `textarea`, `.select` | `--card-2`, 12px corners; olive ring on focus |
| Tick box | `input[type="checkbox"]` | the browser's own, in olive (`accent-color`) |
| Period switch | `.seg-ctl` | a grey pill holding pills; the chosen one olive |
| Month pills | `.filters button` | grey pills; in range pale green; chosen olive |
| Dashboard buttons | `.btn`, `.btn.primary`, `.btn.small` | the kit's pills |
| Form button | `.submit` (olive), `.ghost` (pale green) | the kit's pills, full width on forms |
| Message | `.message`, `.message.bad`, `.message.good` | `--card-2` box; red or pale-green edge |
| Headline number | `.stat`, `.lab`, `.num`, `.chg` (`.chg.down`) | DM Sans 28px |
| Term help | `.help` (a "?" drawn in CSS), `.help-pop` | grey ring |
| Charts | bars are `<div>`s with an inline height; the forecast is an SVG | the money and cost-group tokens |

### Rules for components

- **Reuse a class before making one.** A Figma "Button" is `.button`; "Button linkout" is `.button.solid` with the
  arrow; a card is `.card`; a caption is `.caption`. Add a class only when nothing listed can express the design.
- **Keep the element ids and roles the tests use** (`#theme-toggle`, `#account`, `#months`, `#submit`, `#message`,
  `#waitlist-form`, `#coming-next`, `.cta-row`, `header .enter-link`, `header .login-link`, and others in
  `tests/browser/`). A redesign changes how things look, not what the tests find.
- **Real elements:** buttons are `<button type="button">`, links are `<a>`, each field has a `<label for>`. One
  `<h1>` per page and no skipped heading levels (a test checks). Interactive states need `:hover`,
  `:focus-visible` and, where it applies, `:disabled` and `[aria-invalid="true"]`.
- **Hiding:** use the `hidden` attribute; `site.css` makes it win over any `display`.

## 3. Frameworks, libraries, build

- **Pages:** HTML5 + vanilla JavaScript ES modules (`<script type="module">`), loaded straight from `frontend/js/`.
  Nothing is bundled, transpiled or minified.
- **CSS:** plain CSS with custom properties, without nesting. No Tailwind, Sass, PostCSS, CSS Modules or CSS-in-JS.
- **Generated parts:** `python3 tools/build-pages.py` writes each page's `<head>` block, the nav bar and footer,
  structured data, the glossary, the dashboard's `modulepreload` list and the Markdown versions.
- **Pictures of the product:** `node tools/home-preview/render.mjs` retakes the dashboard in the home page's device
  frame (`frontend/images/dashboard-preview.jpg`) and `frontend/screenshot-dashboard.jpg`;
  `node tools/og-image/render.mjs` redraws the share image. Run them after changing how the dashboard looks.
- **Tests:** `npm test` (Node's test runner, with Playwright for the browser tests).
- **No framework, by choice:** the site stays buildless (`frontend/AGENTS.md`). A Figma design is rebuilt as HTML,
  these CSS classes and small ES modules, not as React components.

## 4. Assets

- **Where:** `frontend/fonts/` (the three typefaces and their licences), `frontend/images/` (the home page's pictures),
  and the icons, share image and screenshot at the root of `frontend/`.
- **The kit's photos** (`frontend/images/mountains.webp`, `columns.webp`) are decoration: `alt=""`. They were
  exported from the Figma file, cropped just inside their rounded corners (the CSS rounds them again) and saved
  as WebP.
- **The security policy decides what loads** (`vercel.json`: `img-src 'self' data:`, `font-src 'self'`). A Figma
  asset URL, a CDN or Google Fonts is blocked in production. Save every asset into `frontend/` and reference it by a
  root path (`/images/…`). Leave no Figma URL in the code.
- **Every `<img>` has `width`, `height` and `alt`** (`alt=""` when decorative). A test keeps the dashboard's
  layout shift under 0.1.
- **Caching:** Vercel's edge serves `frontend/`. Fonts are `immutable` for a year; `/images/`, the icons and the share
  image for a week. Filenames carry no hashes, so rename an `immutable` file when it changes.

## 5. Icons

- **The kit's icons** (from the Figma file's Styles page) are filled 16×16 vectors: Cable, Check, Close, Chart,
  Account, Earth, Government and Paint. There are also the 24×24 menu and close icons, the 6×7 linkout arrow, and
  the 40×40 arrow buttons. Use their exact paths, inline, with `fill="currentColor"` so they follow the theme:

  ```html
  <svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.9999 4.66668L5.99992 12.6667…" fill="currentColor"/></svg>
  ```

  The nav's menu, close and arrow icons are in `tools/build-pages.py`; the home page's are inline in
  `frontend/index.html`.
- **The site's own icons** (the sun and moon, the dashboard's upload cloud) are outline SVGs in the Lucide style,
  `stroke="currentColor"`.
- **FinDash's mark** is three rising bars, in the footer. The wordmark "FinDash" is text (`.wordmark`).
- **Accessibility (tested on every page):** an SVG must be decorative (`aria-hidden="true"`), labelled
  (`aria-label` or `<title>`), or inside an element whose text or `aria-label` names it.

## 6. Styling approach

- **Method:** global stylesheets with short class names and modifiers (`.button.solid`, `.chg.down`,
  `.message.bad`). `site.css` is on every page; each kind of page adds one more: `landing.css` (home),
  `dashboard.css`, `login.css` (+ `waitlist.css`), `help.css` (help, about, contact, developers, privacy, terms,
  restaurant, thanks, 404). The stock workspace (`/stock`) loads `dashboard.css` and adds `stock.css`, and keeps its
  own sidebar in place of the nav bar. No BEM, no utility classes.
- **Inline styles:** only for values computed at run time, such as a chart bar's height.
- **Responsive:** desktop first, with `max-width` media queries. The nav folds into its menu at 1040px; other
  breakpoints are 960, 760, 640, 560 and 420px. Fluid sizes use `clamp()`. Tests load every page at 360, 768 and
  1024px and fail on any sideways scroll, so wide content (tables) goes inside a wrapper that scrolls on its own.
- **Motion:** short transitions (0.12–0.15s) for hover and focus; the home page's scroll animation is in
  section 8. Respect `@media (prefers-reduced-motion: reduce)` always.
- **Print:** the FinDash name and the dashboard's source line stay; the nav links, buttons and footer links go.
  The count sheet prints alone.

## 7. Project structure

```
frontend/                The website, served as it is (formerly docs/)
  *.html                 One file per page
  css/site.css           Colours, fonts, type, buttons, nav and footer: every page
  css/*.css              One more per kind of page
  js/                    Page scripts (login.js, waitlist.js, scroll-motion.js, theme-*.js, cookie-notice.js, …)
  js/dashboard/          The dashboard: main.js, state.js, draw-dashboard.js, cards/, import/, photos/, export/
  fonts/, images/        The typefaces and the home page's pictures
lib/app-gate.js          Which pages are closed until launch (section 9)
tools/build-pages.py     Writes the generated parts of every page, the nav and footer included
tools/home-preview/      Retakes the pictures of the dashboard
tools/og-image/          Redraws the share image
tests/                   Unit, API and browser tests
```

Write it the way AGENTS.md asks: ordinary named `function`s with a comment saying what each is for, whole-word
names, one step per line, small files.

## 8. Motion: the home page's scroll animation

The kit's site moves as you scroll; FinDash does the same without a framework or animation library. Mark the HTML,
and `frontend/js/scroll-motion.js` and the end of `frontend/css/landing.css` do the rest.

| In the HTML | What happens | How |
| --- | --- | --- |
| `.hero` (one per page) | as the header scrolls away, the headline drifts up, the sage block widens and the device rises and grows from 88% to full size | the script writes progress 0–1 as `--p` on `.hero`; CSS turns it into `transform`s |
| `data-reveal` | the element fades and rises 28px into place the first time it comes into view | `IntersectionObserver` adds `.is-visible` |
| `data-reveal-group` | each child does the same, one after another (90ms apart) | each child gets `data-reveal-item` and its order as `--i` |
| `data-parallax` on a `.photo` | the photo moves a little slower than the page | `--p` from -1 to 1 by its place on screen; the image is drawn at 112% so its edges never show |

On arrival, the headline and the device come up into place once (`@keyframes rise-in`, on `translate` and
`opacity` so it never fights the scroll `transform`).

Rules:

- **Transforms and opacity only.** Never animate `width`, `height`, `top`, `margin` or anything else that moves
  other content: the layout-shift test fails on it.
- **Visible without the script.** Hidden starting states apply only under `html.motion`, which the script adds
  after marking whatever is already on screen as visible. No JavaScript, a failed script or print shows every
  part of the page at once. The motion rules sit inside `@media screen and (prefers-reduced-motion:
  no-preference)`, and the script does nothing when less motion is asked for.
- **One scroll listener**, passive, throttled to one update per frame with `requestAnimationFrame`. Elements
  are revealed once and then forgotten.
- **Use it sparingly**: a section's text block or a list, not every paragraph. Never on the dashboard, forms or
  anything a visitor is reading closely.
- To animate a Figma frame, look at its prototype's "Smart animate" or "While scrolling" settings
  (`get_motion_context` where the plan allows), then match it with one of the rows above before inventing a new
  one. Durations in Figma's prototype map to the CSS `transition` here.
- Tests: `tests/browser/site-basics.test.mjs` checks that the header moves, that nothing on the first screen
  waits to appear, and that a visitor asking for less motion sees a still page.

## 9. Before launch: the waitlist gate

- `lib/app-gate.js` lists the app's pages (`/dashboard`, `/stock`). `middleware.js` sends them to `/waitlist`
  with a temporary (307) redirect unless the environment variable `FINDASH_APP_OPEN` is `1`.
- The log in page stays open: the privacy policy promises that account holders can delete their account there.
- Set `FINDASH_APP_OPEN=1` in Vercel for Preview deployments to try the app before launch; set it for Production
  on launch day. The tests run with the app open (`startSite()`), and `tests/api/app-gate.test.mjs` runs it closed
  (`startSite({ appClosed: true })`).
- Every way in on the public pages comes in two versions: the waitlist's (class `waitlist-only`: **Join the
  waitlist** to `/waitlist`) and the app's (class `app-only`: **Open the dashboard** to `/dashboard`, **Log in**,
  **Open daily stock**). That covers the nav's main button and menu, the footer, the home page's intro, steps,
  "Daily stock" section and sticky phone button, the restaurant page, the 404 and the waitlist page.
- Every page's head loads `/app-state.js`, which `middleware.js` answers from `FINDASH_APP_OPEN`: it adds
  `app-open` to `<html>` before the page is drawn, and `site.css` hides whichever version doesn't apply. No
  cookie, no flash. Browsers keep the answer for a minute.
- Give a new way in both versions. Keep headings the same in both states (put the difference in the text or
  buttons under them): the Markdown copies for agents leave out both versions.
- The help and developers pages may mention `/dashboard` and `/stock` as documentation.

## Figma to FinDash, step by step

1. **Read the design.** Load the `figma-design-to-code` skill, then call `get_design_context` on the frame. Use
   `get_metadata` first if you need node ids.
   - The connector opens design files (`figma.com/design/…`) that the signed-in account can edit. Figma Sites
     links (`figma.com/site/…`) are refused.
   - On Figma's Starter plan the connector allows only a few calls a month, so ask for exactly the frames you
     need.
   - If figma.com is blocked from where you run, Figma's temporary asset URLs won't download. Then export vectors
     with `use_figma` (`node.exportAsync({ format: "SVG_STRING" })`) and photos with `get_screenshot`.
2. **Map it.** Each Figma colour or variable becomes a token from section 1, each component a class from
   section 2, each icon an inline SVG with its exact path. Write down anything with no match before adding it.
3. **Build it** in the page's HTML, its stylesheet and its script, with flex and grid in place of Figma's absolute
   positions. Keep the existing ids, text alternatives and heading order.
4. **Assets:** save them into `frontend/`, check each is non-empty and in place, and leave no Figma URL behind.
5. **Check it.**
   - Look at both themes, at 360px and at a wide screen, beside the Figma screenshot.
   - Run `python3 tools/build-pages.py` if a title, the nav or footer, or the page's text changed.
   - Run `node tools/home-preview/render.mjs` if the dashboard's look changed, then `npm test`.
6. **Words:** the copy follows AGENTS.md. FinDash is never described as accounting, bookkeeping, invoicing,
   payments, payroll, tax or cash-flow software. Never keep a template's placeholder logos, quotes or made-up
   figures: show real content or leave the section out.
