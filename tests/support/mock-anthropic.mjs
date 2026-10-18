/* A stand-in for the Claude API (POST /v1/messages), so the tests never
   spend money or need a key. It tells the kinds of request apart by
   their prompts and answers each with a canned reply, which a test can
   change. Every request is kept in `requests`, so a test can check what
   would have been sent. */

import http from "node:http";
import { readFileSync } from "node:fs";

const FIXTURES = new URL("../fixtures/", import.meta.url);

export function readFixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
}

function kindOfRequest(body) {
  const system = typeof body.system === "string" ? body.system : "";
  if (system.includes("You read photos of documents")) {
    return "photo";
  }
  if (system.includes("conservative stock-counting assistant")) {
    return "shelf";
  }
  const firstMessage = body.messages && body.messages[0] ? body.messages[0].content : "";
  const text = typeof firstMessage === "string" ? firstMessage : "";
  if (text.includes("advising the owner of a small business")) {
    return "advice";
  }
  if (text.includes("mapping spreadsheet column headers")) {
    return "columns";
  }
  return "unknown";
}

/* True for the photo's second look: its text starts "A first reading". */
function isSecondLook(body) {
  const content = body.messages[0].content;
  return Array.isArray(content) && content.some(function (block) {
    return block.type === "text" && block.text.startsWith("A first reading");
  });
}

export async function startMockAnthropic() {
  const mock = {
    url: "",
    requests: [],
    replies: {
      // What a photo reads as: first look, then the second look.
      photoFirstLook: readFixture("invoice-misread.json"),
      photoSecondLook: readFixture("invoice-reading.json"),
      advice: {
        opportunities: ["July kept $7,580 of $72,000 in revenue."],
        risks: ["September lost $3,640."],
        actions: ["Review September's costs line by line."]
      },
      columns: { mapping: {}, other: { "bank charges": "operating" } },
      // What a shelf photo counts as: one answer per product asked about,
      // by its place in the list the page sent.
      shelf: {
        usable: true, quality_flags: [], unmatched: [],
        explanation: "The front row of the shelf is clearly visible.",
        observations: [{
          candidate: 1, present: true, visible_count: 7, count_type: "visible-exact",
          coverage: "complete", reliability: "good", obstructed: false,
          explanation: "Seven cartons are clearly visible in the front row."
        }]
      }
    },
    requestsOfKind: function (kind) {
      return mock.requests.filter(function (request) {
        return request.kind === kind;
      });
    }
  };

  const server = http.createServer(function (request, response) {
    let text = "";
    request.on("data", function (chunk) {
      text += chunk;
    });
    request.on("end", function () {
      const body = JSON.parse(text || "{}");
      const kind = kindOfRequest(body);
      mock.requests.push({ kind: kind, path: request.url, headers: request.headers, body: body });

      let reply = {};
      if (kind === "photo") {
        reply = isSecondLook(body) ? mock.replies.photoSecondLook : mock.replies.photoFirstLook;
      } else if (kind === "advice") {
        reply = mock.replies.advice;
      } else if (kind === "columns") {
        reply = mock.replies.columns;
      } else if (kind === "shelf") {
        reply = mock.replies.shelf;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [
          { type: "thinking", thinking: "", signature: "test" },
          { type: "text", text: JSON.stringify(reply) }
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 }
      }));
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
