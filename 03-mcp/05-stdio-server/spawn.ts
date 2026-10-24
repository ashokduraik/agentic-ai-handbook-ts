/** How a host launches a local stdio MCP server: as a child process. Used by post 05 and post 06. */
import { fileURLToPath } from 'node:url';

export const serverProcess = {
  command: process.execPath, // the current `node`
  args: ['--import', 'tsx', fileURLToPath(new URL('./server.ts', import.meta.url))],
  cwd: fileURLToPath(new URL('..', import.meta.url)), // the lesson folder, so `tsx` resolves
  stderr: 'inherit' as const, // show the server's logs (written to stderr) in our terminal
};
