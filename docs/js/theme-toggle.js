/* The sun and moon button in the nav bar of every page: switches between
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
  const isDark = page.getAttribute("data-theme") === "dark";
  if (isDark) {
    page.removeAttribute("data-theme");
    rememberTheme("light");
  } else {
    page.setAttribute("data-theme", "dark");
    rememberTheme("dark");
  }
}

const toggleButton = document.getElementById("theme-toggle");
if (toggleButton) {
  toggleButton.addEventListener("click", toggleTheme);
}
