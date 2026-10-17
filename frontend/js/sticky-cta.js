/* On phones, the way in (Join the waitlist, or Open the dashboard once
   FinDash is open) stays at the bottom of the screen once the page's own
   buttons (in the header and under the product) have scrolled out of
   sight, so it is never more than a tap away. Both versions are on the
   page; site.css shows one. Wider screens never show it (landing.css). */

const stickyButtons = document.querySelectorAll(".sticky-cta");
const watched = [...document.querySelectorAll("header .enter-link"), document.querySelector(".intro .cta-row")];
const inView = new Set();

function update() {
  for (const button of stickyButtons) {
    button.hidden = inView.size > 0;
  }
}

function start() {
  if (!stickyButtons.length || !("IntersectionObserver" in window)) {
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
