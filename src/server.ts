import { McpServer } from '@modelcontextprotocol/server';
import { TalenoxClient, TalenoxError } from './client.js';
import { tools } from './tools.js';
import { mutationTools } from './mutations.js';

export function createServer(client: TalenoxClient): McpServer {
  const server = new McpServer({ name: 'talenox-mcp', version: '0.2.0' });
  for (const tool of [...tools, ...mutationTools]) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations ?? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (args, context) => {
      try {
        const data = await client.request(tool.request(args), context.mcpReq.signal);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: error instanceof TalenoxError ? error.message : 'The Talenox tool failed.' }],
        };
      }
    });
  }
  return server;
}




