import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { characters, maps } from "../db/schema.js";
import { config } from "../config.js";
import { SolanaClient } from "../lib/solana.js";

export const apiRoutes = new Hono();

apiRoutes.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "domin8-server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

apiRoutes.get("/api/config", async (c) => {
  try {
    if (!config.crankAuthorityPrivateKey) {
      return c.json({ error: "Crank authority not configured" }, 500);
    }

    const solanaClient = new SolanaClient(
      config.solanaRpcEndpoint,
      config.crankAuthorityPrivateKey
    );
    const gameConfig = await solanaClient.getGameConfig();
    const health = await solanaClient.healthCheck();

    return c.json({
      gameConfig,
      health,
      timing: {
        cronInterval: config.cronInterval,
        sendPrizeDelay: config.sendPrizeDelay,
        createGameDelay: config.createGameDelay,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Seed characters and maps from JSON files
 * POST /api/seed
 */
apiRoutes.post("/api/seed", async (c) => {
  try {
    // Read seed data from project root
    const fs = await import("fs");
    const path = await import("path");

    const seedDir = path.resolve(process.cwd(), "..", "seed");

    let charCount = 0;
    let mapCount = 0;

    // Seed characters
    try {
      const charsPath = path.join(seedDir, "characters.json");
      if (fs.existsSync(charsPath)) {
        const charsData = JSON.parse(fs.readFileSync(charsPath, "utf-8"));
        for (const char of charsData) {
          const [existing] = await db
            .select()
            .from(characters)
            .where(eq(characters.characterId, char.id))
            .limit(1);

          if (!existing) {
            await db.insert(characters).values({
              characterId: char.id,
              name: char.name,
              assetPath: char.assetPath,
              description: char.description,
              nftCollection: char.nftCollection,
              nftCollectionName: char.nftCollectionName,
              isActive: char.isActive ?? true,
              spriteOffsetY: char.spriteOffsetY,
              baseScale: char.baseScale,
              previewOffsetY: char.previewOffsetY,
              previewScale: char.previewScale,
            });
            charCount++;
          }
        }
      }
    } catch (e: any) {
      console.warn("[Seed] Characters seed error:", e.message);
    }

    // Seed maps
    try {
      const mapsPath = path.join(seedDir, "maps.json");
      if (fs.existsSync(mapsPath)) {
        const mapsData = JSON.parse(fs.readFileSync(mapsPath, "utf-8"));
        for (const map of mapsData) {
          const [existing] = await db
            .select()
            .from(maps)
            .where(eq(maps.mapId, map.id))
            .limit(1);

          if (!existing) {
            await db.insert(maps).values({
              mapId: map.id,
              name: map.name,
              description: map.description,
              spawnConfiguration: map.spawnConfiguration,
              isActive: map.isActive ?? true,
            });
            mapCount++;
          }
        }
      }
    } catch (e: any) {
      console.warn("[Seed] Maps seed error:", e.message);
    }

    return c.json({
      success: true,
      seeded: { characters: charCount, maps: mapCount },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
