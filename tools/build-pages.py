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
  - lib/markdown-pages.js: every page as Markdown, converted from the page's
    own HTML, which middleware.js sends to AI agents that ask for Markdown
    ("Accept: text/markdown"), plus the Markdown 404 and the list of files at
    the top of docs/

Run it after changing a page's text, a title or description below, a page's
definition or questions, the glossary, the dashboard's imports, or after
adding a page:

    python3 tools/build-pages.py

`python3 tools/build-pages.py --check` changes nothing and fails if any of
it is out of date; the tests run it.

Only what sits between each block's two marker comments is rewritten."""

import html
import json
import pathlib
import re
import subprocess
import sys
from html.parser import HTMLParser

SITE = "https://findash.tech"
ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
MARKDOWN_MODULE = ROOT / "lib" / "markdown-pages.js"
SUPPORT = "support.findash@findash.tech"
SOURCE_CODE = "https://github.com/spinfern-o/FinDash"

# The business's postal address, for the Organization structured data. Left
# empty until there is one to publish; fill in the parts that apply, e.g.
# {"streetAddress": "...", "addressLocality": "...", "addressRegion": "...",
#  "postalCode": "...", "addressCountry": "US"}, and run this script.
POSTAL_ADDRESS = {}

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
    "about.html": ("/about", "About FinDash: A Free P&L Dashboard for Small Businesses",
                   "Why FinDash exists, how it reads your figures without uploading your spreadsheet, what it "
                   "doesn't do, and how it's built.", True),
    "contact.html": ("/contact", "Contact · FinDash",
                     "How to reach FinDash: help with your figures, problems with the site, your account and "
                     "data, security reports and ideas.", True),
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


def organization():
    """FinDash as an organisation: who runs findash.tech and how to reach it."""
    found = {"@type": "Organization", "@id": SITE + "/#organization", "name": "FinDash", "url": SITE + "/",
             "logo": SITE + "/icon-512.png", "email": SUPPORT,
             "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "email": SUPPORT,
                              "url": SITE + "/contact", "availableLanguage": "English"},
             "sameAs": [SOURCE_CODE]}
    if POSTAL_ADDRESS:
        found["address"] = dict({"@type": "PostalAddress"}, **POSTAL_ADDRESS)
    return found


