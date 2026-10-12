"""Writes the parts of the pages in docs/ that are generated rather than typed:

  - every page's <head> tags: title, description, the address search engines
    should use (canonical), the preview shown when the link is shared (Open
    Graph), the icons, the font preload and Vercel Web Analytics
  - structured data (schema.org JSON-LD), read from the page's own text:
    on the home page what FinDash is ("What is FinDash?"), and on any page
    its questions and answers (<details class="faq-item">), so the markup
    always says exactly what the page shows
  - the help page's glossary, from docs/js/glossary.js (the same file behind
    the dashboard's "?" buttons), as plain HTML that needs no script
  - the dashboard's <link rel="modulepreload"> list: every module main.js
    imports, however deep, so the browser asks for them all at once instead
    of discovering them one level at a time

Run it after changing a title or description below, a page's definition or
questions, the glossary, the dashboard's imports, or after adding a page:

    python3 tools/build-pages.py

Only what sits between each block's two marker comments is rewritten."""

import html
import json
import pathlib
import re
import subprocess

SITE = "https://findash.tech"
ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SUPPORT = "support.findash@findash.tech"
SOURCE_CODE = "https://github.com/spinfern-o/FinDash"

# file: (address, title, description, listed by search engines?)
# Titles put what the page is first and the name last, except on the home
# page, where the name is what people look for.
PAGES = {
    "index.html": ("/", "FinDash: Free Small Business Profit & Loss Dashboard",
                   "Turn an Excel or CSV spreadsheet into a monthly profit and loss (P&L) dashboard: revenue, "
                   "costs, profit and budget vs actual. Free, no signup.", True),
    "dashboard.html": ("/dashboard", "Profit, Costs and Budget vs Actual Dashboard · FinDash",
                       "See any month, quarter or year to date: revenue, costs in four groups, gross and net "
                       "profit, budget used and the profit trend. No account needed.", True),
    "restaurant-profit-and-loss.html": (
        "/restaurant-profit-and-loss", "Free Restaurant P&L Dashboard: Prime Cost, Food & Labor · FinDash",
        "A free restaurant profit and loss dashboard: food cost, labor and prime cost as a share of sales, "
        "occupancy and net margin, month by month.", True),
    "help.html": ("/help", "Help: Spreadsheets, Invoice Photos, Glossary · FinDash",
                  "How to copy totals from QuickBooks, Xero or your own spreadsheet, add an invoice photo, and "
                  "what gross profit, net margin and budget used mean.", True),
    "login.html": ("/login", "Log in · FinDash",
                   "Log in to FinDash, or create an account. Accounts are optional: the dashboard works "
                   "without one.", False),
    "privacy.html": ("/privacy", "Privacy policy · FinDash",
                     "What FinDash collects, why, who processes it, how long it is kept, and how to remove it.",
                     True),
    "terms.html": ("/terms", "Terms of service · FinDash",
                   "The terms for using FinDash: what it is and isn't, accounts, fair use and our "
                   "responsibilities.", True),
    "thanks.html": ("/thanks", "Check your email · FinDash",
                    "Thanks for creating a FinDash account. Open the link we emailed you to finish.", False),
    "404.html": ("/404", "Page not found · FinDash",
                 "This page doesn't exist. Find your way back to the FinDash dashboard or help.", False),
}

HEAD_START = "<!-- page-head: start (tools/build-pages.py writes this) -->"
HEAD_END = "<!-- page-head: end -->"
GLOSSARY_START = "<!-- glossary: start (tools/build-pages.py writes this, from docs/js/glossary.js) -->"
GLOSSARY_END = "<!-- glossary: end -->"
IMAGE_ALT = "FinDash: revenue, costs and budget on one monthly dashboard"

FEATURES = [
    "Reads Excel and CSV spreadsheets in any layout",
    "Reads photos of supplier invoices and receipts (with a free account)",
    "Monthly revenue, costs in four groups, gross profit, net profit and net margin",
    "Budget vs actual",
    "Month, quarter and year-to-date views",
    "Net profit trend and a budget estimator",
    "Advice written by AI (with a free account)",
    "Export to Excel, print or save as PDF",
    "Works in many currencies",
]

# The help page's glossary, in groups; the words come from glossary.js.
GLOSSARY_GROUPS = [
    ("The four cost groups", ["direct", "operating", "variable", "fixed", "other"]),
    ("Results", ["revenue", "totalCosts", "grossProfit", "netProfit", "netMargin", "shortfall", "ofRevenue"]),
    ("Budget", ["budget", "budgetUsed", "typical", "swing"]),
    ("Forecast", ["trend", "range"]),
]


def plain_text(fragment):
    """HTML as one line of plain text."""
    without_tags = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(re.sub(r"\s+", " ", without_tags)).strip()


def json_ld(graph):
    data = json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2, ensure_ascii=False)
    # "</" inside a script element would end it early.
    return '<script type="application/ld+json">\n' + data.replace("</", "<\\/") + "\n</script>"


