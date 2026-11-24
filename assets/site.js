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

/* Position dots for the phone stack */

const dots = document.createElement('div');
dots.className = 'deck-dots';
const dotOf = new Map(projects.map(project => {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'deck-dot';
  dot.setAttribute('aria-label', cardOf(project).getAttribute('aria-label'));
  dot.addEventListener('click', () => {
    const slot = project.dataset.slot;
    if (slot !== 'center') shiftStack(slot === 'right' ? 'next' : 'previous');
  });
  dots.append(dot);
  return [project, dot];
}));
deck.after(dots);

function updateDots() {
  dotOf.forEach((dot, project) => {
    dot.setAttribute('aria-current', project.dataset.slot === 'center');
  });
}

function announceCenter() {
  updateDots();
  const name = cardOf(projectIn('center')).getAttribute('aria-label');
  status.textContent = status.dataset.template.replace('{name}', name);
}

/* Layout: Dackel leads on the left of the row, or on top of the stack on small screens.
   In the stack, the card peeking out on the right is next and the one on the left is previous. */

function placeFeaturedCard() {
  const [dackel, coral, lilac] = projects;
  dackel.dataset.slot = compact.matches ? 'center' : 'left';
  coral.dataset.slot = compact.matches ? 'right' : 'center';
  lilac.dataset.slot = compact.matches ? 'left' : 'right';
  updateDots();
}

placeFeaturedCard();

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
  if (origin === 'center' || slot === 'center') announceCenter();
}

/* The phone stack: cards cycle through it, next from the right, previous from the left. */

const stackVars = ['--slot-x', '--slot-y', '--slot-turn', '--slot-scale'];
const clearStackVars = project => stackVars.forEach(name => project.style.removeProperty(name));

// Animates a card from where it is drawn now to its resting place.
function glide(project, from, { duration = 380, easing = 'cubic-bezier(0.22, 0.72, 0.28, 1)' } = {}) {
  const to = getComputedStyle(project).transform;
  if (reducedMotion.matches || from === to) return;
  const animation = project.animate({ transform: [from, to] }, { duration, easing });
  cardMotions.set(project, { animation, restingTransform: to });
  animation.onfinish = () => {
    if (cardMotions.get(project)?.animation === animation) cardMotions.delete(project);
  };
}

// Next: the top card goes under the left of the pile and the right one comes up.
// Previous: the reverse. A thrown card first flies off the screen the way it was thrown.
function shiftStack(direction, throwFrom = null) {
  const top = projectIn('center');
  const incoming = projectIn(direction === 'next' ? 'right' : 'left');
  const third = projectIn(direction === 'next' ? 'left' : 'right');
  const from = new Map([top, incoming, third].map(project => {
    const motion = cardMotions.get(project);
    const drawn = getComputedStyle(project).transform;
    motion?.animation.cancel();
    cardMotions.delete(project);
    return [project, drawn];
  }));

  [top, incoming, third].forEach(project => {
    clearStackVars(project);
    project.classList.remove('is-dragging');
    project.style.removeProperty('transform');
  });
  top.dataset.slot = direction === 'next' ? 'left' : 'right';
  incoming.dataset.slot = 'center';
  third.dataset.slot = direction === 'next' ? 'right' : 'left';
  hasReordered = true;
  announceCenter();

  glide(incoming, from.get(incoming));
  glide(third, from.get(third));
  if (!throwFrom) {
    glide(top, from.get(top));
    return;
  }
  if (reducedMotion.matches) return;

  // Fly off with the release speed, then slide back in under the pile.
  const side = throwFrom.side;
  const resting = getComputedStyle(top).transform;
  const offscreen = `translate(${side * (innerWidth / 2 + top.offsetWidth)}px, 0px) ${throwFrom.transform} rotate(${side * 10}deg)`;
  const flight = Math.min(280, Math.max(150, innerWidth / Math.max(0.8, Math.abs(throwFrom.speed))));
  const animation = top.animate([
    { transform: `translate(0px, 0px) ${throwFrom.transform} rotate(0deg)`, zIndex: 3, easing: 'cubic-bezier(0.3, 0.6, 0.6, 1)' },
    { transform: offscreen, zIndex: 3, offset: 0.45 },
    { transform: offscreen, zIndex: 0, offset: 0.4501, easing: 'cubic-bezier(0.22, 0.72, 0.28, 1)' },
    { transform: `translate(0px, 0px) ${resting} rotate(0deg)`, zIndex: 0 }
  ], { duration: flight / 0.45 });
  cardMotions.set(top, { animation, restingTransform: resting });
  animation.onfinish = () => {
    if (cardMotions.get(top)?.animation === animation) cardMotions.delete(top);
  };
}

