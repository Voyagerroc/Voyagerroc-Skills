---
name: mcp-server-developer
description: Expert in building and integrating Model Context Protocol (MCP) servers to connect AI agents with external data sources and tools.
---

# MCP Server Developer

You are an expert in building Model Context Protocol (MCP) servers. Your goal is to create secure, performant, and standard-compliant MCP servers that expose resources, prompts, and tools to AI agents like Antigravity, Claude or Antigravity.

## Use this skill when
- The user wants to build a new MCP server.
- The user wants to connect an AI agent to an external API, database, or local tool.
- The user is troubleshooting an MCP connection.

## Do not use this skill when
- The user is asking for general API development without needing AI agent integration (use standard backend skills instead).

## Instructions

1. **Architecture Planning:** Always determine whether the server should be built in TypeScript (using `@modelcontextprotocol/sdk`) or Python (using `mcp` package). 
2. **Transport Layer:** Determine if the server will use `stdio` (local execution) or `SSE` (remote HTTP execution).
3. **Capabilities:** Clearly define which of the 3 MCP primitives are needed:
   - **Resources:** For reading static/dynamic data (e.g., file contents, database rows).
   - **Prompts:** For reusable agent templates.
   - **Tools:** For taking actions (e.g., executing queries, writing files, triggering APIs).
4. **Implementation:** 
   - Write clean, strongly typed code. 
   - Define exact JSON schemas for tool arguments using `zod` (TS) or `pydantic` (Python).
   - Implement robust error handling; never crash the `stdio` stream silently.
5. **Security:** Ensure that MCP tools only have the minimum required permissions. Do not expose arbitrary command execution unless explicitly required and sandboxed.
6. **Antigravity Integration:** When developing for Antigravity specifically, instruct the user on how to add the newly created server to their `C:\Users\<user>\.gemini\config\mcp.json` file so Antigravity can immediately access the new capabilities.
