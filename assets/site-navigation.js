const pageOptions = new URLSearchParams(location.search);
const designOptions = new URLSearchParams();

for (const key of ['variation', 'palette', 'entrance']) {
  if (pageOptions.has(key)) designOptions.set(key, pageOptions.get(key));
}

const designQuery = designOptions.toString();

if (designQuery) {
  for (const link of document.querySelectorAll('[data-site-link]')) {
    const target = new URL(link.getAttribute('href'), location.href);
    target.search = designQuery;
    link.href = target.href;
  }
}