deck.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  if (drag?.active) return;
  if (compact.matches) {
    shiftStack(event.key === 'ArrowLeft' ? 'previous' : 'next');
  } else {
    moveToSlot(projectIn(event.key === 'ArrowLeft' ? 'left' : 'right'), 'center');
  }
  cardOf(projectIn('center')).focus({ preventScroll: true });
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

  if (compact.matches) {
    if (project.dataset.slot !== 'center') return;
    const bounds = project.getBoundingClientRect();
    drag = {
      stack: true,
      project,
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Held above its middle, the card swings the other way than when held below it.
      grip: event.clientY < bounds.top + bounds.height / 2 ? 1 : -1,
      samples: [],
      active: false
    };
    return;
  }

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

// The top card follows the finger; the next card grows into place under it.
function dragStack(event, x, y) {
  if (!drag.active) {
    if (Math.hypot(x, y) < 8) return;
    if (Math.abs(y) > Math.abs(x)) {
      drag = null;
      return;
    }
    const others = projects.filter(project => project !== drag.project);
    [drag.project, ...others].forEach(project => {
      cardMotions.get(project)?.animation.cancel();
      cardMotions.delete(project);
    });
    Object.assign(drag, {
      active: true,
      from: getComputedStyle(drag.project).transform,
      width: drag.project.offsetWidth
    });
    drag.project.classList.add('is-dragging');
    deck.setPointerCapture(event.pointerId);
  }

  drag.samples.push({ x, time: event.timeStamp });
  while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].time > 100) drag.samples.shift();

  const tilt = reducedMotion.matches ? 0 : Math.max(-20, Math.min(20, x / drag.width * 14 * drag.grip));
  drag.project.style.transform = `translate(${x}px, ${y * 0.25}px) ${drag.from} rotate(${tilt}deg)`;

  // Swiping either way brings up the next card, which waits on the right.
  const incoming = projectIn('right');
  const rest = 1 - Math.min(1, Math.abs(x) / (drag.width * 0.8));
  const side = 1;
  incoming.style.setProperty('--slot-x', `calc(var(--spread) * ${side * rest})`);
  incoming.style.setProperty('--slot-y', `${0.6 * rest}rem`);
  incoming.style.setProperty('--slot-turn', `${side * 5 * rest}deg`);
  incoming.style.setProperty('--slot-scale', `${1 - 0.1 * rest}`);
}

