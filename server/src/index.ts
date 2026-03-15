import { createServer } from "http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { apiRoutes } from "./routes/api.js";
import { setupSocketHandlers } from "./socket/handlers.js";
import { setIO, bootstrapGameLoop } from "./game/gameLoop.js";
import { setEmitterIO } from "./socket/emitter.js";

// Hono app
const app = new Hono();

app.use(
  "*",
  cors({
    origin: config.corsOrigin,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type"],
  })
);

app.route("/", healthRoutes);
app.route("/", apiRoutes);

// Create HTTP server - Bun supports node:http natively
const httpServer = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const chunks: Buffer[] = [];

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const fetchReq = new Request(url.toString(), {
        method: req.method,
        headers,
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      });

      const response = await app.fetch(fetchReq);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const responseBody = await response.text();
      res.end(responseBody);
    } catch {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });
});

// Attach Socket.io to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// Wire up
setIO(io);
setEmitterIO(io);
setupSocketHandlers(io);

// Start listening
httpServer.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port} (${config.nodeEnv})`);
});

// Bootstrap game loop from DB state
bootstrapGameLoop();
