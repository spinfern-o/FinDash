/* The sun and moon button in the corner of every page: switches between
   light and dark mode and remembers the choice for next time. */

const THEME_KEY = "findash-theme";

function rememberTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage is blocked; the theme still applies for this visit.
  }
}

function toggleTheme() {
  const page = document.documentElement;
  const isLight = page.getAttribute("data-theme") === "light";
  if (isLight) {
    page.removeAttribute("data-theme");
    rememberTheme("dark");
  } else {
    page.setAttribute("data-theme", "light");
    rememberTheme("light");
  }
}

const toggleButton = document.getElementById("theme-toggle");
if (toggleButton) {
  toggleButton.addEventListener("click", toggleTheme);
}
