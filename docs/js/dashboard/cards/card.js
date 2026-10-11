/* The frame every card on the dashboard shares: a title, an optional line
   under it, the period it covers in the corner, and its contents. */

export function cardHtml(className, title, subtitle, scope, body) {
  let subtitleHtml = "";
  if (subtitle) {
    subtitleHtml = `<p class="sub">${subtitle}</p>`;
  }

  let scopeHtml = "";
  if (scope) {
    scopeHtml = `<span class="scope">${scope}</span>`;
  }

  return `<section class="card ${className}">
    <div class="card-head">
      <div><h2>${title}</h2>${subtitleHtml}</div>
      ${scopeHtml}
    </div>
    ${body}
  </section>`;
}
