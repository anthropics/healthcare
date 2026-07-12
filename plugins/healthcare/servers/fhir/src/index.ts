#!/usr/bin/env node
import { serve } from "../../shared/rpc.mjs";
import { sweepStaleDocuments } from "./documents.js";
import { TOOLS } from "./schemas.js";
import { HANDLERS } from "./tools.js";

sweepStaleDocuments();
serve({
  serverInfo: { name: "mcp-server-fhir", version: "0.0.1" },
  tools: TOOLS,
  handlers: HANDLERS,
});
