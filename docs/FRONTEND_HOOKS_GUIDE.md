# Frontend Hooks Guide - Updated for Convex Backend

## Overview

The frontend hooks have been updated to use **Convex queries** instead of directly polling the Solana blockchain. This provides:

✅ **Automatic syncing** - Convex cron job polls blockchain every 5 seconds  
✅ **Reactive updates** - Hooks automatically re-render when data changes  
✅ **Reduced RPC calls** - No more per-user blockchain polling  
✅ **Better performance** - Convex handles caching and optimization  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Hooks (useGameState, useBlockchainDebug)      │   │
│  │  - Use Convex queries (useQuery)                     │   │
│  │  - Automatically reactive                            │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ Convex Queries
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONVEX BACKEND                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  events.ts - Query Functions                         │   │
│  │  - getCurrentRoundState()                            │   │
│  │  - getStateStats()                                   │   │
│  │  - getRoundStates(roundId)                           │   │
│  │  - getRecentEvents()                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database Tables                                     │   │
│  │  - blockchainEvents (raw events)                     │   │
│  │  - gameRoundStates (state snapshots)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Cron Job (every 5 seconds)                          │   │
│  │  - Polls Solana blockchain                           │   │
│  │  - Saves events to blockchainEvents                  │   │
│  │  - Saves state snapshots to gameRoundStates          │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ Polls every 5s
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   SOLANA BLOCKCHAIN                          │
│  - domin8_prgm (game program)                                │
│  - Game Round PDA (state account)                            │
│  - Events (GameCreated, BetPlaced, WinnerSelected)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Updated Hooks

### 1. `useGameState()`

**Purpose:** Access current game round state for gameplay UI

**Before (Direct Blockchain Polling):**
```typescript
// ❌ OLD - Polled blockchain every 3 seconds per user
useEffect(() => {
  const interval = setInterval(async () => {
    const connection = new Connection(RPC_URL);
    const gameRound = await program.account.gameRound.fetch(pda);
    setGameState(gameRound);
  }, 3000);
}, []);
```

**After (Convex Queries):**
```typescript
// ✅ NEW - Reactive Convex query, auto-updates
const currentRoundState = useQuery(api.events.getCurrentRoundState);
const stateStats = useQuery(api.events.getStateStats);
```

**Usage:**
```typescript
import { useGameState } from "@/hooks/useGameState";

function GameUI() {
  const { gameState, gameConfig, loading, error } = useGameState();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Round {gameState.roundId}</h1>
      <p>Status: {gameState.status}</p>
      <p>Total Pot: {gameState.initialPot} SOL</p>
      <p>Bets: {gameState.bets.length}</p>
    </div>
  );
}
```

**Returns:**
```typescript
{
  gameState: GameState | null,    // Current round state
  gameConfig: GameConfig,          // Program configuration
  vaultBalance: number,            // Vault SOL balance (not tracked yet)
  loading: boolean,                // Loading state
  error: string | null,            // Error message
  refresh: () => void              // No-op (Convex auto-refreshes)
}
```

---

### 2. `useBlockchainDebug()`

**Purpose:** Debug view of blockchain state for admin/dev tools

**Before:**
```typescript
// ❌ OLD - Tried to use non-existent api.frontend.getGameStats
const gameStats = useQuery(api.frontend.getGameStats); // Didn't exist!
```

**After:**
```typescript
// ✅ NEW - Uses actual Convex queries
const currentRoundState = useQuery(api.events.getCurrentRoundState);
const stateStats = useQuery(api.events.getStateStats);
```

**Usage:**
```typescript
import { useBlockchainDebug } from "@/hooks/useBlockchainDebug";

function DebugPanel() {
  const { gameRound, currentRoundId, gameExists, isLoading } = useBlockchainDebug();

  return (
    <div className="debug-panel">
      <h2>Blockchain Debug</h2>
      <pre>{JSON.stringify(gameRound, null, 2)}</pre>
    </div>
  );
}
```

---

## Available Convex Queries

All queries are in `convex/events.ts` and auto-synced from blockchain:

### Game Round State Queries

| Query | Purpose | Args |
|-------|---------|------|
| `getCurrentRoundState()` | Get latest round state | None |
| `getStateStats()` | Get overall statistics | None |
| `getRoundStates(roundId)` | Get all states for a round | `roundId: number` |
| `getRoundStateByStatus(roundId, status)` | Get specific state | `roundId, status` |
| `getRoundsByStatus(status)` | Get all rounds in status | `status: string` |
| `getAllRounds()` | Get all rounds (latest state) | `limit?: number` |

### Blockchain Event Queries