function releaseStack(event) {
  const { project, samples, width, startX } = drag;
  drag = null;
  const x = (event.clientX ?? startX + (samples.at(-1)?.x ?? 0)) - startX;
  const [first, last] = [samples[0], samples.at(-1)];
  const speed = last && last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0;
  const flicked = Math.abs(speed) > 0.4 && Math.sign(speed) === Math.sign(x) && Math.abs(x) > 16;
  const thrown = event.type === 'pointerup' && (Math.abs(x) > width / 3 || flicked);

  if (thrown) {
    shiftStack('next', { transform: getComputedStyle(project).transform, speed, side: Math.sign(x) });
    return;
  }

  // Not far or fast enough: everything springs back.
  projects.forEach(card => {
    const from = getComputedStyle(card).transform;
    clearStackVars(card);
    card.classList.remove('is-dragging');
    card.style.removeProperty('transform');
    glide(card, from, { duration: 420, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' });
  });
}

window.addEventListener('pointermove', event => {
  if (event.pointerId !== drag?.id) return;
  const x = event.clientX - drag.startX;
  const y = event.clientY - drag.startY;
  if (drag.stack) {
    dragStack(event, x, y);
    return;
  }

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
  if (!drag.active) {
    drag = null;
    return;
  }
  swallowClick = true;
  if (drag.stack) {
    releaseStack(event);
    return;
  }

  const { project, startX, spread } = drag;
  drag = null;
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
document.querySelector('#project-close').addEventListener('click', event => {
  closeProject(event.detail === 0 ? 'keyboard' : 'pointer');
});

projects.forEach(project => {
  const card = cardOf(project);
  card.addEventListener('click', () => {
    // In the phone stack, tapping a card peeking out from under the top one brings it up.
    const slot = project.dataset.slot;
    if (compact.matches && slot !== 'center') {
      shiftStack(slot === 'right' ? 'next' : 'previous');
      return;
    }
    showProject(project, card);
  });
});

/* Switching between the row and the stack: each card glides from where it was drawn
   to its place in the new layout, instead of jumping when the window crosses the breakpoint. */

let wasCompact = compact.matches;
let lastDrawn = null;

// The deck's centre: card positions are kept relative to it, so a big jump in window size
// (maximising, rotating a phone) still morphs around the middle of the page.
function deckCentre() {
  const bounds = deck.getBoundingClientRect();
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

// Where each card is drawn: its centre, turn, width and layer.
function measureCards() {
  const centre = deckCentre();
  return projects.map(project => {
    const bounds = project.getBoundingClientRect();
    const style = getComputedStyle(project);
    const matrix = new DOMMatrix(style.transform);
    return {
      x: bounds.left + bounds.width / 2 - centre.x,
      y: bounds.top + bounds.height / 2 - centre.y,
      turn: Math.atan2(matrix.b, matrix.a),
      width: Math.hypot(matrix.a, matrix.b) * project.offsetWidth,
      layer: Number(style.zIndex) || 0
    };
  });
}

function switchLayout() {
  wasCompact = compact.matches;
  const drawn = lastDrawn;
  projects.forEach(project => {
    cardMotions.get(project)?.animation.cancel();
    cardMotions.delete(project);
    clearStackVars(project);
    project.classList.remove('is-dragging');
    project.style.removeProperty('transform');
  });
  if (!hasReordered) placeFeaturedCard();
  updateDots();
  if (!drawn || reducedMotion.matches) {
    rememberWhenSettled();
    return;
  }

  const centre = deckCentre();
  projects.forEach((project, index) => {
    const from = drawn[index];
    const style = getComputedStyle(project);
    const to = style.transform;
    const resting = new DOMMatrix(to);
    const bounds = project.getBoundingClientRect();
    // The transform is applied around the box centre, so this is where the box sits untransformed.
    const boxX = bounds.left + bounds.width / 2 - resting.e;
    const boxY = bounds.top + bounds.height / 2 - resting.f;
    const scale = from.width / project.offsetWidth;
    const [cos, sin] = [Math.cos(from.turn) * scale, Math.sin(from.turn) * scale];
    const start = `matrix(${cos}, ${sin}, ${-sin}, ${cos}, ${centre.x + from.x - boxX}, ${centre.y + from.y - boxY})`;
    // Cards keep their old layering at first and take the new one halfway through.
    const layer = Number(style.zIndex) || 0;
    const animation = project.animate([
      { transform: start, zIndex: from.layer },
      { zIndex: from.layer, offset: 0.5 },
      { zIndex: layer, offset: 0.5001 },
      { transform: to, zIndex: layer }
    ], {
      duration: 520,
      easing: 'cubic-bezier(0.22, 0.72, 0.28, 1)'
    });
    cardMotions.set(project, { animation, restingTransform: to });
    animation.onfinish = () => {
      if (cardMotions.get(project)?.animation === animation) cardMotions.delete(project);
    };
  });
  rememberWhenSettled();
}

// Resize events run before the page is laid out for the new size, but measuring here already
// sees the new layout, so keep the last measurement from before the switch and use that.
window.addEventListener('resize', () => {
  if (compact.matches !== wasCompact) {
    switchLayout();
    return;
  }
  lastDrawn = measureCards();
});
compact.addEventListener('change', () => {
  if (compact.matches !== wasCompact) switchLayout();
});

// Cards also move without a resize (swipes, the entrance, a previous switch). Once those
// settle, note where the cards ended up, so a switch in a single step (rotating a phone,
// maximising a window) still starts from the right place.
let remembering = 0;
function rememberWhenSettled() {
  const ticket = ++remembering;
  // Note where the cards start moving from now, in case the layout switches mid-move.
  if (compact.matches === wasCompact) lastDrawn = measureCards();
  Promise.all(deck.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
    .then(() => requestAnimationFrame(() => {
      if (ticket === remembering && compact.matches === wasCompact) lastDrawn = measureCards();
    }));
}
new MutationObserver(rememberWhenSettled).observe(deck, { subtree: true, attributeFilter: ['data-slot'] });
requestAnimationFrame(rememberWhenSettled);

/* Entrance */

const lastCard = projects.at(-1);
const stopEntrance = () => deck.classList.remove('is-entering');

deck.addEventListener('animationend', event => {
  if (event.target.closest('.project') === lastCard) stopEntrance();
});
deck.addEventListener('pointerdown', stopEntrance, { capture: true });
deck.addEventListener('keydown', stopEntrance, { capture: true });
if (!reducedMotion.matches) deck.classList.add('is-entering');
