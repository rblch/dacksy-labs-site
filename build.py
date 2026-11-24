"""Build the site in every language.

Pages live in src/, text lives in i18n/<lang>.json. Run `python3 build.py`
after changing either; it writes English to the site root and the other
languages to /<lang>/. Commit the output: hosting serves plain files.

In the templates, {{key}} inserts a string from the language file (escaped),
except keys ending in _html, which are inserted as written. Long pages like the
legal texts use one template per language instead: src/<page>.<lang>.html wins
over src/<page>.html for that language.
"""
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LANGUAGES = ['en', 'es', 'de']  # The first one is the default, served from the root.
PAGES = ['index.html', 'about.html', 'contact.html', 'impressum.html', 'datenschutz.html']
# Pages with names, addresses or contact details. Search engines may read them
# but are told not to list them (a robots.txt block would hide the noindex tag
# from them); AI crawlers are kept out of them in robots.txt.
PRIVATE_PAGES = ['contact.html', 'impressum.html', 'datenschutz.html']
AI_CRAWLERS = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
    'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
    'Google-Extended', 'Applebot-Extended', 'CCBot',
    'PerplexityBot', 'Perplexity-User', 'Meta-ExternalAgent', 'Meta-ExternalFetcher',
    'Bytespider', 'Amazonbot', 'cohere-ai', 'Diffbot', 'DuckAssistBot',
    'MistralAI-User', 'YouBot',
]
# Set to the live origin (e.g. "https://example.com") to emit hreflang alternates.
SITE_URL = "https://dacksylabs.com"

# Stylesheet and scripts are linked with a fingerprint of their contents (?v=...), so a
# browser fetches the new file after a deploy instead of pairing new pages with a cached
# old one. Add a file here when a page starts linking it.
VERSIONED_ASSETS = ['site.css', 'site.js', 'nav.js']
versions = {
    'version_' + name.replace('.', '_'): hashlib.sha256((ROOT / 'assets' / name).read_bytes()).hexdigest()[:10]
    for name in VERSIONED_ASSETS
}

partials = {name: (ROOT / 'src' / f'_{name}.html').read_text().rstrip('\n') for name in ['head', 'header', 'footer']}
strings = {lang: json.loads((ROOT / 'i18n' / f'{lang}.json').read_text()) for lang in LANGUAGES}

for lang in LANGUAGES[1:]:
    missing = strings[LANGUAGES[0]].keys() ^ strings[lang].keys()
    if missing:
        raise SystemExit(f'{lang}.json does not match {LANGUAGES[0]}.json: {", ".join(sorted(missing))}')


def folder(lang):
    return '' if lang == LANGUAGES[0] else f'{lang}/'


def fill(template, values):
    def replace(match):
        key = match.group(1)
        if key not in values:
            raise SystemExit(f'No value for {{{{{key}}}}}')
        value = values[key]
        return value if key.endswith('_html') or key in RAW else html.escape(value)
    # Partials can contain slots, so fill until nothing is left.
    while '{{' in template:
        template = re.sub(r'\{\{(\w+)\}\}', replace, template)
    return template


RAW = {'head', 'header', 'footer', 'language_links', 'alternates', 'robots_meta'} | {f'current_{p[:-5]}' for p in PAGES}

for lang in LANGUAGES:
    root = '../' if folder(lang) else ''
    for page in PAGES:
        links = []
        for other in LANGUAGES:
            current = ' aria-current="true"' if other == lang else ''
            href = f'{root}{folder(other)}{page}'
            links.append(
                f'          <li><a href="{href}" hreflang="{other}" lang="{other}"{current}>'
                f'{html.escape(strings[other]["lang_name"])}</a></li>'
            )
        alternates = ''
        if SITE_URL:
            alternates = ''.join(
                f'  <link rel="alternate" hreflang="{other}" href="{SITE_URL}/{folder(other)}{page}">\n'
                for other in LANGUAGES
            ) + f'  <link rel="alternate" hreflang="x-default" href="{SITE_URL}/{page}">\n'

        values = {
            **strings[lang],
            **partials,
            'lang': lang,
            'lang_code': lang.upper(),
            'root': root,
            **versions,
            'language_links': '\n'.join(links),
            'alternates': alternates,
            'robots_meta': '  <meta name="robots" content="noindex, noarchive">\n' if page in PRIVATE_PAGES else '',
            **{f'current_{p[:-5]}': ' aria-current="page"' if p == page else '' for p in PAGES},
        }
        # A page can have its own template per language, e.g. src/impressum.en.html.
        localized = ROOT / 'src' / page.replace('.html', f'.{lang}.html')
        template = localized if localized.exists() else ROOT / 'src' / page
        output = fill(template.read_text(), values)
        if '<mark>' in output:
            print(f'warning: src/{template.name} still has placeholders marked with <mark>')
        output = output.replace('<!doctype html>', f'<!doctype html>\n<!-- Built by build.py from src/{template.name}. Edit there, not here. -->', 1)
        target = ROOT / folder(lang) / page
        target.parent.mkdir(exist_ok=True)
        target.write_text(output)
        print(f'wrote {target.relative_to(ROOT)}')

private_paths = [f'/{folder(lang)}{page}' for lang in LANGUAGES for page in PRIVATE_PAGES]
robots = ['# Built by build.py. Edit PRIVATE_PAGES and AI_CRAWLERS there, not here.', '']
robots += ['# Search engines may read every page; contact and legal pages carry a noindex tag.',
           'User-agent: *', 'Allow: /', '']
robots += ['# AI crawlers and agents: keep out of pages with names and contact details.']
robots += [f'User-agent: {bot}' for bot in AI_CRAWLERS]
robots += [f'Disallow: {path}' for path in private_paths]
(ROOT / 'robots.txt').write_text('\n'.join(robots) + '\n')
print('wrote robots.txt')