def structured_data(address, page_text):
    """The page's JSON-LD, or None when it has nothing to describe."""
    graph = []
    # The about and contact pages describe the organisation itself.
    page_types = {"/about": "AboutPage", "/contact": "ContactPage"}
    if address in page_types:
        title = PAGES[next(name for name, page in PAGES.items() if page[0] == address)][1]
        graph += [
            organization(),
            {"@type": page_types[address], "@id": SITE + address + "#page", "url": SITE + address,
             "name": title, "about": {"@id": SITE + "/#organization"},
             "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website", "name": "FinDash", "url": SITE + "/"}},
        ]
    definition = re.search(r'<p class="about-lede">(.*?)</p>', page_text, re.S)
    if definition:
        graph += [
            {"@type": "WebSite", "@id": SITE + "/#website", "name": "FinDash", "alternateName": "findash.tech",
             "url": SITE + "/"},
            organization(),
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


def updated_page(file_name):
    """The page's HTML with its generated blocks rewritten."""
    text = (DOCS / file_name).read_text()
    text = replace_between(text, HEAD_START, HEAD_END, head_block(file_name, text))
    if GLOSSARY_START.split(" (")[0] in text:
        text = replace_between(text, GLOSSARY_START, GLOSSARY_END, glossary_html())
    return text


# ---- Markdown, for AI agents ----
# The page's <main>, as Markdown: headings, paragraphs, lists, definition
# lists, tables and links. Navigation, the footer, buttons, form fields,
# icons and anything hidden are left out; links become full addresses.

SKIPPED_TAGS = {"header", "nav", "footer", "button", "form", "input", "select", "textarea", "label", "script",
                "style", "template", "dialog"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
BLOCK_TAGS = {"p", "div", "section", "article", "aside", "main", "ul", "ol", "li", "dl", "dt", "dd", "h1", "h2",
              "h3", "h4", "h5", "h6", "details", "summary", "table", "blockquote", "figure", "figcaption", "pre",
              "hr", "svg", "noscript"}
LINE_BREAK = "\x00"
# Page furniture and controls that only fill in when the page's scripts run.
SKIPPED_CLASSES = {"masthead", "toolbar", "tool"}


class Element:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []


class TreeBuilder(HTMLParser):
    """The document as a tree of Elements and strings. Comments are dropped."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element("root", [])
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for depth in range(len(self.stack) - 1, 0, -1):
            if self.stack[depth].tag == tag:
                del self.stack[depth:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def find(element, tag):
    for child in element.children:
        if isinstance(child, Element):
            if child.tag == tag:
                return child
            found = find(child, tag)
            if found:
                return found
    return None


def skipped(element):
    classes = element.attrs.get("class", "").split()
    return (element.tag in SKIPPED_TAGS or "hidden" in element.attrs
            or element.attrs.get("aria-hidden") == "true" or SKIPPED_CLASSES.intersection(classes))


def absolute(href, address):
    if href.startswith("#"):
        return SITE + address + href
    if href.startswith("/"):
        return SITE + href
    return href


def escape_markdown(text):
    return re.sub(r"([\\`*_\[\]<])", r"\\\1", text)


def joined(parts, text, after_element):
    """Add `text` to `parts`. Two elements written side by side, such as
    <strong>$33,000</strong><small>Down 4%</small>, still read as two words."""
    if after_element and parts and text and not parts[-1][-1:].isspace() and not text[:1].isspace():
        parts.append(" ")
    parts.append(text)


def add_text(parts, text, after_element):
    """Add page text to `parts`. Text running straight on from an element, as in
    <b>Optional</b>The dashboard... where the label is set on its own line,
    gets a space; punctuation, as in <a>help</a>., doesn't."""
    if after_element and text[:1].isalnum():
        joined(parts, escape_markdown(text), True)
    else:
        parts.append(escape_markdown(text))


def inline(element, address):
    """The element's contents as one line of Markdown."""
    parts = []
    after_element = False
    for child in element.children:
        if isinstance(child, str):
            add_text(parts, child, after_element)
            after_element = False
            continue
        before = len(parts)
        add_inline(parts, child, address, after_element)
        if len(parts) > before:
            after_element = True
    return "".join(parts)


def add_inline(parts, child, address, after_element):
    """Add one inline element to `parts`, as Markdown."""
    if skipped(child) or child.tag == "svg":
        return
    if child.tag == "br":
        parts.append(LINE_BREAK)
        return
    if child.tag == "img":
        alt = child.attrs.get("alt", "").strip()
        if alt:
            image = f"![{escape_markdown(alt)}]({absolute(child.attrs.get('src', ''), address)})"
            joined(parts, image, after_element)
        return
    text = inline(child, address)
    stripped = text.strip()
    if not stripped:
        if text:
            parts.append(" ")
        return
    lead = " " if text[:1].isspace() else ""
    tail = " " if text[-1:].isspace() else ""
    if child.tag == "a" and child.attrs.get("href"):
        text = f"{lead}[{stripped}]({absolute(child.attrs['href'], address)}){tail}"
    elif child.tag in ("b", "strong"):
        text = f"{lead}**{stripped}**{tail}"
    elif child.tag in ("em", "i"):
        text = f"{lead}*{stripped}*{tail}"
    elif child.tag == "code":
        text = f"{lead}`{stripped.replace(chr(92), '')}`{tail}"
    joined(parts, text, after_element)


def one_line(text):
    return re.sub(r"[ \t\r\n]*" + LINE_BREAK + r"[ \t\r\n]*", LINE_BREAK, re.sub(r"[ \t\r\n]+", " ", text)).strip()


def finish_line(text):
    return one_line(text).replace(LINE_BREAK, "  \n")


def blocks(element, address):
    """The element's contents as a list of Markdown blocks."""
    out = []
    run = []

    def flush():
        text = finish_line("".join(run))
        if text:
            out.append(text)
        run.clear()

    after_element = False
    for child in element.children:
        if isinstance(child, str):
            add_text(run, child, after_element)
            after_element = False
            continue
        if skipped(child):
            continue
        if child.tag not in BLOCK_TAGS:
            before = len(run)
            add_inline(run, child, address, after_element)
            if len(run) > before:
                after_element = True
            continue
        flush()
        after_element = False
        out.extend(block(child, address))
    flush()
    return out


def block(element, address):
    tag = element.tag
    if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
        text = finish_line(inline(element, address))
        return [("#" * int(tag[1])) + " " + text] if text else []
    if tag == "p" or tag == "figcaption":
        text = finish_line(inline(element, address))
        return [text] if text else []
    if tag == "summary":
        text = finish_line(inline(element, address))
        return ["**" + text + "**"] if text else []
    if tag in ("ul", "ol"):
        lines = []
        number = 0
        for item in element.children:
            if not isinstance(item, Element) or item.tag != "li" or skipped(item):
                continue
            number += 1
            marker = f"{number}. " if tag == "ol" else "- "
            item_blocks = blocks(item, address) or [""]
            indent = " " * len(marker)
            item = ("\n\n" + indent).join(part.replace("\n", "\n" + indent) for part in item_blocks)
            lines.append(marker + re.sub(r"\n +\n", "\n\n", item))
        # A list item of more than one paragraph needs blank lines between items too.
        loose = any("\n\n" in line for line in lines)
        return [("\n\n" if loose else "\n").join(lines)] if lines else []
    if tag == "dl":
        lines = []
        term = ""
        for child in element.children:
            if not isinstance(child, Element) or skipped(child):
                continue
            if child.tag == "dt":
                term = finish_line(inline(child, address))
            elif child.tag == "dd":
                text = finish_line(inline(child, address))
                lines.append(f"- **{term}**: {text}" if term else f"- {text}")
        return ["\n".join(lines)] if lines else []
    if tag == "table":
        rows = []

        def collect(node):
            for child in node.children:
                if isinstance(child, Element):
                    if child.tag == "tr":
                        rows.append([finish_line(inline(cell, address)).replace("|", "\\|")
                                     for cell in child.children
                                     if isinstance(cell, Element) and cell.tag in ("th", "td")])
                    elif child.tag in ("thead", "tbody", "tfoot"):
                        collect(child)

        collect(element)
        caption = find(element, "caption")
        width = max((len(row) for row in rows), default=0)
        if not width:
            return []
        rows = [row + [""] * (width - len(row)) for row in rows]
        lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
        lines += ["| " + " | ".join(row) + " |" for row in rows[1:]]
        out = []
        if caption:
            out.append(finish_line(inline(caption, address)))
        return out + ["\n".join(lines)]
    if tag == "blockquote":
        return ["\n".join("> " + line for line in "\n\n".join(blocks(element, address)).split("\n"))]
    if tag == "pre":
        return ["```\n" + "".join(text_of(element)).strip("\n") + "\n```"]
    if tag == "hr":
        return ["---"]
    if tag == "svg":
        # A chart says what it shows in its label.
        label = element.attrs.get("aria-label", "").strip()
        return ["*" + escape_markdown(label) + "*"] if element.attrs.get("role") == "img" and label else []
    return blocks(element, address)


def text_of(element):
    for child in element.children:
        if isinstance(child, str):
            yield child
        else:
            yield from text_of(child)


SITE_LINKS = [("Home", "/"), ("Dashboard", "/dashboard"), ("Help", "/help"), ("About", "/about"),
              ("Contact", "/contact"), ("Privacy", "/privacy"), ("Terms", "/terms"),
              ("llms.txt", "/llms.txt"), ("Sitemap", "/sitemap.xml")]


def page_markdown(file_name, page_html):
    """The page as Markdown, ending with links to the rest of the site."""
    address = PAGES[file_name][0]
    builder = TreeBuilder()
    builder.feed(page_html)
    main = find(builder.root, "main")
    body = "\n\n".join(blocks(main, address))
    links = " · ".join(f"[{label}]({SITE}{path})" for label, path in SITE_LINKS)
    ending = f"FinDash: {links}"
    if file_name != "404.html":
        ending = f"This is the Markdown version of {SITE}{address}.\n\n" + ending
    return f"{body}\n\n---\n\n{ending}\n"


def not_found_markdown(page_html):
    """The 404 page as Markdown, with every page an agent might have been after."""
    listed = [(PAGES[name][1], PAGES[name][0]) for name in PAGES if PAGES[name][3]]
    lines = [f"- [{title}]({SITE}{path})" for title, path in listed]
    finder = ("## Find what you were looking for\n\n"
              f"Every page is described in [llms.txt]({SITE}/llms.txt) and listed in the "
              f"[sitemap]({SITE}/sitemap.xml). Each one can be read as Markdown by sending "
              "`Accept: text/markdown`.\n\n" + "\n".join(lines))
    body, ending = page_markdown("404.html", page_html).rsplit("\n\n---\n\n", 1)
    return f"{body}\n\n{finder}\n\n---\n\n{ending}"


def markdown_module(pages):
    """lib/markdown-pages.js: each page's Markdown, the Markdown 404, and the
    files at the top of docs/ (which are served as they are)."""
    markdown = {}
    for name, (address, _title, _description, _listed) in PAGES.items():
        if name != "404.html":
            markdown[address] = page_markdown(name, pages[name])
    files = sorted(path.name for path in DOCS.iterdir() if path.is_file())
    return "\n".join([
        "// Written by tools/build-pages.py from the pages in docs/. Don't edit it by hand:",
        "// change the page, then run python3 tools/build-pages.py.",
        "",
        "export const PAGES = " + json.dumps(markdown, indent=2, ensure_ascii=False) + ";",
        "",
        "export const NOT_FOUND = " + json.dumps(not_found_markdown(pages["404.html"]), ensure_ascii=False) + ";",
        "",
        "export const FILES = " + json.dumps(files, indent=2) + ";",
        "",
    ])


def main():
    check = "--check" in sys.argv[1:]
    outputs = {}
    pages = {}
    for name in PAGES:
        if (DOCS / name).exists():
            pages[name] = updated_page(name)
            outputs[DOCS / name] = pages[name]
    outputs[MARKDOWN_MODULE] = markdown_module(pages)

    stale = []
    for path, text in outputs.items():
        current = path.read_text() if path.exists() else None
        if current == text:
            continue
        stale.append(path.relative_to(ROOT).as_posix())
        if not check:
            path.write_text(text)
            print("updated", path.relative_to(ROOT).as_posix())
    if check and stale:
        print("out of date (run python3 tools/build-pages.py): " + ", ".join(stale))
        sys.exit(1)


main()
