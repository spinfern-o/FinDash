/* On phones, an "Open dashboard" button stays at the bottom of the screen
   once both of the page's own (in the header and under the headline) have
   scrolled out of sight, so the way in is never more than a tap away.
   Wider screens never show it (landing.css). */

const stickyButton = document.getElementById("sticky-cta");
const watched = [document.querySelector("header .enter-link"), document.querySelector(".hero .cta-row")];
const inView = new Set();

function update() {
  stickyButton.hidden = inView.size > 0;
}

function start() {
  if (!stickyButton || !("IntersectionObserver" in window)) {
    return;
  }
  const observer = new IntersectionObserver(function (entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        inView.add(entry.target);
      } else {
        inView.delete(entry.target);
      }
    }
    update();
  });
  for (const element of watched) {
    if (element) {
      inView.add(element);   // until the first report, assume it is showing
      observer.observe(element);
    }
  }
}

start();
