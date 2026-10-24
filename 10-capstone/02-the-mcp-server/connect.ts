/** Start the FHIR MCP server as a child process and connect to it with the AI SDK's MCP client. */
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

export const serverPath = fileURLToPath(new URL('./fhir-mcp-server.ts', import.meta.url));

/** The care team travels to the server as a claim (an env var here; an OAuth token over HTTP). */
export function connectFhirServer(careTeam: string[]) {
  return createMCPClient({
    transport: new StdioClientTransport({
      command: process.execPath, // plain Node runs the TypeScript server directly (type stripping)
      args: [serverPath],
      env: { ...(process.env as Record<string, string>), CALLER_CARE_TEAM: careTeam.join(',') },
      stderr: 'ignore',
    }),
  });
}
