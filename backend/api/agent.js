/* Everything FinDash offers AI agents and developers, in one server function
   (Vercel's free plan allows twelve):

     GET  /api/v1                       what the API offers
     POST /api/v1/analyze               monthly figures in, a P&L summary out
     GET  /api/v1/template              the template's columns
     GET  /api/v1/glossary              what each figure means
     POST /api/mcp                      MCP server: the same jobs as tools
     GET  /api/mcp/server-card          its MCP Server Card
     POST /api/mcp/docs                 MCP server for the pages and help
     GET  /api/mcp/docs/server-card     its MCP Server Card

   vercel.json's rewrites send those addresses here, with the part after
   /api/ as ?route=. None of it needs an account, calls an AI model or
   stores anything; lib/agent-api.js and lib/mcp-servers.js do the work. */

import { handleApi, sendError, allowAnyOrigin, jsonBody } from "../../lib/agent-api.js";
import { handleMcp, handleServerCard } from "../../lib/mcp-servers.js";

export default async function handler(request, response) {
  const route = String((request.query && request.query.route) || "").replace(/^\/+|\/+$/g, "");

  if (request.method === "OPTIONS") {
    allowAnyOrigin(response, "GET, HEAD, POST, OPTIONS");
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    if (route === "v1" || route.startsWith("v1/")) {
      allowAnyOrigin(response, "GET, HEAD, POST, OPTIONS");
      return handleApi(request, response, route.slice("v1".length).replace(/^\//, ""));
    }
    if (route === "mcp/server-card") {
      return handleServerCard(request, response, "product");
    }
    if (route === "mcp/docs/server-card") {
      return handleServerCard(request, response, "docs");
    }
    if (route === "mcp" || route === "mcp/docs") {
      let body;
      if (request.method === "POST") {
        body = jsonBody(request, response);
        if (!body) {
          return;
        }
      }
      return await handleMcp(request, response, route === "mcp" ? "product" : "docs", body);
    }
    allowAnyOrigin(response, "GET, HEAD, POST, OPTIONS");
    sendError(response, 404, "not_found", "There is nothing at /api/" + route + ".",
      "GET /api/v1 lists the API's endpoints.");
  } catch (error) {
    console.error("findash-error agent:", route, error && error.message);
    if (!response.headersSent) {
      sendError(response, 500, "internal_error", "Something went wrong on FinDash's side.",
        "Try again in a minute. If it keeps happening, email support.findash@findash.tech.");
    }
  }
}
