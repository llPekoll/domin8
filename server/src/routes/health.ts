import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "domin8-server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
