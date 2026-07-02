#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { sweepStaleDocuments } from "./documents.js";
import { registerTools } from "./tools.js";

sweepStaleDocuments();
const server = new McpServer({ name: "mcp-server-fhir", version: "0.0.1" });
registerTools(server);

await server.connect(new StdioServerTransport());
process.stderr.write("mcp-server-fhir: stdio ready\n");
