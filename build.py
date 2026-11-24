"""Build the site in every language.

Pages live in src/, text lives in i18n/<lang>.json. Run `python3 build.py`
after changing either; it writes English to the site root and the other
languages to /<lang>/. Commit the output: hosting serves plain files.

In the templates, {{key}} inserts a string from the language file (escaped),
except keys ending in _html, which are inserted as written.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LANGUAGES = ['en', 'es', 'de']  # The first one is the default, served from the root.
PAGES = ['index.html', 'about.html', 'contact.html', 'impressum.html']
# Set to the live origin (e.g. "https://example.com") to emit hreflang alternates.
SITE_URL = None

partials = {name: (ROOT / 'src' / f'_{name}.html').read_text().rstrip('\n') for name in ['head', 'header']}
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


RAW = {'head', 'header', 'language_links', 'alternates'} | {f'current_{p[:-5]}' for p in PAGES}

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
            )

        values = {
            **strings[lang],
            **partials,
            'lang': lang,
            'lang_code': lang.upper(),
            'root': root,
            'language_links': '\n'.join(links),
            'alternates': alternates,
            **{f'current_{p[:-5]}': ' aria-current="page"' if p == page else '' for p in PAGES},
        }
        output = fill((ROOT / 'src' / page).read_text(), values)
        output = output.replace('<!doctype html>', f'<!doctype html>\n<!-- Built by build.py from src/{page}. Edit there, not here. -->', 1)
        target = ROOT / folder(lang) / page
        target.parent.mkdir(exist_ok=True)
        target.write_text(output)
        print(f'wrote {target.relative_to(ROOT)}')
