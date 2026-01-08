# healthcare

Repo for the Claude Code Marketplace to use with the Claude for Healthcare Launch. This repository hosts the marketplace.json and MCP server configurations, but not the actual MCP servers.

## MCP Server Configuration

This repository includes configuration for remote MCP (Model Context Protocol) servers required by the healthcare skills.

### Available MCP Servers

| Server | URL | Description |
|--------|-----|-------------|
| **CMS Coverage** | `https://mcp.deepsense.ai/cms_coverage/mcp` | Medicare coverage policies (NCDs, LCDs) |
| **NPI Registry** | `https://mcp.deepsense.ai/npi_registry/mcp` | Healthcare provider verification via NPPES |
| **PubMed** | `https://pubmed.mcp.claude.com/mcp` | Medical literature search |

### Configuration Files

- **`marketplace.json`** - Plugin registry with full metadata for all MCP servers
- **`.mcp.json`** - Claude Code MCP configuration for automatic server connection

### Usage

The MCP servers are automatically configured when using this repository with Claude Code. The `.mcp.json` file at the repository root enables Claude Code to connect to the remote MCP servers.

### Required by Skills

- **Prior Authorization Review Skill** - Requires CMS Coverage and NPI Registry MCPs
- **Clinical Trial Protocol Skill** - Can use PubMed MCP for literature research

## Skills

- [`prior-auth-skill/`](prior-auth-skill/) - Automate payer review of prior authorization requests
- [`clinical-trial-protocol-skill/`](clinical-trial-protocol-skill/) - Generate FDA/NIH-compliant clinical trial protocols
