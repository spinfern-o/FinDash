/* Puts the page in dark mode before anything is drawn, if the reader chose
   it, so it never flashes the wrong one. This is why it is an ordinary script
   in the <head> rather than a module: modules wait until the page has loaded.

   Pages open in light, the look of the FinDash design. The sun and moon
   button (theme-toggle.js) switches to dark and remembers the choice. */

(function applySavedTheme() {
  try {
    if (localStorage.getItem("findash-theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (error) {
    // Storage is unavailable (a private window, an old browser); the page
    // stays light.
  }
})();
