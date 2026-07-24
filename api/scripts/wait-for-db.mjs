/**
 * Wait until PostgreSQL accepts connections (used by `npm run setup`).
 */
import net from 'node:net';

const host = process.env.PGHOST ?? 'localhost';
const port = Number(process.env.PGPORT ?? 5432);
const maxAttempts = 60;
const delayMs = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await canConnect()) {
      console.log(`PostgreSQL is ready at ${host}:${port}`);
      return;
    }
    console.log(
      `Waiting for PostgreSQL at ${host}:${port} (${attempt}/${maxAttempts})...`,
    );
    await sleep(delayMs);
  }
  console.error(`PostgreSQL did not become ready at ${host}:${port}`);
  process.exit(1);
}

void main();
