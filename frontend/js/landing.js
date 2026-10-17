/* The landing page's rotating word: "Built for non-tech / international /
   freelancers ..." with an example line under it that changes with it.
   Someone who has asked their computer for less motion sees the first
   example, still. */

const FRAMES = [
  {
    word: "non‑tech",
    example: "No formulas, no pivot tables, just your monthly totals in one simple template."
  },
  {
    word: "international",
    example: "Euros, pounds, rupees or dollars: your figures, in your currency."
  },
  {
    word: "freelancers",
    example: "Snap a photo of a receipt; it's read, sorted and added to the month."
  },
  {
    word: "small teams",
    example: "No login needed, no onboarding call, just open the file and see the numbers."
  },
  {
    word: "founders",
    example: "See which costs are growing faster than sales, before they eat your margin."
  },
  {
    word: "anyone",
    example: "If you can copy a total from QuickBooks or Xero, you can read this dashboard."
  }
];

const SECONDS_PER_WORD = 2.8;
const WORD_SWAP_MILLISECONDS = 320;     // how long the word takes to slide out
const EXAMPLE_FADE_MILLISECONDS = 160;  // how long the example takes to fade out

const wordElement = document.getElementById("rotator");
const exampleElement = document.getElementById("example-text");
let frameIndex = 0;

function prefersLessMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function showFrame(index) {
  wordElement.textContent = FRAMES[index].word;
  exampleElement.style.opacity = "0";
  setTimeout(function () {
    exampleElement.textContent = FRAMES[index].example;
    exampleElement.style.opacity = "1";
  }, EXAMPLE_FADE_MILLISECONDS);
}

function showNextFrame() {
  wordElement.classList.add("swap");
  setTimeout(function () {
    frameIndex = (frameIndex + 1) % FRAMES.length;
    showFrame(frameIndex);
    wordElement.classList.remove("swap");
  }, WORD_SWAP_MILLISECONDS);
}

function start() {
  if (!wordElement || !exampleElement) {
    return;
  }
  if (prefersLessMotion()) {
    exampleElement.textContent = FRAMES[0].example;
    return;
  }
  showFrame(0);
  setInterval(showNextFrame, SECONDS_PER_WORD * 1000);
}

start();
