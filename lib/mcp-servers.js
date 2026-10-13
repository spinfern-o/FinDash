/* FinDash's two MCP servers, served over Streamable HTTP by api/agent.js:

     /api/mcp        the product: analyse monthly figures, the template's
                     columns, what each figure means
     /api/mcp/docs   the documentation: FinDash's pages, help and glossary

   Both are stateless (a new server for every request, no sessions), need no
   account, call no AI model and store nothing. Each has an MCP Server Card
   at <server URL>/server-card, listed in /.well-known/ai-catalog.json. */

import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { COST_FIELDS, MAXIMUM_MONTHS, glossaryEntries } from "../docs/js/dashboard/analysis.js";
import { analyzeFigures, templateResponse, allowAnyOrigin, SITE, API_VERSION } from "./agent-api.js";
import { PAGES, PAGE_INFO } from "./markdown-pages.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const SERVERS = {
  product: {
    path: "/api/mcp",
    name: "tech.findash/findash",
    title: "FinDash",
    description: "Turn a small business's monthly figures into a profit and loss summary.",
    identifier: "urn:air:findash.tech:mcp:findash"
  },
  docs: {
    path: "/api/mcp/docs",
    name: "tech.findash/docs",
    title: "FinDash docs",
    description: "Read and search FinDash's pages, help and glossary.",
    identifier: "urn:air:findash.tech:mcp:docs"
  }
};

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: text }] };
}

function problemResult(problems) {
  const lines = problems.map(function (problem) {
    return "- " + problem.field + ": " + problem.message;
  });
  return { isError: true, content: [{ type: "text", text: "Some of the figures can't be read:\n" + lines.join("\n") }] };
}

/* The shape of one month, as agents see it in the tool's input schema. */
function monthSchema() {
  const costs = {};
  for (const field of COST_FIELDS) {
    costs[field.key] = z.number().optional();
  }
  return z.object({
    month: z.union([z.string(), z.number().int()]).describe("The month's name (\"July\") or number (7)."),
    year: z.number().int().describe("The year, such as 2026."),
    revenue: z.number().describe("Everything that came in from sales that month."),
    budget: z.number().optional().describe("The most planned to be spent that month in total. Leave out if none."),
    costs: z.object(costs).optional().describe("The month's costs by line. A cost with no line of its own " +
      "goes in the closest one; leave out lines with nothing in them.")
  });
}

function productServer() {
  const server = new McpServer({ name: SERVERS.product.name, title: SERVERS.product.title, version: API_VERSION,
    websiteUrl: SITE + "/developers" });

  server.registerTool("analyze_monthly_figures", {
    title: "Analyse monthly figures",
    description: "Turn a small business's monthly revenue, costs and budget into a profit and loss summary: " +
      "costs in four groups, gross and net profit, net margin, budget used, a total across the months, and " +
      "the months that made a loss or went over budget. Same arithmetic as the FinDash dashboard. Up to " +
      MAXIMUM_MONTHS + " months.",
    inputSchema: {
      months: z.array(monthSchema()).min(1).max(MAXIMUM_MONTHS),
      currency: z.string().optional().describe("Three-letter currency code, such as USD. Only labels the result.")
    },
    annotations: READ_ONLY
  }, async function (input) {
    const result = analyzeFigures(input);
    if (result.problems) {
      return problemResult(result.problems);
    }
    return Object.assign(textResult(result.summary), { structuredContent: result.summary });
  });

  server.registerTool("get_spreadsheet_template", {
    title: "Get the spreadsheet template",
    description: "The columns of FinDash's spreadsheet template, so a spreadsheet can be prepared for the " +
      "owner to add on the dashboard: one row per month.",
    annotations: READ_ONLY
  }, async function () {
    return textResult(templateResponse());
  });

  server.registerTool("explain_term", {
    title: "Explain a FinDash term",
    description: "What a figure or term on the FinDash dashboard means, in plain words: revenue, the four cost " +
      "groups, gross profit, net profit, net margin, budget used and more. Leave out term to list them all.",
    inputSchema: { term: z.string().optional().describe("For example \"net margin\" or \"fixed overhead\".") },
    annotations: READ_ONLY
  }, async function (input) {
    const entries = glossaryEntries();
    if (!input.term) {
      return textResult(entries);
    }
    const wanted = input.term.trim().toLowerCase();
    const found = entries.find(function (entry) {
      return entry.key.toLowerCase() === wanted || entry.term.toLowerCase() === wanted;
    }) || entries.find(function (entry) {
      return entry.term.toLowerCase().includes(wanted);
    });
    if (!found) {
      return { isError: true, content: [{ type: "text", text: "No such term. Known terms: " +
        entries.map(function (entry) {
          return entry.term;
        }).join(", ") + "." }] };
    }
    return textResult(found.term + ": " + found.text);
  });

  return server;
}

/* "https://findash.tech/help", "/help" or "help" -> "/help". */
function pagePath(page) {
  let path = String(page || "").trim();
  if (path.startsWith(SITE)) {
    path = path.slice(SITE.length);
  }
  path = path.split("#")[0].replace(/\.md$/, "").replace(/\/+$/, "");
  if (path === "" || path === "/index") {
    return "/";
  }
  return path.startsWith("/") ? path : "/" + path;
}

