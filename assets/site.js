const deck = document.querySelector('#deck');
const projects = [...deck.querySelectorAll('.project')];
const slots = ['left', 'center', 'right'];
const status = document.querySelector('#deck-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width: 38rem)');
const cardMotions = new Map();
const dragInset = 12;
let drag = null;
let swallowClick = false;
let hasReordered = false;

const cardOf = project => project.querySelector('.project-card');
const projectIn = slot => projects.find(project => project.dataset.slot === slot);

/* Layout: Dackel leads on the left of the row, or on top of the stack on small screens. */

function placeFeaturedCard() {
  const [dackel, coral] = projects;
  dackel.dataset.slot = compact.matches ? 'center' : 'left';
  coral.dataset.slot = compact.matches ? 'left' : 'center';
}

placeFeaturedCard();
compact.addEventListener('change', () => {
  if (!hasReordered && !drag?.active) placeFeaturedCard();
});

/* Moving cards between slots */

function pauseCard(project) {
  const { transform, translate } = getComputedStyle(project);
  // Capture the lift separately so a second gesture starts from the visible position.
  const [, lift = '0px'] = translate.split(' ');
  cardMotions.get(project)?.animation.cancel();
  cardMotions.delete(project);
  return `translateY(${lift}) ${transform}`;
}

function settleCard(project, from, lift = 0) {
  const restingTransform = getComputedStyle(project).transform;
  const to = `translateY(0px) ${restingTransform}`;
  if (reducedMotion.matches || from === to) return;

  const animation = project.animate({
    transform: [from, to],
    translate: ['0px 0px', `0px ${lift}px`, '0px 0px']
  }, {
    duration: 360,
    easing: 'cubic-bezier(0.22, 0.72, 0.28, 1)'
  });

  cardMotions.set(project, { animation, restingTransform });
  animation.onfinish = () => {
    if (cardMotions.get(project)?.animation === animation) cardMotions.delete(project);
  };
}

function swapLift(from, to) {
  if (to === 'center') return -26;
  return from === 'center' ? 12 : 0;
}

function moveToSlot(project, slot) {
  if (drag?.active) return;
  const origin = project.dataset.slot;
  const occupant = origin === slot ? null : projectIn(slot);
  if (!occupant && !project.classList.contains('is-dragging')) return;

  const from = pauseCard(project);
  project.classList.remove('is-dragging');
  project.style.removeProperty('transform');

  if (!occupant) {
    settleCard(project, from);
    return;
  }

  const occupantFrom = pauseCard(occupant);
  hasReordered = true;
  occupant.dataset.slot = origin;
  project.dataset.slot = slot;
  settleCard(project, from, swapLift(origin, slot));
  settleCard(occupant, occupantFrom, swapLift(slot, origin));
  if (origin === 'center' || slot === 'center') {
    status.textContent = `${cardOf(projectIn('center')).getAttribute('aria-label')} is centered.`;
  }
}

deck.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const project = projectIn(event.key === 'ArrowLeft' ? 'left' : 'right');
  moveToSlot(project, 'center');
  cardOf(project).focus({ preventScroll: true });
});

/* Dragging */

// Lets a card travel freely, then springs it short of the deck's edge.
function elasticOffset(distance, position, halfSize, areaSize) {
  const room = distance < 0 ? position - halfSize : areaSize - position - halfSize;
  const limit = Math.max(0, room - dragInset);
  const spring = Math.min(56, limit / 2);
  const freeTravel = limit - spring;
  const compression = Math.abs(distance) - freeTravel;
  if (compression <= 0) return distance;
  return Math.sign(distance) * (freeTravel + spring * compression / (spring + compression));
}

deck.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || drag) return;
  swallowClick = false;
  const project = event.target.closest('.project');
  if (!project) return;

  const right = projectIn('right');
  const rightTransform = cardMotions.get(right)?.restingTransform ?? getComputedStyle(right).transform;
  drag = {
    project,
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    spread: new DOMMatrix(rightTransform).e + right.offsetWidth / 2,
    active: false
  };
});

