#!/usr/bin/env node
import { serve } from "../../shared/rpc.mjs";
import { sweepStaleDocuments } from "./documents.mjs";
import { TOOLS } from "./schemas.mjs";
import { HANDLERS } from "./tools.mjs";

sweepStaleDocuments();
serve({
  serverInfo: { name: "mcp-server-fhir", version: "0.0.1" },
  tools: TOOLS,
  handlers: HANDLERS,
});
