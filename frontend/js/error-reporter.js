/* Sends errors that happen on this page to /api/report-error, so they show
   up in the site's logs (search for "findash-error"). Loaded before the
   page's own scripts so it catches their errors too.

   Only the error message and where it happened are sent, never the
   figures on screen. At most a few reports per visit, and each message
   once, so a fault that repeats cannot flood the logs. */

const MAXIMUM_REPORTS_PER_VISIT = 5;
const reported = new Set();

function sendReport(message, where) {
  if (!message || reported.has(message) || reported.size >= MAXIMUM_REPORTS_PER_VISIT) {
    return;
  }
  reported.add(message);
  try {
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, where: where, page: location.pathname }),
      credentials: "same-origin",
      keepalive: true
    }).catch(function () {
      // Offline or blocked: nothing more can be done.
    });
  } catch {
    // Never let reporting an error cause another one.
  }
}

/* Errors from browser extensions and other sites' scripts are not ours to fix. */
function isFromThisSite(fileName) {
  return !fileName || fileName.startsWith(location.origin);
}

function whereFromUrl(fileName, line) {
  if (!fileName) {
    return "unknown";
  }
  return fileName.replace(location.origin, "") + ":" + line;
}

addEventListener("error", function (event) {
  if (!isFromThisSite(event.filename)) {
    return;
  }
  sendReport(String(event.message || "error"), whereFromUrl(event.filename, event.lineno));
});

addEventListener("unhandledrejection", function (event) {
  const reason = event.reason;
  let message = "unhandled rejection";
  if (reason && reason.message) {
    message = String(reason.message);
  } else if (reason) {
    message = String(reason);
  }
  let where = "unknown";
  if (reason && typeof reason.stack === "string") {
    // The first line of the stack that points at this site's own code.
    const ownLine = reason.stack.split("\n").find(function (line) {
      return line.includes(location.origin);
    });
    if (ownLine) {
      where = ownLine.trim().replace(location.origin, "");
    }
  }
  sendReport(message, where);
});
