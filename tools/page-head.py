"""Gives every page in docs/ the same <head> tags: title, description, the
address search engines should use (canonical), the preview used when the
link is shared (Open Graph), the icons, and Vercel Web Analytics.

Run it after changing a page's title or description below, or after adding
a page:   python3 tools/page-head.py

Everything between the two marker comments in each page's <head> is
rewritten; the rest of the page is left alone.

The home page also gets structured data (schema.org JSON-LD): what FinDash
is, and its questions and answers, read from the page's own "What is
FinDash?" and "Questions people ask" sections. So after changing those,
run this again and the two always say the same thing."""

import html
import json
import pathlib
import re

SITE = "https://findash.tech"
DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"

# file: (address, title, description, listed by search engines?)
PAGES = {
    "index.html": ("/", "FinDash: Free Small Business Profit & Loss Dashboard",
                   "Turn an Excel or CSV spreadsheet into a monthly dashboard of revenue, costs, profit and "
                   "budget vs actual. Free, no signup needed.", True),
    "dashboard.html": ("/dashboard", "FinDash · Profit, Costs and Budget vs Actual Dashboard",
                       "See any month, quarter or year to date: revenue, costs in four groups, gross and net "
                       "profit, budget used and the profit trend. No account needed.", True),
    "help.html": ("/help", "FinDash · Help: Spreadsheets, Invoice Photos, Glossary",
                  "How to copy totals from QuickBooks, Xero or your own spreadsheet, add an invoice photo, and "
                  "what gross profit, net margin and budget used mean.", True),
    "login.html": ("/login", "FinDash · Log in",
                   "Log in to FinDash, or create an account. Accounts are optional: the dashboard works "
                   "without one.", False),
    "privacy.html": ("/privacy", "FinDash · Privacy policy",
                     "What FinDash collects, why, who processes it, how long it is kept, and how to remove it.",
                     True),
    "terms.html": ("/terms", "FinDash · Terms of service",
                   "The terms for using FinDash: what it is and isn't, accounts, fair use and our "
                   "responsibilities.", True),
    "thanks.html": ("/thanks", "FinDash · Check your email",
                    "Thanks for creating a FinDash account. Open the link we emailed you to finish.", False),
    "404.html": ("/404", "FinDash · Page not found",
                 "This page doesn't exist. Find your way back to the FinDash dashboard or help.", False),
}

START = "<!-- page-head: start (tools/page-head.py writes this) -->"
END = "<!-- page-head: end -->"
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


def plain_text(fragment):
    """HTML as one line of plain text."""
    without_tags = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(re.sub(r"\s+", " ", without_tags)).strip()


def structured_data(page_text):
    """The home page's JSON-LD, or None for a page without the sections."""
    definition = re.search(r'<p class="about-lede">(.*?)</p>', page_text, re.S)
    questions = re.findall(r'<details class="faq-item">\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>',
                           page_text, re.S)
    if not definition or not questions:
        return None
    graph = [
        {"@type": "WebSite", "@id": SITE + "/#website", "name": "FinDash", "alternateName": "findash.tech",
         "url": SITE + "/"},
        {"@type": "Organization", "@id": SITE + "/#organization", "name": "FinDash", "url": SITE + "/",
         "logo": SITE + "/icon-512.png", "email": "support.findash@findash.tech"},
        {"@type": "WebApplication", "@id": SITE + "/#app", "name": "FinDash", "url": SITE + "/dashboard",
         "description": plain_text(definition.group(1)), "applicationCategory": "BusinessApplication",
         "operatingSystem": "Any", "browserRequirements": "A modern web browser",
         "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
         "featureList": FEATURES, "screenshot": SITE + "/og-image.png",
         "publisher": {"@id": SITE + "/#organization"}},
        {"@type": "FAQPage", "@id": SITE + "/#questions", "mainEntity": [
            {"@type": "Question", "name": plain_text(question),
             "acceptedAnswer": {"@type": "Answer", "text": plain_text(answer)}}
            for question, answer in questions]},
    ]
    data = json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2, ensure_ascii=False)
    # "</" inside a script element would end it early.
    return '<script type="application/ld+json">\n' + data.replace("</", "<\\/") + "\n</script>"


def head_block(address, title, description, listed, extra=None):
    title = html.escape(title)
    description = html.escape(description)
    url = SITE + address
    lines = [START, f"<title>{title}</title>", f'<meta name="description" content="{description}">']
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
        '<link rel="stylesheet" href="/css/site.css">',
        '<script type="module" src="/js/cookie-notice.js"></script>',
    ]
    if extra:
        lines.append(extra)
    lines.append(END)
    return "\n".join(lines)


# Tags the block replaces, removed wherever they are in an older page.
OLD_TAGS = [
    r'<title>.*?</title>\n',
    r'<meta name="description"[^>]*>\n',
    r'<link rel="icon"[^>]*>\n',
    r'<script>\n  window\.va = .*?\n</script>\n',
    r'<meta name="robots"[^>]*>\n',
]


def update(name, page):
    path = DOCS / name
    if not path.exists():
        return
    text = path.read_text()
    block = head_block(*page, extra=structured_data(text))
    if START in text:
        text = re.sub(re.escape(START) + ".*?" + re.escape(END), lambda match: block, text, flags=re.S)
    else:
        for pattern in OLD_TAGS:
            text = re.sub(pattern, "", text, flags=re.S)
        viewport = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        text = text.replace(viewport, viewport + block + "\n", 1)
    path.write_text(text)
    print("updated", name)


for name, page in PAGES.items():
    update(name, page)