window.addEventListener('pointermove', event => {
  if (event.pointerId !== drag?.id) return;
  const x = event.clientX - drag.startX;
  const y = event.clientY - drag.startY;

  if (!drag.active) {
    if (Math.max(Math.abs(x), Math.abs(y)) < 6) return;
    if (event.pointerType !== 'mouse' && Math.abs(y) > Math.abs(x)) return;
    const area = deck.getBoundingClientRect();
    const bounds = drag.project.getBoundingClientRect();
    Object.assign(drag, {
      area,
      centerX: bounds.left + bounds.width / 2 - area.left,
      centerY: bounds.top + bounds.height / 2 - area.top,
      halfWidth: bounds.width / 2,
      width: drag.project.offsetWidth,
      height: drag.project.offsetHeight,
      matrix: new DOMMatrix(getComputedStyle(drag.project).transform),
      active: true,
      from: pauseCard(drag.project)
    });
    drag.project.classList.add('is-dragging');
    deck.setPointerCapture(event.pointerId);
  }

  const { area, centerX, centerY, width, height, matrix } = drag;
  const travel = elasticOffset(x, centerX, drag.halfWidth, area.width);
  const tilt = reducedMotion.matches ? 0 : Math.max(-16, Math.min(16, travel / 13));
  const rotated = matrix.rotate(tilt);
  const halfWidth = (Math.abs(rotated.a) * width + Math.abs(rotated.c) * height) / 2;
  const halfHeight = (Math.abs(rotated.b) * width + Math.abs(rotated.d) * height) / 2;
  const offsetX = elasticOffset(x, centerX, halfWidth, area.width);
  const offsetY = elasticOffset(y * 0.6, centerY, halfHeight, area.height);
  drag.project.style.transform = `translate(${offsetX}px, ${offsetY}px) ${drag.from} rotate(${tilt}deg)`;
});

function finishDrag(event) {
  if (event.pointerId !== drag?.id) return;
  const { project, startX, spread, active } = drag;
  drag = null;
  if (!active) return;

  swallowClick = true;
  const distance = event.clientX - startX;
  let target = project.dataset.slot;
  if (event.type === 'pointerup' && Math.abs(distance) >= Math.max(24, spread * 0.3)) {
    const start = slots.indexOf(target);
    const steps = Math.max(1, Math.round(Math.abs(distance) / spread));
    const end = Math.max(0, Math.min(slots.length - 1, start + Math.sign(distance) * steps));
    target = slots[end];
  }

  moveToSlot(project, target);
}

const cancelDrag = () => drag && finishDrag({ pointerId: drag.id });

window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
deck.addEventListener('lostpointercapture', event => {
  if (event.target === deck) finishDrag(event);
});
window.addEventListener('blur', cancelDrag);
window.addEventListener('resize', cancelDrag);

