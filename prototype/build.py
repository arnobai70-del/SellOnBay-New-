#!/usr/bin/env python3
"""Builds dist/ from src/. Every page shares one nav, footer and dashboard shell."""
import re, shutil, pathlib

ROOT = pathlib.Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">'

LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#2B3DFF"/><path d="M9 11h14M9 11v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="21.5" cy="7.5" r="3.4" fill="#FFB52E"/></svg>'

def logo(href="index.html"):
    return f'<a class="logo" href="{href}">{LOGO}<span>Launchbay</span></a>'

NAV_ITEMS = [("browse.html", "Browse sites", "browse"), ("sell.html", "Sell on Launchbay", "sell"), ("index.html#how", "How it works", "how"), ("index.html#faq", "FAQ", "faq")]

def site_nav(active):
    links = "".join(f'<a href="{h}"{" aria-current=\"page\"" if k == active else ""}>{t}</a>' for h, t, k in NAV_ITEMS)
    return f'''<header class="nav"><div class="wrap">{logo()}<nav class="nav-links" aria-label="Main">{links}</nav>
<div class="nav-end"><a class="btn btn-line btn-sm hide-m" href="login.html">Sign in</a><a class="btn btn-gold btn-sm" href="browse.html">Find a site</a></div>
<button class="nav-toggle" aria-label="Menu" aria-expanded="false"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></header>'''

FOOT = f'''<footer class="foot"><div class="wrap"><div class="cols">
<div>{logo()}<p class="muted" style="margin-top:14px;max-width:32ch">Ready-made websites and small tools, live on your own domain in 1 to 3 days.</p></div>
<div><h4>Buy</h4><ul><li><a href="browse.html">Browse sites</a></li><li><a href="browse.html?cat=Restaurants">Restaurants</a></li><li><a href="browse.html?cat=Stores">Online stores</a></li><li><a href="browse.html?cat=Tools">Small tools</a></li></ul></div>
<div><h4>Sell</h4><ul><li><a href="sell.html">List a site</a></li><li><a href="dashboard-seller.html">Seller dashboard</a></li><li><a href="index.html#faq">Fees and payouts</a></li></ul></div>
<div><h4>Help</h4><ul><li><a href="index.html#faq">FAQ</a></li><li><a href="messages.html">Messages</a></li><li><a href="#">Terms of service</a></li><li><a href="#">Privacy policy</a></li><li><a href="#">Report abuse</a></li></ul></div>
</div><div class="base"><span>&copy; 2026 Launchbay</span><span>Payments held in escrow until you accept your site.</span></div></div></footer>'''

ICON = {
    "grid": '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    "bag": '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    "chat": '<path d="M4 5h16v11H9l-5 4z"/>',
    "wallet": '<path d="M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l12-3v3M16 13h2"/>',
    "list": '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    "shield": '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    "flag": '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "home": '<path d="M4 11l8-7 8 7v9H4z"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    "alert": '<path d="M12 4l9 16H3zM12 10v4M12 17v.01"/>',
}
def ico(n):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[n]}</svg>'

DASH = {
    "buyer": ("Maria Alvarez", "Buyer", "M", [
        ("Overview", "dashboard-buyer.html", "grid", "buyer"), ("Messages", "messages.html", "chat", "messages")],
        [("Browse sites", "browse.html", "bag"), ("Back to site", "index.html", "home")]),
    "seller": ("Mira Chen", "Seller", "M", [
        ("Overview", "dashboard-seller.html", "grid", "seller"), ("Messages", "messages.html", "chat", "messages")],
        [("List a new site", "sell.html", "plus"), ("Back to site", "index.html", "home")]),
    "admin": ("Sam Ortiz", "Admin", "S", [
        ("Overview", "dashboard-admin.html", "shield", "admin"), ("Messages", "messages.html", "chat", "messages")],
        [("Back to site", "index.html", "home")]),
}

def dash_shell(role, active, title, body):
    name, label, initial, items, extra = DASH[role]
    main = "".join(f'<a class="it" href="{h}"{" aria-current=\"page\"" if k == active else ""}>{ico(i)}<span>{t}</span></a>' for t, h, i, k in items)
    more = "".join(f'<a class="it" href="{h}">{ico(i)}<span>{t}</span></a>' for t, h, i in extra)
    switch = "".join(f'<a class="it" href="dashboard-{r}.html">{ico("user")}<span>{r.title()} view</span></a>' for r in DASH if r != role)
    return f'''<div class="dash"><aside class="side" aria-label="Dashboard">{logo()}{main}<div class="grp">Go to</div>{more}<div class="grp">Switch view</div>{switch}
<div class="who"><span class="av">{initial}</span><div><b>{name}</b><small>{label}</small></div></div></aside>
<div class="main"><div class="top"><button class="menu-btn" aria-label="Open menu"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><h1>{title}</h1>
<label class="search"><span class="sr">Search</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E6485" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input placeholder="Search orders, sites, people"></label></div>
<div class="content">{body}</div></div></div>'''

def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)
    shutil.copy(SRC / "styles.css", DIST / "assets/styles.css")
    shutil.copy(SRC / "app.js", DIST / "assets/app.js")
    for f in sorted(SRC.glob("*.html")):
        raw = f.read_text(encoding="utf-8")
        meta = dict(re.findall(r"(\w+)=([^;>]+?)\s*(?:;|-->)", raw.split("\n", 1)[0]))
        body = raw.split("\n", 1)[1]
        title, layout, active = meta.get("title", "Launchbay"), meta.get("layout", "site"), meta.get("active", "")
        if layout == "dash":
            role = meta["role"]
            inner = dash_shell(role, active, meta.get("heading", title), body)
        elif layout == "bare":
            inner = f'{site_nav("")}{body}'
        else:
            inner = f'{site_nav(active)}<main id="main">{body}</main>{FOOT}'
        page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · Launchbay</title><meta name="description" content="Ready-made websites and tools on your own domain in 1 to 3 days.">
{FONTS}<link rel="stylesheet" href="assets/styles.css"></head><body>{inner}<script src="assets/app.js" defer></script></body></html>'''
        (DIST / f.name).write_text(page, encoding="utf-8")
        print("built", f.name)

if __name__ == "__main__":
    build()
