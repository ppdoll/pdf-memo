import { createApp } from './bootstrap';

async function main(): Promise<void> {
  const server = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}/api/v1`);
  });
}

void main();
