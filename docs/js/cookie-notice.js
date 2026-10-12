/* A short notice that FinDash only uses the cookies needed to keep someone
   logged in. It asks for no consent because nothing optional is set: there
   are no advertising or tracking cookies, and page visits are counted
   without cookies. Once dismissed it stays dismissed in this browser. */

const SEEN_KEY = "findash-cookie-notice";

function hasBeenSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "seen";
  } catch {
    return false;   // storage is blocked: show it, it can't be remembered
  }
}

function rememberSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "seen");
  } catch {
    // Storage is blocked; it shows again next visit.
  }
}

/* The fixed bar along the bottom of the screen. The landing page has one
   already, holding its sticky button, so the two stack instead of
   covering each other. */
function bottomDock() {
  let dock = document.getElementById("bottom-dock");
  if (!dock) {
    dock = document.createElement("div");
    dock.id = "bottom-dock";
    dock.className = "bottom-dock";
    document.body.appendChild(dock);
  }
  return dock;
}

function showNotice() {
  if (hasBeenSeen()) {
    return;
  }
  const notice = document.createElement("div");
  notice.className = "cookie-notice";
  notice.id = "cookie-notice";
  notice.setAttribute("role", "region");
  notice.setAttribute("aria-label", "Cookie notice");
  notice.innerHTML = "<p>FinDash only uses the cookies needed to keep you logged in. No advertising or " +
    'tracking cookies. <a href="/privacy#browser">Privacy policy</a></p>' +
    '<button type="button">OK</button>';
  notice.querySelector("button").addEventListener("click", function () {
    rememberSeen();
    notice.remove();
  });
  bottomDock().prepend(notice);
}

showNotice();
