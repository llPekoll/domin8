# Blockchain Bet Event Listening Implementation Guide

## Overview
This guide explains how to listen to blockchain events and store individual bet data in Convex for frontend animations. Your game emits `BetPlaced` events on-chain, and this system will capture and store them for real-time UI updates.

---

## 🎯 Goals

1. **Capture every bet** placed on-chain (via `BetPlaced` events)
2. **Store bet data** in Convex `bets` table for frontend animations
3. **Link bets to rounds** for game progression tracking
4. **Enable real-time updates** for UI (bet ticker, pot updates, player avatars)

---

## 📊 Current Architecture

### Blockchain (Solana Program)
```rust
// Event emitted when a bet is placed (from events.rs)
#[event]
pub struct BetPlaced {
    pub round_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub bet_count: u8,
    pub total_pot: u64,
    pub end_timestamp: i64,
    pub is_first_bet: bool,
    pub timestamp: i64,
    pub bet_index: u32,
}

// BetEntry PDA stores individual bet details
pub struct BetEntry {
    pub game_round_id: u64,
    pub bet_index: u32,
    pub wallet: Pubkey,
    pub bet_amount: u64,
    pub timestamp: i64,
    pub payout_collected: bool,
}
```

### Convex (Current Implementation)
```typescript
// Schema - gameRoundStates stores snapshots (3 per round)
gameRoundStates: {
  roundId: number,
  status: "waiting" | "awaitingWinnerRandomness" | "finished",
  betCount: number,
  betAmounts: number[], // Array of all bets
  totalPot: number,
  winner: string | null,
  // ... more fields
}

// NEW: bets table (already added to schema)
bets: {
  roundId: Id<"games">,
  walletAddress: string,
  amount: number,
  status: "pending" | "won" | "lost" | "refunded",
  placedAt: number,
  betType: "self" | "refund",
  txSignature?: string,
  onChainConfirmed?: boolean,
  timestamp?: number,
  // ... more fields
}
```

---

## 🔧 Implementation Strategy

### Option 1: Listen to Program Events (Recommended)
**Best for**: Real-time updates, event-driven architecture

```typescript
// NEW FILE: convex/betEventListener.ts
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import IDL from "./lib/domin8_prgm.json";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("YOUR_PROGRAM_ID_HERE");

export const listenToBetPlacedEvents = internalAction({
  handler: async (ctx) => {
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const coder = new BorshCoder(IDL as any);
    const eventParser = new EventParser(PROGRAM_ID, coder);

    try {
      // Get latest processed slot from database
      const lastSlot = await ctx.runMutation(
        internal.betEventListenerMutations.getLastProcessedSlot
      );

      // Fetch recent signatures (last 1000 transactions)
      const signatures = await connection.getSignaturesForAddress(
        PROGRAM_ID,
        { limit: 1000, until: lastSlot || undefined },
        "confirmed"
      );

      console.log(`Processing ${signatures.length} transactions`);

      for (const signatureInfo of signatures.reverse()) {
        const signature = signatureInfo.signature;

        // Check if already processed
        const alreadyProcessed = await ctx.runMutation(
          internal.betEventListenerMutations.isSignatureProcessed,
          { signature }
        );

        if (alreadyProcessed) continue;

        // Fetch transaction
        const tx = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta || tx.meta.err) continue;

        // Parse events from logs
        const events = eventParser.parseLogs(tx.meta.logMessages || []);

        for (const event of events) {
          if (event.name === "BetPlaced") {
            await ctx.runMutation(
              internal.betEventListenerMutations.saveBetPlacedEvent,
              {
                signature,
                slot: signatureInfo.slot,
                blockTime: signatureInfo.blockTime || Math.floor(Date.now() / 1000),
                eventData: event.data,
              }
            );

            console.log(`✓ Captured BetPlaced event: Round ${event.data.roundId}, Player ${event.data.player}`);
          }
        }

        // Mark signature as processed
        await ctx.runMutation(
          internal.betEventListenerMutations.markSignatureProcessed,
          {
            signature,
            slot: signatureInfo.slot,
          }
        );
      }
    } catch (error) {
      console.error("Error listening to bet events:", error);
    }
  },
});
```

### Option 2: Poll BetEntry PDAs (Fallback)
**Best for**: Simple implementation, guaranteed accuracy

