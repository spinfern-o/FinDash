/* Puts the page in light or dark mode before anything is drawn, so it never
   flashes the wrong one. This is why it is an ordinary script in the <head>
   rather than a module: modules wait until the page has loaded.

   The reader's own choice wins (saved by theme-toggle.js); otherwise the
   page follows the computer's setting. Dark is the default. */

(function applySavedTheme() {
  try {
    let theme = localStorage.getItem("findash-theme");
    if (!theme) {
      const prefersLight = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) {
        theme = "light";
      } else {
        theme = "dark";
      }
    }
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (error) {
    // Storage or matchMedia is unavailable (a private window, an old
    // browser); the default theme stands.
  }
})();
