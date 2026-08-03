import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createServer } from "node:http";

import { initializeRealtime } from "./shared/realtime/realtime.js";

const app = createApp();
const server = createServer(app);

initializeRealtime(server);

server.listen(env.PORT, () => {
  process.stdout.write(`restaurant-pos api listening on port ${env.PORT}\n`);
});