```typescript
// ADD TO: convex/lib/solana.ts
export class SolanaClient {
  // ... existing code ...

  // NEW: Fetch all bets for a specific round
  async getBetsForRound(roundId: number): Promise<BetEntry[]> {
    const bets: BetEntry[] = [];
    
    // Get bet count from game round
    const { gameRound } = this.getPDAs(roundId);
    if (!gameRound) return bets;

    try {
      const gameRoundAccount = await this.program.account.gameRound.fetch(gameRound);
      const betCount = gameRoundAccount.betCount;

      // Fetch each bet entry PDA
      for (let i = 0; i < betCount; i++) {
        const { betEntry } = this.getPDAs(roundId, i);
        if (!betEntry) continue;

        try {
          const betEntryAccount = await this.program.account.betEntry.fetch(betEntry);
          bets.push({
            gameRoundId: betEntryAccount.gameRoundId.toNumber(),
            betIndex: betEntryAccount.betIndex,
            wallet: betEntryAccount.wallet.toBase58(),
            betAmount: betEntryAccount.betAmount.toNumber(),
            timestamp: betEntryAccount.timestamp.toNumber(),
            payoutCollected: betEntryAccount.payoutCollected,
          });
        } catch (error) {
          console.error(`Failed to fetch bet entry ${i}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error fetching bets for round ${roundId}:`, error);
    }

    return bets;
  }
}

interface BetEntry {
  gameRoundId: number;
  betIndex: number;
  wallet: string;
  betAmount: number;
  timestamp: number;
  payoutCollected: boolean;
}
```

---

## 📝 Step-by-Step Implementation

### Step 1: Create Bet Event Listener Mutations

```typescript
// NEW FILE: convex/betEventListenerMutations.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Track last processed slot (prevents duplicate processing)
export const getLastProcessedSlot = internalMutation({
  handler: async (ctx) => {
    const lastEvent = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_block_time")
      .order("desc")
      .first();
    
    return lastEvent?.slot || null;
  },
});

// Check if signature already processed
export const isSignatureProcessed = internalMutation({
  args: { signature: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .first();
    
    return existing !== null;
  },
});

// Mark signature as processed
export const markSignatureProcessed = internalMutation({
  args: {
    signature: v.string(),
    slot: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("blockchainEvents", {
      eventName: "_processed",
      signature: args.signature,
      slot: args.slot,
      blockTime: Math.floor(Date.now() / 1000),
      eventData: {},
      processed: true,
    });
  },
});

// Save BetPlaced event and create bet record
export const saveBetPlacedEvent = internalMutation({
  args: {
    signature: v.string(),
    slot: v.number(),
    blockTime: v.number(),
    eventData: v.object({
      roundId: v.number(),
      player: v.string(),
      amount: v.number(),
      betCount: v.number(),
      totalPot: v.number(),
      endTimestamp: v.number(),
      isFirstBet: v.boolean(),
      timestamp: v.number(),
      betIndex: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const { eventData, signature, slot, blockTime } = args;

    // 1. Store raw event in blockchainEvents table
    await ctx.db.insert("blockchainEvents", {
      eventName: "BetPlaced",
      signature,
      slot,
      blockTime,
      eventData,
      roundId: eventData.roundId,
      processed: true,
    });

    // 2. Check if bet already exists (prevent duplicates)
    const existingBet = await ctx.db
      .query("bets")
      .withIndex("by_tx_signature", (q) => q.eq("txSignature", signature))
      .first();

    if (existingBet) {
      console.log(`Bet already exists for signature ${signature}`);
      return;
    }

    // 3. Create bet record in bets table
    // Note: You'll need to map roundId to your games table ID
    // For now, we'll store the blockchain roundId directly
    await ctx.db.insert("bets", {
      // Core identifiers
      roundId: eventData.roundId as any, // TODO: Map to games table ID
      walletAddress: eventData.player,
      
      // Bet classification
      betType: "self", // All bets are "self" bets for now
      
      // Financial data
      amount: eventData.amount / 1e9, // Convert lamports to SOL
      
      // Status tracking
      status: "pending",
      placedAt: eventData.timestamp,
      
      // Blockchain tracking
      txSignature: signature,
      onChainConfirmed: true,
      timestamp: eventData.timestamp,
    });

    console.log(`✓ Saved bet: Round ${eventData.roundId}, Player ${eventData.player}, Amount ${eventData.amount / 1e9} SOL`);
  },
});
```

### Step 2: Update Event Listener to Include Bets

