/* The waitlist page: checks the email and sends it to /api/waitlist. Once
   someone has joined, the form is replaced by a thank-you. Nothing is kept
   in the browser. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = document.getElementById("waitlist-form");
const emailBox = document.getElementById("email");
const submitButton = document.getElementById("submit");

function element(id) {
  return document.getElementById(id);
}

function showMessage(text, kind) {
  const box = element("message");
  box.hidden = !text;
  box.className = "message";
  if (kind) {
    box.className += " " + kind;
  }
  box.textContent = text;
}

/* Says what's wrong with the email, and puts the cursor there. */
function showProblem(message) {
  showMessage(message, "bad");
  emailBox.setAttribute("aria-invalid", "true");
  emailBox.focus();
}

function showJoined(email) {
  form.hidden = true;
  showMessage("", "");
  element("joined-email").textContent = email;
  element("joined").hidden = false;
  element("joined").scrollIntoView({ block: "nearest" });
}

async function sendEmail(event) {
  event.preventDefault();
  emailBox.removeAttribute("aria-invalid");
  const email = emailBox.value.trim();
  if (!EMAIL_PATTERN.test(email)) {
    showProblem("Enter a valid email address.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Joining…";
  let answer = {};
  let ok = false;
  try {
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, website: element("website").value })
    });
    answer = await response.json();
    ok = response.ok;
  } catch {
    answer = { error: "Couldn't reach FinDash. Check your connection and try again." };
  }
  submitButton.disabled = false;
  submitButton.textContent = "Join the waitlist";

  if (ok) {
    showJoined(email);
    return;
  }
  showProblem(answer.error || "That didn't work. Try again in a moment.");
}

form.addEventListener("submit", sendEmail);
