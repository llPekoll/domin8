# Phase 3 Implementation Summary: Convex Backend Schema & Actions

**Status:** ✅ COMPLETE

This document summarizes the implementation of Phase 3 for the 1v1 (Coinflip) feature, which establishes the Convex backend layer.

## What Was Implemented

### 1. **Database Schema Update** (`convex/schema.ts`)
Added a new `oneVOneLobbies` table with the following structure:

```typescript
oneVOneLobbies: {
  // Identifiers
  lobbyId: number,              // Unique lobby ID from on-chain
  lobbyPda: string,             // Public key of the Lobby PDA (base58)

  // Players
  playerA: string,              // Player A's wallet address
  playerB?: string,             // Player B's wallet address (optional until joined)

  // Game State
  amount: number,               // Bet amount per player (lamports)
  status: number,               // 0 = created (waiting), 1 = resolved
  winner?: string,              // Winner's wallet address (optional until resolved)

  // Characters & Map
  characterA: number,           // Player A's character/skin ID (0-255)
  characterB?: number,          // Player B's character/skin ID (optional until joined)
  mapId: number,                // Map/background ID (0-255)

  // Positioning (Optional, for future expansion)
  positionA?: [number, number], // [x, y] spawn position
  positionB?: [number, number], // [x, y] spawn position

  // Timestamps
  createdAt: number,            // Creation timestamp
  resolvedAt?: number,          // Resolution timestamp
}
```

**Indexes:**
- `by_status` - Query open lobbies (status = 0)
- `by_player_a` - Query lobbies by Player A
- `by_player_b` - Query lobbies by Player B
- `by_status_and_created` - Pagination and stuck lobby detection

---

### 2. **Solana Integration Helper** (`convex/lib/solana_1v1.ts`)

Created `Solana1v1QueryClient` - a read-only query client for the 1v1 Lobby program:

**Key Methods:**
- `getLobbyAccount(lobbyPda)` - Fetch a lobby from blockchain
- `getConfigAccount()` - Fetch the global config
- `getNextLobbyId()` - Get the next lobby ID
- `getLobbyPdaForId(lobbyId)` - Derive a lobby PDA
- `getProgramId()` - Get the 1v1 program ID

**Features:**
- Loads the `domin8_1v1_prgm` IDL automatically
- Connects to Solana RPC endpoint
- Provides typed access to on-chain account data
- Used by actions and cron jobs for blockchain state queries

---

### 3. **Convex Lobbies Module** (`convex/lobbies.ts`)

Comprehensive backend module with the following components:

#### **Queries (Public - Frontend Access)**
- `getOpenLobbies()` - Get all lobbies waiting for Player B
- `getLobbyState(lobbyId)` - Poll a specific lobby (used during fights)
- `getPlayerLobbies(playerWallet)` - Get all lobbies for a player (as A or B)

#### **Mutations (Database Operations)**
- `createLobbyMutation(...)` - Insert a new lobby
- `joinLobbyMutation(...)` - Update lobby with Player B + winner
- `cancelLobbyMutation(...)` - Delete a lobby
- `updateLobbyStatusMutation(...)` - Update lobby status (for sync)

#### **Actions (Blockchain Integration)**
- `createLobby(...)` - Verify create transaction on-chain, return data
- `joinLobby(...)` - Verify join transaction on-chain, return winner
- `cancelLobby(...)` - Verify cancel transaction on-chain, return success

**Action Architecture:**
- Frontend submits signed transaction to blockchain
- Frontend calls action with transaction hash
- Action verifies transaction on blockchain
- Action returns blockchain-verified data
- Frontend then calls appropriate mutation to update Convex DB
- This ensures immediate sync (no waiting for cron)

#### **Internal Queries (For Cron Jobs)**
- `getStuckLobbies(maxAgeSeconds)` - Find old lobbies that may be stuck

#### **Internal Mutations (For Cron Jobs)**
- `syncLobbyFromBlockchain(lobbyId)` - Reconcile lobby state from blockchain

---

### 4. **Cron Job Setup** (`convex/crons.ts`)

Added configuration for 1v1 lobby recovery:

```typescript
crons.interval(
  "sync-1v1-stuck-lobbies",
  { seconds: 30 },
  internal.lobbies.syncLobbyFromBlockchain
);
```

**Purpose:**
- Runs every 30 seconds as a backup safety net
- Reconciles any discrepancies between on-chain and Convex state
- Automatically syncs lobbies that are stuck in status 0 after 5 minutes
- Provides self-healing for edge cases (network failures, frontend crashes, etc.)

**Note:** This cron will be uncommented once Convex regenerates the API after deployment.

---

## Architecture: Immediate Sync with Cron Fallback

### Frontend Flow (Immediate Sync):
```
1. Frontend creates/signs transaction
2. Frontend submits to blockchain
3. Frontend gets tx hash back
4. Frontend calls Convex action with tx hash
5. Action verifies tx on-chain
6. Action returns verified data
7. Frontend calls mutation to update DB
8. DB is updated IMMEDIATELY (no waiting)
```