```typescript
// UPDATE: convex/fetchRoundPDAs.ts
async function captureGameRoundState(ctx: any, solanaClient: SolanaClient) {
  try {
    const gameRound = await solanaClient.getGameRound();
    if (!gameRound) {
      console.log("No active game round found on blockchain");
      return;
    }

    const { roundId, status } = gameRound;
    
    // ... existing state capture logic ...

    // ⭐ NEW: Capture individual bets when in WAITING state
    if (status === "waiting") {
      await captureRoundBets(ctx, solanaClient, roundId);
    }

    await scheduleGameActions(ctx, gameRound);
  } catch (error) {
    console.error("Error capturing game round state:", error);
    throw error;
  }
}

// NEW: Capture all bets for a round
async function captureRoundBets(ctx: any, solanaClient: SolanaClient, roundId: number) {
  try {
    const bets = await solanaClient.getBetsForRound(roundId);
    
    for (const bet of bets) {
      // Check if bet already stored
      const existing = await ctx.runMutation(
        internal.betEventListenerMutations.isBetStored,
        {
          roundId: bet.gameRoundId,
          betIndex: bet.betIndex,
        }
      );

      if (!existing) {
        await ctx.runMutation(
          internal.betEventListenerMutations.storeBetFromPDA,
          {
            bet: {
              gameRoundId: bet.gameRoundId,
              betIndex: bet.betIndex,
              wallet: bet.wallet,
              betAmount: bet.betAmount,
              timestamp: bet.timestamp,
              payoutCollected: bet.payoutCollected,
            },
          }
        );
        console.log(`Stored bet ${bet.betIndex} for round ${roundId}`);
      }
    }
  } catch (error) {
    console.error(`Error capturing bets for round ${roundId}:`, error);
  }
}
```

### Step 3: Add Bet Storage Mutations

```typescript
// ADD TO: convex/betEventListenerMutations.ts

// Check if bet already stored
export const isBetStored = internalMutation({
  args: {
    roundId: v.number(),
    betIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bets")
      .filter((q) =>
        q.and(
          q.eq(q.field("roundId"), args.roundId as any),
          q.eq(q.field("betIndex"), args.betIndex)
        )
      )
      .first();
    
    return existing !== null;
  },
});

// Store bet from BetEntry PDA
export const storeBetFromPDA = internalMutation({
  args: {
    bet: v.object({
      gameRoundId: v.number(),
      betIndex: v.number(),
      wallet: v.string(),
      betAmount: v.number(),
      timestamp: v.number(),
      payoutCollected: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const { bet } = args;

    await ctx.db.insert("bets", {
      roundId: bet.gameRoundId as any, // TODO: Map to games table ID
      walletAddress: bet.wallet,
      betType: "self",
      amount: bet.betAmount / 1e9, // Convert lamports to SOL
      status: "pending",
      placedAt: bet.timestamp,
      onChainConfirmed: true,
      timestamp: bet.timestamp,
    });
  },
});
```

### Step 4: Schedule Bet Listener Cron

```typescript
// UPDATE: convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Existing event listener (captures game state)
crons.interval(
  "Ftech round PDAs",
  { seconds: 2 },
  internal.eventListener.fetchRoundPDAs
);

// NEW: Bet event listener (captures individual bets)
crons.interval(
  "Listen to bet placed events",
  { seconds: 5 }, // Run every 5 seconds
  internal.betEventListener.listenToBetPlacedEvents
);

export default crons;
```

---

## 🎨 Frontend Integration

### Consuming Bet Data for Animations

```typescript
// frontend/src/hooks/useGameBets.ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useGameBets(roundId: number) {
  const bets = useQuery(api.queries.getBetsForRound, { roundId });
  
  return {
    bets: bets || [],
    totalBets: bets?.length || 0,
    totalPot: bets?.reduce((sum, bet) => sum + bet.amount, 0) || 0,
  };
}

// frontend/src/hooks/useRealtimeBets.ts
export function useRealtimeBets(roundId: number) {
  const bets = useQuery(api.queries.getBetsForRound, { roundId });
  const [prevBetCount, setPrevBetCount] = useState(0);

  useEffect(() => {
    if (bets && bets.length > prevBetCount) {
      // New bet placed! Trigger animation
      const newBet = bets[bets.length - 1];
      console.log("🎰 New bet placed:", newBet);
      
      // TODO: Trigger Phaser animation
      // - Show avatar flying in
      // - Update pot counter with animation
      // - Play sound effect
      
      setPrevBetCount(bets.length);
    }
  }, [bets, prevBetCount]);

  return { bets };
}
```

### Query Functions

```typescript
// NEW FILE: convex/queries.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all bets for a specific round
export const getBetsForRound = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), args.roundId as any))
      .collect();
  },
});

// Get latest bets across all rounds (for global bet ticker)
export const getLatestBets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bets")
      .order("desc")
      .take(args.limit || 10);
  },
});

// Get bet statistics for a round
export const getRoundBetStats = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    const bets = await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), args.roundId as any))
      .collect();

    const totalPot = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const uniquePlayers = new Set(bets.map((bet) => bet.walletAddress)).size;

    return {
      totalBets: bets.length,
      totalPot,
      uniquePlayers,
      averageBet: bets.length > 0 ? totalPot / bets.length : 0,
    };
  },
});
```

---

## 🧪 Testing

### Manual Testing Steps

1. **Deploy updated Convex schema**
   ```bash
   npx convex dev
   ```

2. **Start local validator with game program**
   ```bash
   solana-test-validator --reset
   anchor deploy
   ```