def structured_data(address, page_text):
    """The page's JSON-LD, or None when it has nothing to describe."""
    graph = []
    definition = re.search(r'<p class="about-lede">(.*?)</p>', page_text, re.S)
    if definition:
        graph += [
            {"@type": "WebSite", "@id": SITE + "/#website", "name": "FinDash", "alternateName": "findash.tech",
             "url": SITE + "/"},
            {"@type": "Organization", "@id": SITE + "/#organization", "name": "FinDash", "url": SITE + "/",
             "logo": SITE + "/icon-512.png", "email": SUPPORT, "sameAs": [SOURCE_CODE]},
            {"@type": "WebApplication", "@id": SITE + "/#app", "name": "FinDash", "url": SITE + "/dashboard",
             "description": plain_text(definition.group(1)), "applicationCategory": "BusinessApplication",
             "operatingSystem": "Any", "browserRequirements": "A modern web browser",
             "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
             "featureList": FEATURES, "screenshot": SITE + "/screenshot-dashboard.jpg",
             "publisher": {"@id": SITE + "/#organization"}},
        ]
    questions = re.findall(r'<details class="faq-item">\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>',
                           page_text, re.S)
    if questions:
        graph.append({"@type": "FAQPage", "@id": SITE + address.rstrip("/") + "/#questions", "mainEntity": [
            {"@type": "Question", "name": plain_text(question),
             "acceptedAnswer": {"@type": "Answer", "text": plain_text(answer)}}
            for question, answer in questions]})
    if not graph:
        return None
    return json_ld(graph)


def module_preloads(entry):
    """<link rel="modulepreload"> for every module `entry` imports, directly or not."""
    seen = []
    waiting = [entry.resolve()]
    pattern = re.compile(r'(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["\'](\.{1,2}/[^"\']+)["\']', re.S)
    while waiting:
        module = waiting.pop(0)
        if module in seen:
            continue
        seen.append(module)
        for relative in pattern.findall(module.read_text()):
            waiting.append((module.parent / relative).resolve())
    lines = []
    for module in seen:
        lines.append(f'<link rel="modulepreload" href="/{module.relative_to(DOCS).as_posix()}">')
    return "\n".join(lines)


def head_block(file_name, page_text):
    address, title, description, listed = PAGES[file_name]
    title = html.escape(title)
    description = html.escape(description)
    url = SITE + address
    lines = [HEAD_START, f"<title>{title}</title>", f'<meta name="description" content="{description}">']
    if listed:
        lines.append(f'<link rel="canonical" href="{url}">')
    else:
        lines.append('<meta name="robots" content="noindex">')
    lines += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="FinDash">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{description}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE}/og-image.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{IMAGE_ALT}">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<link rel="icon" href="/favicon.ico" sizes="32x32">',
        '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<link rel="manifest" href="/site.webmanifest">',
        '<meta name="theme-color" content="#050505">',
        # Vercel Web Analytics: counts page visits without cookies. Only
        # active once Analytics is switched on for the project in Vercel.
        "<script>",
        "  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };",
        "</script>",
        '<script defer src="/_vercel/insights/script.js"></script>',
        '<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="stylesheet" href="/css/site.css">',
        '<script type="module" src="/js/cookie-notice.js"></script>',
    ]
    if file_name == "dashboard.html":
        lines.append(module_preloads(DOCS / "js" / "dashboard" / "main.js"))
    extra = structured_data(address, page_text)
    if extra:
        lines.append(extra)
    lines.append(HEAD_END)
    return "\n".join(lines)


def glossary_html():
    """The glossary as headed definition lists, from docs/js/glossary.js."""
    script = "import { GLOSSARY } from './docs/js/glossary.js'; console.log(JSON.stringify(GLOSSARY));"
    words = json.loads(subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT,
                                      capture_output=True, text=True, check=True).stdout)
    parts = [GLOSSARY_START, '<div id="terms">']
    for label, keys in GLOSSARY_GROUPS:
        parts.append(f'  <h3 class="group-label">{label}</h3>')
        parts.append("  <dl>")
        for key in keys:
            entry = words.get(key)
            if entry:
                parts.append(f'    <dt id="term-{key}">{entry["term"]}</dt><dd>{entry["text"]}</dd>')
        parts.append("  </dl>")
    parts += ["</div>", GLOSSARY_END]
    return "\n    ".join(parts)


def replace_between(text, start, end, block):
    """`text` with everything from the start marker to the end marker
    replaced by `block`. The start marker is matched by its first words,
    so a page written by an older version of this script is still found."""
    start_words = start.split(" (")[0]
    pattern = re.escape(start_words) + r"[^>]*-->.*?" + re.escape(end)
    assert re.search(pattern, text, re.S), "markers not found: " + start_words
    return re.sub(pattern, lambda match: block, text, count=1, flags=re.S)


def update(file_name):
    path = DOCS / file_name
    if not path.exists():
        return
    text = path.read_text()
    text = replace_between(text, HEAD_START, HEAD_END, head_block(file_name, text))
    if GLOSSARY_START.split(" (")[0] in text:
        text = replace_between(text, GLOSSARY_START, GLOSSARY_END, glossary_html())
    path.write_text(text)
    print("updated", file_name)


for name in PAGES:
    update(name)
