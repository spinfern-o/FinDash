/* A small stand-in for Stripe, speaking the parts of its API this site uses
   (customers, subscriptions, checkout sessions, billing portal sessions),
   so the tests never touch Stripe or need a key.

   It also serves the two pages people are sent to: a checkout page with
   Pay and Back links (Pay starts a subscription and goes back to the
   site's success address, as Stripe does), and a billing page.

   It runs inside the test's own process, so a test can look at and change
   its state directly (customers, subscriptions, requests, options). */

import http from "node:http";

/* Stripe's form-encoded body as a flat { "metadata[user_id]": "..." }. */
function formFields(text) {
  const fields = {};
  for (const [key, value] of new URLSearchParams(text)) {
    fields[key] = value;
  }
  return fields;
}

const DAY_SECONDS = 86400;

export async function startMockStripe() {
  let nextNumber = 1;
  function newId(prefix) {
    const id = prefix + "_test" + nextNumber;
    nextNumber += 1;
    return id;
  }

  const mock = {
    url: "",
    customers: new Map(),
    subscriptions: [],
    checkouts: new Map(),
    requests: [],
    // isDown: answer every API request with a server error, as in an outage.
    options: { isDown: false },

    /* Gives a customer a subscription to `price`, as paying would. */
    subscribe: function (customerId, price, status) {
      const subscription = {
        id: newId("sub"),
        object: "subscription",
        customer: customerId,
        status: status || "active",
        cancel_at_period_end: false,
        items: { object: "list", data: [{ id: newId("si"), object: "subscription_item", price: { id: price },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * DAY_SECONDS }] }
      };
      mock.subscriptions.push(subscription);
      return subscription;
    },

    requestsTo: function (method, path) {
      return mock.requests.filter(function (request) {
        return request.method === method && request.path === path;
      });
    }
  };

  function sendJson(response, status, body) {
    response.writeHead(status, { "content-type": "application/json", "request-id": "req_test" });
    response.end(JSON.stringify(body));
  }

  function notFound(response, what) {
    sendJson(response, 404, { error: { type: "invalid_request_error", code: "resource_missing",
      message: "No such " + what } });
  }

  function handleCustomers(request, response, path, fields) {
    if (request.method === "POST" && path === "/v1/customers") {
      const metadata = {};
      for (const [key, value] of Object.entries(fields)) {
        const match = /^metadata\[(.+)\]$/.exec(key);
        if (match) {
          metadata[match[1]] = value;
        }
      }
      const customer = { id: newId("cus"), object: "customer", email: fields.email || null, metadata: metadata };
      mock.customers.set(customer.id, customer);
      return sendJson(response, 200, customer);
    }
    const id = path.slice("/v1/customers/".length);
    const customer = mock.customers.get(id);
    if (!customer) {
      return notFound(response, "customer: '" + id + "'");
    }
    if (request.method === "GET") {
      return sendJson(response, 200, customer);
    }
    if (request.method === "DELETE") {
      // As Stripe does: deleting a customer cancels its subscriptions at once.
      mock.customers.set(id, { id: id, object: "customer", deleted: true });
      for (const subscription of mock.subscriptions) {
        if (subscription.customer === id) {
          subscription.status = "canceled";
        }
      }
      return sendJson(response, 200, { id: id, object: "customer", deleted: true });
    }
    return notFound(response, "route");
  }

  function handleSubscriptions(response, url) {
    const customer = url.searchParams.get("customer");
    const status = url.searchParams.get("status");
    const found = mock.subscriptions.filter(function (subscription) {
      const isCustomers = subscription.customer === customer;
      const isWanted = status === "all" || subscription.status === (status || "active");
      return isCustomers && isWanted;
    });
    return sendJson(response, 200, { object: "list", data: found, has_more: false, url: "/v1/subscriptions" });
  }

  function handleCheckoutCreate(response, fields) {
    const checkout = {
      id: newId("cs"),
      object: "checkout.session",
      customer: fields.customer,
      price: fields["line_items[0][price]"],
      fields: fields
    };
    checkout.url = mock.url + "/checkout/" + checkout.id;
    mock.checkouts.set(checkout.id, checkout);
    return sendJson(response, 200, { id: checkout.id, object: "checkout.session", url: checkout.url });
  }

  /* The pages people are sent to, standing in for Stripe's own. */
  function handlePage(response, path) {
    const checkoutMatch = /^\/checkout\/([^/]+)(?:\/(pay|back))?$/.exec(path);
    if (checkoutMatch) {
      const checkout = mock.checkouts.get(checkoutMatch[1]);
      if (!checkout) {
        response.writeHead(404);
        return response.end("no such checkout");
      }
      if (checkoutMatch[2] === "pay") {
        mock.subscribe(checkout.customer, checkout.price);
        response.writeHead(303, { location: checkout.fields.success_url });
        return response.end();
      }
      if (checkoutMatch[2] === "back") {
        response.writeHead(303, { location: checkout.fields.cancel_url });
        return response.end();
      }
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(`<!DOCTYPE html><title>Stripe checkout (test)</title>
        <h1>Pay for FinDash Plus</h1>
        <a id="pay" href="/checkout/${checkout.id}/pay">Pay</a> <a id="back" href="/checkout/${checkout.id}/back">Back</a>`);
    }
    if (path.startsWith("/portal/")) {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end("<!DOCTYPE html><title>Stripe billing (test)</title><h1>Your billing</h1>");
    }
    response.writeHead(404);
    return response.end("no route");
  }

  const server = http.createServer(function (request, response) {
    let text = "";
    request.on("data", function (chunk) {
      text += chunk;
    });
    request.on("end", function () {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;
      if (!path.startsWith("/v1/")) {
        return handlePage(response, path);
      }

      const fields = formFields(text);
      mock.requests.push({ method: request.method, path: path, query: Object.fromEntries(url.searchParams),
        fields: fields, headers: request.headers });
      if (mock.options.isDown) {
        return sendJson(response, 500, { error: { type: "api_error", message: "Stripe is down (test)" } });
      }
      if (!String(request.headers.authorization || "").startsWith("Bearer sk_test_")) {
        return sendJson(response, 401, { error: { type: "invalid_request_error", message: "Invalid API Key" } });
      }

      if (path === "/v1/customers" || path.startsWith("/v1/customers/")) {
        return handleCustomers(request, response, path, fields);
      }
      if (path === "/v1/subscriptions" && request.method === "GET") {
        return handleSubscriptions(response, url);
      }
      if (path === "/v1/checkout/sessions" && request.method === "POST") {
        return handleCheckoutCreate(response, fields);
      }
      if (path === "/v1/billing_portal/sessions" && request.method === "POST") {
        return sendJson(response, 200, { id: newId("bps"), object: "billing_portal.session",
          customer: fields.customer, url: mock.url + "/portal/" + fields.customer });
      }
      return notFound(response, "route " + request.method + " " + path);
    });
  });

  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  mock.url = "http://127.0.0.1:" + server.address().port;
  mock.stop = function () {
    return new Promise(function (resolve) {
      server.close(resolve);
      server.closeAllConnections();
    });
  };
  return mock;
}