3. **Initialize game and place bets**
   ```bash
   # Create game (first bet)
   anchor run create-game -- --amount 0.1
   
   # Place additional bets
   anchor run place-bet -- --amount 0.2
   anchor run place-bet -- --amount 0.15
   ```

4. **Verify bet capture in Convex dashboard**
   - Open Convex dashboard: `https://dashboard.convex.dev`
   - Check `bets` table - should see 3 bets
   - Check `blockchainEvents` table - should see 3 `BetPlaced` events

5. **Test frontend animations**
   - Open frontend
   - Watch for new bets appearing in real-time
   - Verify pot counter updates
   - Check avatar spawning

### Automated Testing

```typescript
// tests/bet-event-listener.test.ts
import { ConvexTestingHelper } from "convex-testing";
import { expect, test } from "vitest";
import { betEventListenerMutations } from "../convex/betEventListenerMutations";

test("should store bet from BetPlaced event", async () => {
  const t = new ConvexTestingHelper();
  
  const betData = {
    roundId: 1,
    player: "5xK...abc",
    amount: 100_000_000, // 0.1 SOL in lamports
    betCount: 1,
    totalPot: 100_000_000,
    endTimestamp: 1234567890,
    isFirstBet: true,
    timestamp: 1234567890,
    betIndex: 0,
  };

  await t.mutation(betEventListenerMutations.saveBetPlacedEvent, {
    signature: "test_sig_123",
    slot: 1000,
    blockTime: 1234567890,
    eventData: betData,
  });

  const bets = await t.query("getBetsForRound", { roundId: 1 });
  expect(bets).toHaveLength(1);
  expect(bets[0].walletAddress).toBe("5xK...abc");
  expect(bets[0].amount).toBe(0.1); // Converted to SOL
});
```

---

## 🐛 Troubleshooting

### Issue: Bets not appearing in database
**Causes:**
- Event listener cron not running
- RPC endpoint issues
- Event parsing errors

**Solutions:**
1. Check cron status in Convex dashboard
2. Verify RPC endpoint is reachable
3. Check Convex logs for errors
4. Manually trigger listener: `npx convex run internal.betEventListener.listenToBetPlacedEvents`

### Issue: Duplicate bets stored
**Cause:** Signature-based deduplication not working

**Solution:**
```typescript
// Add unique constraint to schema
bets: defineTable({
  // ... fields ...
}).index("by_tx_signature", ["txSignature"])
```

### Issue: Frontend not receiving updates
**Cause:** Query not subscribed to real-time updates

**Solution:**
```typescript
// Use useQuery (not usePaginatedQuery or useAction)
const bets = useQuery(api.queries.getBetsForRound, { roundId });
```

---

## 🚀 Performance Optimization

### 1. Batch Processing
Instead of processing one transaction at a time, batch them:

```typescript
// Process in batches of 10
const BATCH_SIZE = 10;
for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
  const batch = signatures.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(sig => processSignature(sig)));
}
```

### 2. Rate Limiting
Avoid overwhelming RPC endpoint:

```typescript
// Add delay between RPC calls
await new Promise(resolve => setTimeout(resolve, 100));
```

### 3. Index Optimization
Ensure fast queries:

```typescript
// Schema indexes for common queries
bets: defineTable({
  // ... fields ...
})
  .index("by_round", ["roundId"])
  .index("by_wallet", ["walletAddress"])
  .index("by_round_wallet", ["roundId", "walletAddress"])
  .index("by_status", ["status"])
```

---

## 📋 Next Steps

1. ✅ **Implement bet event listener** (Option 1 or 2)
2. ✅ **Add bet storage mutations**
3. ✅ **Schedule cron job**
4. ✅ **Create frontend queries**
5. ⏳ **Build animation system** (separate guide)
6. ⏳ **Add bet statistics dashboard**
7. ⏳ **Implement bet history viewer**

---

## 🔗 Related Documentation

- [EVENT_LISTENER_ARCHITECTURE.md](./EVENT_LISTENER_ARCHITECTURE.md) - Overall event system
- [FRONTEND_HOOKS_GUIDE.md](./FRONTEND_HOOKS_GUIDE.md) - Using Convex queries in React
- [GAME_SPECS.md](./GAME_SPECS.md) - Game mechanics and betting rules

---

## 💡 Tips

1. **Start with Option 2 (PDA polling)** - Simpler, guaranteed accurate
2. **Later migrate to Option 1 (Event listening)** - More scalable, real-time
3. **Use both!** - Events for real-time, PDA polling as fallback/reconciliation
4. **Monitor Convex usage** - Events consume function calls, optimize polling frequency
5. **Cache aggressively** - Frontend should cache bet data, only re-query on changes

---

**Questions?** Check existing implementations:
- `convex/eventListener.ts` - Game state polling example
- `convex/lib/solana.ts` - Solana client with PDA fetching
- `programs/domin8_prgm/src/events.rs` - Event definitions
