#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { clientFromEnv, TalenoxError } from './client.js';
import { createServer } from './server.js';

try {
  const client = clientFromEnv();
  await serveStdio(() => createServer(client));
} catch (error) {
  console.error(error instanceof TalenoxError ? error.message : 'Unable to start the Talenox MCP server.');
  process.exitCode = 1;
}