/* Each page split at its headings, for searching. */
function sections() {
  const found = [];
  for (const [path, markdown] of Object.entries(PAGES)) {
    let heading = PAGE_INFO[path].title;
    let lines = [];
    for (const line of markdown.split("\n")) {
      const match = /^#{1,3} (.*)$/.exec(line);
      if (match) {
        found.push({ path: path, heading: heading, text: lines.join("\n").trim() });
        heading = match[1];
        lines = [];
      } else {
        lines.push(line);
      }
    }
    found.push({ path: path, heading: heading, text: lines.join("\n").trim() });
  }
  return found.filter(function (section) {
    return section.text;
  });
}

function docsServer() {
  const server = new McpServer({ name: SERVERS.docs.name, title: SERVERS.docs.title, version: API_VERSION,
    websiteUrl: SITE + "/developers" });

  server.registerTool("list_pages", {
    title: "List FinDash's pages",
    description: "Every page on findash.tech, with its title, address and what it covers.",
    annotations: READ_ONLY
  }, async function () {
    return textResult(Object.keys(PAGES).filter(function (path) {
      return PAGE_INFO[path].listed;
    }).map(function (path) {
      return { url: SITE + path, markdown: SITE + (path === "/" ? "/index" : path) + ".md",
        title: PAGE_INFO[path].title, description: PAGE_INFO[path].description };
    }));
  });

  server.registerTool("read_page", {
    title: "Read a FinDash page",
    description: "One page of findash.tech as Markdown: the home page, dashboard, help, restaurant guide, " +
      "developers, about, contact, privacy policy or terms.",
    inputSchema: { page: z.string().describe("The page's address, such as /help or https://findash.tech/privacy.") },
    annotations: READ_ONLY
  }, async function (input) {
    const path = pagePath(input.page);
    if (!Object.prototype.hasOwnProperty.call(PAGES, path)) {
      return { isError: true, content: [{ type: "text", text: "No page at " + path + ". Pages: " +
        Object.keys(PAGES).join(", ") + "." }] };
    }
    return textResult(PAGES[path]);
  });

  server.registerTool("search_docs", {
    title: "Search FinDash's docs",
    description: "Search findash.tech's pages, help and glossary for a question or words, such as \"is my " +
      "spreadsheet uploaded\" or \"prime cost\". Returns the best-matching sections.",
    inputSchema: { query: z.string().min(1).describe("Words or a question.") },
    annotations: READ_ONLY
  }, async function (input) {
    const words = input.query.toLowerCase().split(/[^a-z0-9&]+/).filter(function (word) {
      return word.length > 2;
    });
    const scored = sections().map(function (section) {
      const haystack = (section.heading + " " + section.text).toLowerCase();
      let score = 0;
      for (const word of words) {
        score += haystack.split(word).length - 1;
        if (section.heading.toLowerCase().includes(word)) {
          score += 3;
        }
      }
      return { score: score, section: section };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, 5);
    if (!scored.length) {
      return textResult("Nothing matched. Try other words, or list_pages to see every page.");
    }
    return textResult(scored.map(function (item) {
      return { page: SITE + item.section.path, heading: item.section.heading,
        text: item.section.text.slice(0, 1200) };
    }));
  });

  return server;
}

/* Answers one MCP request: a stateless server per request, as serverless
   functions want. Only POST carries MCP messages here; without sessions
   there is no stream to open with GET. */
export async function handleMcp(request, response, kind, body) {
  allowAnyOrigin(response, "POST, OPTIONS");
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST, OPTIONS");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: null,
      error: { code: -32000, message: "Method not allowed: send MCP messages with POST. The server card is at " +
        SITE + SERVERS[kind].path + "/server-card." } }));
    return;
  }
  const server = kind === "docs" ? docsServer() : productServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  response.on("close", function () {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}

/* The MCP Server Card: who the server is and how to connect, before
   connecting. Tools are deliberately not listed (the spec leaves them to
   tools/list). */
export function serverCard(kind) {
  const server = SERVERS[kind];
  return {
    "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: server.name,
    version: API_VERSION,
    title: server.title,
    description: server.description,
    websiteUrl: SITE + "/developers",
    repository: { url: "https://github.com/spinfern-o/FinDash", source: "github" },
    icons: [{ src: SITE + "/icon-192.png", mimeType: "image/png", sizes: ["192x192"] }],
    remotes: [{ type: "streamable-http", url: SITE + server.path,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS.slice() }]
  };
}

/* GET <server URL>/server-card, with the caching and CORS headers the
   Server Card spec asks for. */
export function handleServerCard(request, response, kind) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, If-None-Match");
  response.setHeader("Access-Control-Expose-Headers", "ETag");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: { code: "method_not_allowed", message: "Use GET." } }));
    return;
  }
  const body = JSON.stringify(serverCard(kind), null, 2);
  const etag = '"' + createHash("sha256").update(body).digest("hex").slice(0, 32) + '"';
  response.setHeader("ETag", etag);
  response.setHeader("Cache-Control", "public, max-age=3600");
  if (request.headers["if-none-match"] === etag) {
    response.statusCode = 304;
    response.end();
    return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/mcp-server-card+json");
  response.end(body);
}
