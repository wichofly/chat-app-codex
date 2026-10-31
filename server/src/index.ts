import 'dotenv/config';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createAuth } from './lib/auth.js';
import { createPrisma } from './lib/prisma.js';

const config = readConfig();
const database = createPrisma(config.DATABASE_URL);
await database.$connect();
const auth = createAuth(database, config);
const app = createApp({ config, auth, database });
const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Thread API listening on port ${config.PORT}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void database.$disconnect().finally(() => process.exit(0));
    });
  });
}
