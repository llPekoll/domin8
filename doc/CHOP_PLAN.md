# CHOP - Development Plan

## Overview

Build a Timberman-style PVP game reusing existing infrastructure (Convex, Anchor).

---

## Architecture Decision

**Recommendation: Reuse `domin8_1v1_prgm` pattern (or fork it)**

Smart contract handles **money only**:

- Collect bets (escrow)
- Store winner pubkey
- Distribute prizes (95% winner, 2.5% creator, 2.5% platform)

Game logic lives in **Convex** (off-chain):

- Track scores
- Track death timestamps
- Determine winner (last standing / highest score)
- Call smart contract with winner

Can reuse:

- Convex backend patterns (schedulers, webhooks)
- Privy wallet integration
- Frontend components (betting UI, wallet connection)

**No VRF needed** - Winner determined by skill (last standing / highest score), not randomness.

---

## Phase 1: Smart Contract (`programs/chop_prgm`)

**Minimal contract** - handles money only. All game logic in Convex.

### State Structures

```rust
// Global config
pub struct ChopConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub platform_fee_bps: u16,    // 2.5% = 250 bps
    pub creator_fee_bps: u16,     // 2.5% = 250 bps
    pub lobby_count: u64,
}

// PVP Lobby (money only - no game state)
pub struct ChopLobby {
    pub lobby_id: u64,
    pub creator: Pubkey,          // Gets 2.5% rake
    pub bet_amount: u64,          // Per-player bet
    pub status: u8,               // 0=open, 1=locked, 2=finished
    pub created_at: i64,
    pub players: Vec<Pubkey>,     // For validation: winner must be in this list
    pub total_pot: u64,           // Sum of all bets
    pub winner: Option<Pubkey>,   // Set by Convex backend
}
```

### Instructions (5 total)

1. **initialize_config** - Admin setup
2. **create_lobby** - Creator makes lobby (sets bet amount, deposits SOL)
3. **join_lobby** - Players join (deposit SOL)
4. **end_game** - Convex sets winner pubkey + distributes prizes
5. **cancel_lobby** - Refund all if game doesn't start

### Prize Distribution

```rust
// In end_game instruction (called by Convex with winner pubkey)
let winner_amount = total_pot * 95 / 100;      // 95% to winner
let creator_amount = total_pot * 25 / 1000;    // 2.5% to creator
let platform_amount = total_pot * 25 / 1000;   // 2.5% to treasury
```

---

## Phase 2: Convex Backend

### New Tables

```typescript
// convex/schema.ts additions

chopLobbies: defineTable({
  lobbyId: v.number(),
  creator: v.string(),
  betAmount: v.number(),
  status: v.union(v.literal("open"), v.literal("playing"), v.literal("finished")),
  createdAt: v.number(),
  gameStartAt: v.number(),       // When lobby closes
  gameEndAt: v.number(),         // 60s after start
  players: v.array(v.object({
    wallet: v.string(),
    score: v.number(),           // Game logic - tracked here
    diedAt: v.optional(v.number()), // Game logic - tracked here
  })),
  winner: v.optional(v.string()),
  totalPot: v.number(),
}),

chopLeaderboard: defineTable({
  player: v.string(),
  weekStartDate: v.string(),     // "2024-01-15"
  highScore: v.number(),
  totalGames: v.number(),
  totalWagered: v.number(),      // Total SOL bet (lamports) - for "mother load" display
  totalWon: v.number(),          // Total SOL won (lamports)
}),
```

### Winner Logic (in Convex, not smart contract)

```typescript
// convex/chopScheduler.ts
function determineWinner(players: Player[]): string {
  // 1. Last standing wins
  const alive = players.filter((p) => !p.diedAt);
  if (alive.length === 1) return alive[0].wallet;

  // 2. Multiple survivors → highest score
  if (alive.length > 1) {
    return alive.sort((a, b) => b.score - a.score)[0].wallet;
  }

  // 3. Everyone died → last to die wins
  // Tiebreaker: highest score at death
  return players.sort((a, b) => {
    if (b.diedAt !== a.diedAt) return b.diedAt! - a.diedAt!;
    return b.score - a.score;
  })[0].wallet;
}
```

### Scheduler Functions

```typescript
// convex/chopScheduler.ts

// When lobby creation detected via Helius webhook
export const scheduleGameStart = mutation(async (ctx, { lobbyId, startAt }) => {
  await ctx.scheduler.runAt(startAt, internal.chopScheduler.startGame, { lobbyId });
});

// Start game - close lobby to new players
export const startGame = internalMutation(async (ctx, { lobbyId }) => {
  // Update status to "playing"
  // Schedule end_game for +60s
});

// End game - finalize scores and distribute prizes
export const endGame = internalMutation(async (ctx, { lobbyId }) => {
  // Call smart contract end_game instruction
  // Distribute prizes: 95% to winner, 2.5% creator, 2.5% platform
});
```

