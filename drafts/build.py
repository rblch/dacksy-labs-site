"""Regenerate the draft pages from index.html: python3 drafts/build.py"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
page = (root / 'index.html').read_text()
for name in ['assets/', 'index.html"', 'about.html', 'contact.html', 'impressum.html']:
    page = page.replace(f'"{name}', f'"../{name}')

def draft(file, title, css, js=None, edits=()):
    html = page.replace('<title>Dacksy Labs</title>', f'<title>Draft: {title} · Dacksy Labs</title>')
    html = html.replace('</head>', f'  <link rel="stylesheet" href="{css}">\n</head>')
    if js:
        html = html.replace('</body>', f'  <script src="{js}"></script>\n</body>')
    for old, new in edits:
        assert old in html, old
        html = html.replace(old, new)
    (root / 'drafts' / file).write_text(html)

soon = 'Still developing. Check back soon.'
draft('develop.html', 'Still developing', 'develop.css', edits=[
    ('<li class="project project--coral" data-slot="center">',
     f'<li class="project project--coral" data-slot="center" data-description="{soon}">'),
    ('<li class="project project--lilac" data-slot="right">',
     f'<li class="project project--lilac" data-slot="right" data-description="{soon}">'),
    ('<button class="project-card" type="button" aria-haspopup="dialog" aria-label="Coral',
     '<button class="project-card is-soon" type="button" aria-haspopup="dialog" aria-label="Coral'),
    ('<button class="project-card" type="button" aria-haspopup="dialog" aria-label="Lilac',
     '<button class="project-card is-soon" type="button" aria-haspopup="dialog" aria-label="Lilac'),
])
draft('physical.html', 'Physical prints', 'physical.css', 'physical.js')