### Cron Fallback (Every 30 seconds):
```
1. Cron finds stuck lobbies (status 0, age > 5 min)
2. Cron queries blockchain for each lobby
3. If on-chain status != Convex status, sync it
4. Catches missed updates from network failures
```

---

## Key Design Decisions

1. **Immediate Updates After Transaction Confirmation**
   - Frontend responsibility: Call action → Call mutation in sequence
   - This ensures Convex is up-to-date immediately
   - Cron is just a backup, not the primary sync mechanism

2. **Read-Only Query Client**
   - No private keys stored in Convex
   - Only reads blockchain state
   - Transaction submission is 100% frontend responsibility

3. **Simple Status Machine**
   - Only 2 statuses: 0 (created) and 1 (resolved)
   - No intermediate states
   - Clear semantics for queries and indexing

4. **Optimistic DB Insertion**
   - Mutations don't re-verify blockchain
   - Frontend already verified in action
   - Faster DB updates

5. **Stuck Lobby Detection**
   - Lobbies older than 5 minutes checked by cron
   - Prevents indefinite stuck states
   - Optional: Could also detect if Player B never joined

---

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `convex/schema.ts` | ✅ Modified | Added `oneVOneLobbies` table |
| `convex/lib/solana_1v1.ts` | ✅ Created | Solana query client for 1v1 program |
| `convex/lobbies.ts` | ✅ Created | All lobby queries, mutations, actions |
| `convex/crons.ts` | ✅ Modified | Added 1v1 lobby sync cron |

---

## Integration Points with Other Phases

### Phase 1 & 2 (On-Chain Program)
- ✅ Uses deployed `domin8_1v1_prgm` IDL
- ✅ Queries `Domin81v1Lobby` and `Domin81v1Config` accounts
- ✅ Verifies transactions from `create_lobby`, `join_lobby`, `cancel_lobby`

### Phase 4 (Frontend React UI)
- **Will use:**
  - `getOpenLobbies()` query → Display lobby list
  - `getLobbyState()` query → Poll during fight
  - `createLobby()` action → Verify transaction
  - `joinLobby()` action → Verify transaction
  - `cancelLobby()` action → Verify transaction
  - `createLobbyMutation()` mutation → Save to DB
  - `joinLobbyMutation()` mutation → Update with winner
  - `cancelLobbyMutation()` mutation → Delete lobby

---

## Environment Setup Requirements

The following environment variables must be set for deployment:

```bash
SOLANA_RPC_URL=<rpc-endpoint>  # e.g., "https://api.devnet.solana.com"
```

---

## Testing Checklist

- [ ] Verify `oneVOneLobbies` table exists with all fields
- [ ] Test `getOpenLobbies()` returns empty initially
- [ ] Create a lobby on-chain, verify query returns it
- [ ] Verify `getLobbyState()` returns correct lobby
- [ ] Join a lobby on-chain, verify status changes to 1
- [ ] Test `getPlayerLobbies()` for both players
- [ ] Verify `cancelLobbyMutation()` removes lobby
- [ ] Run cron manually, verify stuck lobbies are synced
- [ ] Test with multiple lobbies in various states
- [ ] Verify indexes are properly used for queries

---

## Phase 3 Completion Criteria

✅ **All Criteria Met:**

- [x] `oneVOneLobbies` table added to schema with correct fields
- [x] `Solana1v1QueryClient` created for blockchain queries
- [x] All queries implemented: `getOpenLobbies`, `getLobbyState`, `getPlayerLobbies`
- [x] All mutations implemented: `createLobby`, `joinLobby`, `cancelLobby`, `updateStatus`
- [x] All actions implemented: `createLobby`, `joinLobby`, `cancelLobby`
- [x] Internal mutations for cron implemented
- [x] Internal queries for stuck lobby detection implemented
- [x] Cron job configuration added (ready to uncomment after API regeneration)
- [x] No TypeScript errors in any Phase 3 files

---

## Next Steps: Phase 4

Phase 4 will implement the React frontend:
1. Routes: `/1v1` page
2. Components: `OneVOnePage`, `LobbyList`, `CreateLobby`, `OneVOneFightScene`
3. Integration: Wire up Convex queries/mutations/actions to UI
4. UI Updates: Real-time lobby list, fight scene with animation

---

## Notes for Developers

1. **API Regeneration:** After deploying to Convex, the API will automatically include `internal.lobbies.*` functions. Uncomment the cron job at that time.

2. **Transaction Verification:** The action layer verifies transactions were successful before returning. This prevents phantom updates.

3. **Cron Safety Net:** The 30-second cron is intentionally a safety net, not the primary sync mechanism. This keeps database consistent even if frontend crashes.

4. **Extensibility:** The schema allows for future expansions (e.g., additional fields for matchmaking, replay data, ratings, etc.) without restructuring.

5. **PDA Derivation:** Lobby PDAs are derived consistently using `hash(b"domin8_1v1_lobby" || lobby_id)` to enable deterministic lookups.

---

**Implementation Date:** November 15, 2025
**Status:** Ready for Phase 4 (Frontend Implementation)
