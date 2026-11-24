// Draft #4: tilt and sheen follow a mouse or pen. Touch keeps the existing drag.
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
const maxTilt = { x: 7, y: 9 };

function rest(card) {
  card.classList.remove('is-hovered');
  for (const name of ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y']) card.style.removeProperty(name);
}

document.querySelectorAll('.project-card').forEach(card => {
  const project = card.closest('.project');

  card.addEventListener('pointermove', event => {
    if (!finePointer.matches || stillMotion.matches || project.classList.contains('is-dragging')) return;
    // Measure the untilted slot so the tilt doesn't feed back into itself.
    const bounds = project.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    card.classList.remove('is-leaving');
    card.classList.add('is-hovered');
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 2 * maxTilt.x}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 2 * maxTilt.y}deg`);
    card.style.setProperty('--sheen-x', `${x * 100}%`);
    card.style.setProperty('--sheen-y', `${y * 100}%`);
  });

  card.addEventListener('pointerleave', () => {
    card.classList.add('is-leaving');
    rest(card);
  });
});

// The flip into the dialog measures and clones the card, so flatten it first.
document.querySelector('#deck').addEventListener('click', event => {
  const card = event.target.closest('.project-card');
  if (!card) return;
  rest(card);
  card.classList.add('is-flat');
  card.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-flat')));
}, { capture: true });