| Query | Purpose | Args |
|-------|---------|------|
| `getRecentEvents()` | Get recent events | `limit?: number` |
| `getEventsByName(name)` | Get events by type | `eventName: string` |
| `getEventsByRound(roundId)` | Get events for round | `roundId: number` |
| `getAllEvents()` | Get all events | `limit?: number` |

---

## Data Structures

### GameState (from `gameRoundStates` table)

```typescript
interface GameState {
  roundId: number;                      // Current round ID
  status: "Waiting" | "AwaitingWinnerRandomness" | "Finished";
  startTimestamp: number;               // Unix timestamp
  endTimestamp: number;                 // When betting closes
  bets: BetEntry[];                     // Array of bets
  initialPot: number;                   // Total pot (SOL)
  winner: string | null;                // Winner wallet address
  vrfRequestPubkey: string;             // VRF request pubkey
  vrfSeed: number[];                    // VRF seed bytes
  randomnessFulfilled: boolean;         // VRF fulfilled?
  gameRoundPda: string;                 // PDA address
  vaultPda: string;                     // Vault PDA
}
```

### BlockchainEvent (from `blockchainEvents` table)

```typescript
interface BlockchainEvent {
  eventName: string;          // "GameCreated", "BetPlaced", "WinnerSelected"
  signature: string;          // Transaction signature
  slot: number;               // Solana slot
  blockTime: number;          // Unix timestamp
  eventData: any;             // Full event data
  roundId?: number;           // Associated round ID
  processed: boolean;         // Processing flag
}
```

---

## Migration Checklist

When updating components that use the old hooks:

- [ ] **Remove Solana imports** - No more `@solana/web3.js`, `@coral-xyz/anchor`
- [ ] **Add Convex imports** - `import { useQuery } from "convex/react"`
- [ ] **Update hook imports** - Use updated `useGameState()` or `useBlockchainDebug()`
- [ ] **Remove manual polling** - Convex handles auto-refresh
- [ ] **Update error handling** - Convex queries return `undefined` while loading
- [ ] **Test reactivity** - Verify UI updates when game state changes

---

## Troubleshooting

### TypeScript Error: Cannot find module '../../convex/_generated/api'

**Solution:** Run Convex development server to generate types:
```bash
npx convex dev
```

This generates:
- `convex/_generated/api.ts` - Typed query/mutation exports
- `convex/_generated/server.ts` - Server types

### Hook returns `undefined`

**Cause:** Convex queries return `undefined` while loading

**Solution:**
```typescript
const currentRoundState = useQuery(api.events.getCurrentRoundState);

if (currentRoundState === undefined) {
  return <LoadingSpinner />;
}

// Now currentRoundState is guaranteed to be non-undefined
```

### Data not updating

**Check:**
1. Is Convex dev server running? (`npx convex dev`)
2. Is the cron job active? (Check Convex dashboard → Cron Jobs)
3. Is the blockchain syncing? (Check `blockchainEvents` table for new rows)

### Stale data (older than 5 seconds)

**Cause:** Convex cron polls every 5 seconds

**Solutions:**
- Accept 5-second latency (normal for blockchain apps)
- For critical actions (placing bets), call blockchain directly
- Increase cron frequency in `convex/crons.ts` (⚠️ more RPC calls)

---

## Performance Benefits

### Before (Direct Blockchain Polling)

| Metric | Value |
|--------|-------|
| RPC calls per user | 1 every 3 seconds |
| 10 users | 200 RPC calls/minute |
| 100 users | 2,000 RPC calls/minute |
| Cost | $$$ (rate limit hell) |

### After (Convex Sync)

| Metric | Value |
|--------|-------|
| RPC calls total | 12 per minute (1 every 5s) |
| 10 users | Still 12 calls/minute |
| 100 users | Still 12 calls/minute |
| Cost | $ (cheap!) |

**🎉 100x reduction in RPC calls!**

---

## Next Steps

1. **Run Convex dev server:** `npx convex dev`
2. **Verify data syncing:** Check Convex dashboard → Data → `gameRoundStates`
3. **Test updated hooks:** Load frontend, verify game state displays
4. **Monitor errors:** Check browser console for TypeScript errors
5. **Optimize queries:** Add indexes if queries are slow

---

## Related Documentation

- [CLEAN_BACKEND_PLAN.md](./CLEAN_BACKEND_PLAN.md) - Convex backend architecture
- [convex/events.ts](../convex/events.ts) - Available queries
- [convex/schema.ts](../convex/schema.ts) - Database schema
- [convex/eventListener.ts](../convex/eventListener.ts) - Sync logic