---

## Phase 3: Phaser Game Engine

### New Scene: `ChopGame.ts`

```typescript
// src/game/scenes/ChopGame.ts

export class ChopGame extends Phaser.Scene {
  private tree: Phaser.GameObjects.Sprite;
  private player: Phaser.GameObjects.Sprite;
  private branches: Branch[] = [];
  private score: number = 0;
  private playerSide: "left" | "right" = "left";
  private gameOver: boolean = false;
  private diedAt: number | null = null;

  // Input handling
  private onChop(side: "left" | "right") {
    if (this.gameOver) return;

    this.playerSide = side;
    this.player.setFlipX(side === "right");

    // Check collision with bottom branch
    const bottomBranch = this.branches[0];
    if (bottomBranch && bottomBranch.side === side) {
      // HIT BRANCH - GAME OVER
      this.die();
      return;
    }

    // Successful chop
    this.score++;
    this.shiftBranches();
    this.playChopAnimation();
  }

  private die() {
    this.gameOver = true;
    this.diedAt = Date.now();
    // Submit score to smart contract
    this.submitScore();
  }
}
```

### Assets Needed

```
public/assets/chop/
├── tree-trunk.png        # Tree trunk segment
├── branch-left.png       # Branch pointing left
├── branch-right.png      # Branch pointing right
├── player-idle.png       # Player standing
├── player-chop.png       # Player chopping animation
├── background.png        # Forest background
└── log.png               # Flying log piece
```

---

## Phase 4: Frontend Components

### New Components

```
src/components/chop/
├── ChopLobbyList.tsx     # Browse/create lobbies
├── ChopLobbyCard.tsx     # Single lobby display
├── ChopCreateLobby.tsx   # Create lobby form
├── ChopWaitingRoom.tsx   # Pre-game lobby (60s countdown)
├── ChopGameHUD.tsx       # In-game score/timer
├── ChopResults.tsx       # Post-game results
├── ChopSoloMode.tsx      # Solo mode entry
└── ChopLeaderboard.tsx   # Weekly leaderboard
```

### New Pages

```
src/pages/
├── ChopPage.tsx          # Main CHOP landing
├── ChopLobbyPage.tsx     # Specific lobby view
└── ChopSoloPage.tsx      # Solo mode play
```

---

## Phase 5: Integration

### Helius Webhooks

Listen for CHOP program events:

- `LobbyCreated` → Create Convex record, schedule start
- `PlayerJoined` → Update Convex record
- `GameEnded` → Update winner, trigger animations
- `PrizeSent` → Mark as complete

### Real-time Sync

- Convex WebSocket for lobby updates
- Players see join/leave in real-time
- Score submissions broadcast to all players
- Winner announcement synchronized

---

## Development Order

### Week 1: Smart Contract

1. [ ] Create `programs/chop_prgm` directory structure
2. [ ] Implement state structs (`ChopConfig`, `ChopLobby`, `ChopPlayer`)
3. [ ] Implement `initialize_config` instruction
4. [ ] Implement `create_lobby` instruction
5. [ ] Implement `join_lobby` instruction
6. [ ] Implement `end_game` (receives winner pubkey, distributes prizes)
7. [ ] Implement `cancel_lobby` (refunds)
8. [ ] Write Anchor tests
9. [ ] Deploy to devnet

### Week 2: Backend + Game

1. [ ] Add Convex schema tables
2. [ ] Implement Helius webhook handlers
3. [ ] Implement scheduler functions
4. [ ] Create ChopGame Phaser scene
5. [ ] Implement tree/branch mechanics
6. [ ] Implement collision detection
7. [ ] Create/source game assets

### Week 3: Frontend + Polish

1. [ ] Build lobby list/create UI
2. [ ] Build waiting room
3. [ ] Build game HUD
4. [ ] Build results screen
5. [ ] Add sound effects
6. [ ] Mobile controls (tap left/right sides)
7. [ ] Testing & bug fixes

### Week 4: Solo Mode + Launch

1. [ ] Implement solo pack purchase
2. [ ] Implement solo scoring
3. [ ] Build leaderboard
4. [ ] Implement continue/lives system
5. [ ] Final testing
6. [ ] Mainnet deployment

---

## Open Questions

1. **Anti-cheat**: How to verify scores? Options:
   - Client submits replay data (branch pattern + inputs)
   - Server-side game simulation
   - Trust client (simpler, some risk)

2. **Simultaneous deaths**: If 2+ players die in same millisecond:
   - Higher score at death wins (current plan)

3. **Minimum players**:
   - 2 players minimum to start?
   - Or allow 1 player (refund like domin8)?

4. **Lobby expiry**:
   - What if no one joins in 60s?
   - Refund creator? Or extend time?
