/* The home page's scroll animation, after the Area kit in the FinDash Figma
   file. Three kinds of movement, all done with CSS transforms and opacity
   (landing.css), so nothing on the page shifts or reflows:

   - The header: as you scroll past it, the headline drifts up and fades a
     little, and the product rises out of its sage block and grows to full
     size. This script writes how far through the header you are, 0 to 1,
     as --p on .hero.
   - Reveals: an element marked data-reveal fades and rises into place the
     first time it comes into view. The children of data-reveal-group come
     in one after another (their order is written as --i).
   - Photos marked data-parallax move a little slower than the page. Their
     position on screen, -1 to 1, is written as --p on the photo.

   Nothing moves for visitors who ask their system for less motion, and
   without this script (or without JavaScript) every part of the page is
   simply there: the hidden starting states only apply once this script adds
   the "motion" class to <html>. */

const root = document.documentElement;
const hero = document.querySelector(".hero");
const photos = Array.from(document.querySelectorAll("[data-parallax]"));
let frameRequested = false;

/* Whether the visitor's system asks for less motion. */
function prefersLessMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* A number held between a lowest and a highest value. */
function clamp(value, lowest, highest) {
  return Math.min(highest, Math.max(lowest, value));
}

/* Whether any part of an element is on screen right now. */
function isOnScreen(element) {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/* Every element that fades in: each data-reveal, and each child of a
   data-reveal-group (numbered, so they come in one after another). */
function revealedElements() {
  const elements = Array.from(document.querySelectorAll("[data-reveal]"));
  for (const group of document.querySelectorAll("[data-reveal-group]")) {
    Array.from(group.children).forEach(function (child, index) {
      child.style.setProperty("--i", String(index));
      child.setAttribute("data-reveal-item", "");
      elements.push(child);
    });
  }
  return elements;
}

/* Shows an element for good: once it has come in, it stays. */
function reveal(element, observer) {
  element.classList.add("is-visible");
  observer.unobserve(element);
}

/* Fades elements in as they come into view. Whatever is already on screen
   is shown straight away, so the first screen never starts blank. */
function startReveals() {
  const elements = revealedElements();
  const observer = new IntersectionObserver(function (entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        reveal(entry.target, observer);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const element of elements) {
    if (isOnScreen(element)) {
      element.classList.add("is-visible");
    } else {
      observer.observe(element);
    }
  }
}

/* How far the page has scrolled through the header, 0 at the top and 1
   once the header's height has gone by. */
function heroProgress() {
  const box = hero.getBoundingClientRect();
  const distance = Math.max(1, box.height * 0.6);
  return clamp(-box.top / distance, 0, 1);
}

/* Where a photo sits on screen: -1 just below, 0 in the middle, 1 just
   above. */
function photoPosition(photo) {
  const box = photo.getBoundingClientRect();
  const middle = box.top + box.height / 2;
  const travel = (window.innerHeight + box.height) / 2;
  return clamp((window.innerHeight / 2 - middle) / travel, -1, 1);
}

/* Writes the header's progress and each photo's position for the CSS. */
function update() {
  frameRequested = false;
  if (hero) {
    hero.style.setProperty("--p", heroProgress().toFixed(4));
  }
  for (const photo of photos) {
    if (isOnScreen(photo)) {
      photo.style.setProperty("--p", photoPosition(photo).toFixed(4));
    }
  }
}

/* Asks for one update before the next frame is drawn, however many scroll
   events arrive in between. */
function requestUpdate() {
  if (!frameRequested) {
    frameRequested = true;
    window.requestAnimationFrame(update);
  }
}

function start() {
  if (prefersLessMotion() || !("IntersectionObserver" in window)) {
    return;
  }
  startReveals();
  update();
  root.classList.add("motion");
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
}

start();