// A drag ends with a click on the card; don't let it open the card.
deck.addEventListener('click', event => {
  if (!swallowClick || event.detail === 0) return;
  swallowClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);

/* Flipping a card open into a dialog */

const projectDialog = document.querySelector('#project-details');
const flip = projectDialog.querySelector('.project-flip');
const flipFront = projectDialog.querySelector('.project-flip-front');
const projectTitle = document.querySelector('#project-details-title');
const projectCopy = document.querySelector('#project-details-copy');
const projectVisit = document.querySelector('#project-visit');
const projectArt = projectDialog.querySelector('.project-back-art');
const expandedTransform = 'perspective(1200px) translate(0px, 0px) rotateZ(0deg) scale(1, 1) rotateY(180deg)';
let openCard = null;
let flipAnimation = null;
let closingCard = false;
let returnFocus = 'keyboard';

// The dialog transform that lines its front face up with the card in the deck.
function restingCardTransform(card) {
  const resting = card.getBoundingClientRect();
  const panel = projectDialog.getBoundingClientRect();
  const matrix = new DOMMatrix(getComputedStyle(card.closest('.project')).transform);
  const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
  const scale = Math.hypot(matrix.a, matrix.b);
  const x = resting.left + resting.width / 2 - panel.left - panel.width / 2;
  const y = resting.top + resting.height / 2 - panel.top - panel.height / 2;
  const scaleX = scale * card.offsetWidth / panel.width;
  const scaleY = scale * card.offsetHeight / panel.height;
  return `perspective(1200px) translate(${x}px, ${y}px) rotateZ(${rotation}deg) scale(${scaleX}, ${scaleY}) rotateY(0deg)`;
}

function sizeProjectFace(face, card) {
  // The face is cloned outside the deck, so it needs the deck's sizing.
  face.style.setProperty('--card-width', `${card.offsetWidth}px`);
  face.style.setProperty('--card-ratio', getComputedStyle(card).getPropertyValue('--card-ratio'));
  face.style.width = `${card.offsetWidth}px`;
  face.style.height = `${card.offsetHeight}px`;
  face.style.scale = `${projectDialog.offsetWidth / card.offsetWidth} ${projectDialog.offsetHeight / card.offsetHeight}`;
}

function showProject(project, card) {
  if (projectDialog.open) return;
  const image = card.querySelector('.project-art');
  const { description, url } = project.dataset;
  projectTitle.textContent = card.querySelector('.project-name').textContent;
  projectCopy.textContent = description ?? '';
  projectCopy.hidden = !description;
  projectVisit.hidden = !url;
  projectVisit.removeAttribute('href');
  if (url) projectVisit.href = url;
  projectArt.hidden = !image;
  if (image) projectArt.querySelector('img').src = image.src;
  projectDialog.style.setProperty('--card', getComputedStyle(card).getPropertyValue('--card'));
  projectDialog.showModal();
  // Resolve the transparent backdrop before starting its fade.
  getComputedStyle(projectDialog, '::backdrop').opacity;
  projectDialog.classList.add('is-dimmed');
  openCard = card;

  if (!reducedMotion.matches) {
    const face = card.cloneNode(true);
    sizeProjectFace(face, card);
    flipFront.replaceChildren(face);
    flipAnimation = flip.animate(
      [{ transform: restingCardTransform(card) }, { transform: expandedTransform }],
      { duration: 440, easing: 'cubic-bezier(0.25, 0.65, 0.25, 1)', fill: 'both' }
    );
  }
  card.classList.add('is-open');
}

function finishProjectClose() {
  openCard.dataset.focusReturn = returnFocus;
  openCard.classList.remove('is-open');
  projectDialog.close();
  flipAnimation?.cancel();
  flipAnimation = null;
  flipFront.replaceChildren();
  openCard.focus({ preventScroll: true });
  openCard.addEventListener('blur', event => {
    delete event.currentTarget.dataset.focusReturn;
  }, { once: true });
  openCard = null;
  closingCard = false;
}

function closeProject(focusSource = 'keyboard') {
  if (!projectDialog.open || closingCard) return;
  closingCard = true;
  returnFocus = focusSource;
  projectDialog.classList.remove('is-dimmed');
  if (reducedMotion.matches || !flipFront.firstChild) {
    finishProjectClose();
    return;
  }

  if (flipAnimation?.playState === 'running') {
    flipAnimation.reverse();
  } else {
    flipAnimation?.cancel();
    sizeProjectFace(flipFront.firstChild, openCard);
    flipAnimation = flip.animate(
      [{ transform: expandedTransform }, { transform: restingCardTransform(openCard) }],
      { duration: 350, easing: 'cubic-bezier(0.4, 0, 0.35, 1)', fill: 'both' }
    );
  }
  flipAnimation.onfinish = finishProjectClose;
}

projectDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeProject();
});
projectDialog.addEventListener('click', event => {
  if (event.target === projectDialog) closeProject('pointer');
});

projects.forEach(project => {
  const card = cardOf(project);
  card.addEventListener('click', () => showProject(project, card));
});

/* Entrance */

const lastCard = projects.at(-1);
const stopEntrance = () => deck.classList.remove('is-entering');

deck.addEventListener('animationend', event => {
  if (event.target.closest('.project') === lastCard) stopEntrance();
});
deck.addEventListener('pointerdown', stopEntrance, { capture: true });
deck.addEventListener('keydown', stopEntrance, { capture: true });
if (!reducedMotion.matches) deck.classList.add('is-entering');
