const previewObserver = new ResizeObserver(entries => {
  for (const { target, contentRect } of entries) {
    target.style.setProperty('--preview-scale', contentRect.width / 860);
  }
});
document.querySelectorAll('.preview').forEach(preview => previewObserver.observe(preview));

document.querySelectorAll('[data-swatch]').forEach(swatch => {
  const color = getComputedStyle(swatch).getPropertyValue('--swatch').trim();
  swatch.querySelector('code').textContent = color.toUpperCase();
});

document.querySelectorAll('[data-replay]').forEach(button => {
  button.addEventListener('click', () => {
    const scope = button.dataset.replay === 'all' ? document : button.closest('article');
    scope.querySelectorAll('.preview iframe').forEach(frame => {
      // Local file previews have an opaque origin. The message carries no page data.
      frame.contentWindow.postMessage('dacksy-replay-entrance', '*');
    });
  });
});
