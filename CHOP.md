# CHOP - Timberman-Style Skill Game

## Overview

CHOP is a fast-paced, Timberman-style arcade game where players chop branches off a tree while avoiding getting hit. Built on Solana with pay-to-play mechanics and 1v1 PVP wagering.

## Game Mechanics

### Core Gameplay

- **Objective**: Chop branches as fast as possible while staying alive
- **Controls**:
  - `LEFT` / `A` key: Move left and chop
  - `RIGHT` / `D` key: Move right and chop
  - Touch: Tap left/right side of screen (mobile)
- **Death Conditions**:
  - Hit a branch on your side
  - Time bar runs out

### Scoring & Difficulty

**Brutal curve** - designed for quick deaths. Casual players die around score 40-60, only the best reach 200+, and score 1000 is legendary.

| Score Range | Decay Rate | Difficulty |
|-------------|------------|------------|
| 0-29        | 12/sec     | Warm-up |
| 30-59       | 18/sec     | Getting tough |
| 60-99       | 25/sec     | Serious |
| 100-149     | 35/sec     | Hard |
| 150-249     | 50/sec     | Very hard |
| 250-499     | 70/sec     | Expert only |
| 500-749     | 100/sec    | Near impossible |
| 750-999     | 150/sec    | Inhuman |
| 1000+       | 250/sec    | Unplayable |

- Each chop refills +8 time units
- Time bar starts at 100, max is 100

### Tree Generation

- 60% chance of branch per segment
- 70% chance to alternate sides (prevents impossible patterns)
- First 2 segments always safe (no branches)
- Pattern generated server-side (anti-cheat)

---

## Game Modes

### 1. Demo Mode (Free)

Play for practice without paying. Scores don't save to leaderboard but shows projected rank.

### 2. Solo Mode (Pay-to-Play)

**Start Price**: 0.1 SOL

Play until death, then choose to continue (escalating price) or end session.

#### Continue Pricing

| Continue # | Price (SOL) |
|------------|-------------|
| 1st        | 0.01        |
| 2nd        | 0.05        |
| 3rd        | 0.15        |
| 4th        | 0.40        |
| 5th        | 1.00        |
| 6th        | 2.50        |
| 7th        | 6.00        |
| 8th        | 15.00       |
| 9th        | 40.00       |
| 10th+      | 100.00      |

**Leaderboard**: All-time high scores by wallet address.

### 3. PVP Mode (1v1 Wagering)

**How it works**:
1. Creator deposits SOL (min 0.001) and creates lobby
2. Opponent joins with matching bet
3. Both players play the same tree pattern simultaneously
4. Winner takes 95% of pot

**Winner Determination** (priority order):
1. Last player standing (opponent died first)
2. If both died: highest score wins
3. Tiebreaker: who died last

**Prize Distribution**:
- 95% to winner
- 2.5% to platform treasury
- 2.5% to lobby creator

**Leaderboard**: Weekly reset (Monday), tracks wins and total wagered.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
├─────────────────────────────────────────────────────────────┤
│  React (ChopPage.tsx)                                       │
│  ├── State machine (idle/demo/solo/pvp)                     │
│  ├── Payment flows (Privy wallet)                           │
│  ├── UI panels (leaderboard, lobbies, game over)            │
│  └── Phaser game container                                  │
├─────────────────────────────────────────────────────────────┤
│  Phaser (ChopGame.ts)                                       │
│  ├── Game rendering (324x534 canvas)                        │
│  ├── Input handling (keyboard/touch)                        │
│  ├── Animations (chop, death, tree scroll)                  │
│  └── Events to/from React                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND (Convex)                        │
├─────────────────────────────────────────────────────────────┤
│  Solo Mode (chopSolo.ts, chopSoloActions.ts)                │
│  ├── Session management (start, continue, end)              │
│  ├── Payment verification via Solana RPC                    │
│  ├── Branch pattern generation                              │
│  └── Leaderboard updates                                    │
├─────────────────────────────────────────────────────────────┤
│  PVP Mode (chopLobbies.ts)                                  │
│  ├── Lobby creation/joining                                 │
│  ├── Real-time input recording                              │
│  ├── Winner determination                                   │
│  └── Weekly leaderboard                                     │
├─────────────────────────────────────────────────────────────┤
│  Anti-Cheat (chopBotDetection.ts)                           │
│  └── Input pattern analysis for bot detection               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   BLOCKCHAIN (Solana)                        │
├─────────────────────────────────────────────────────────────┤
│  Smart Contract (chop_prgm)                                 │
│  ├── create_lobby: Creator deposits bet                     │
│  ├── join_lobby: Opponent deposits matching bet             │
│  ├── end_game: Distribute funds (95/2.5/2.5 split)          │
│  └── cancel_lobby: Refund if no opponent                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Solo Mode Tables

**chopSoloSessions**
| Field | Type | Description |
|-------|------|-------------|
| walletAddress | string | Player wallet |
| sessionId | string | Unique session ID |
| isActive | boolean | Session in progress |
| currentScore | number | Current score |
| highScore | number | Best score this session |
| continueCount | number | Times continued |
| totalPaid | number | Total SOL paid (lamports) |
| branchPattern | string[] | Server-generated pattern |

**chopSoloLeaderboard**
| Field | Type | Description |
|-------|------|-------------|
| walletAddress | string | Player wallet |
| highScore | number | All-time best |
| totalGames | number | Games played |
| totalContinues | number | Total continues used |
| totalSpent | number | Total SOL spent |

### PVP Mode Tables

**chopLobbies**
| Field | Type | Description |
|-------|------|-------------|
| lobbyId | number | Unique lobby ID |
| creatorWallet | string | Lobby creator |
| betAmount | number | Per-player bet (lamports) |
| status | string | open/locked/finished |
| branchPattern | string[] | Shared pattern for both players |
| playerStates | object | Score, alive status per player |
| winner | string | Winner wallet (after game) |

**chopLeaderboard** (Weekly)
| Field | Type | Description |
|-------|------|-------------|
| walletAddress | string | Player wallet |
| weekStart | number | Monday timestamp |
| highScore | number | Best score this week |
| gamesPlayed | number | Games this week |
| gamesWon | number | Wins this week |
| totalWagered | number | SOL wagered |
| totalWon | number | SOL won |

---

## Payment Flows

### Solo Mode

```
┌──────────┐    0.1 SOL    ┌──────────┐
│  Player  │──────────────▶│ Treasury │
└──────────┘               └──────────┘
      │
      │ TX signature
      ▼
┌──────────────────────────────────────┐
│  Convex: startSoloSessionVerified    │
│  1. Verify TX via Solana RPC         │
│  2. Check: sender, recipient, amount │
│  3. Check: TX not already used       │
│  4. Create session                   │
└──────────────────────────────────────┘
```

### PVP Mode

```
┌─────────┐  bet   ┌────────────┐  bet   ┌─────────┐
│ Creator │───────▶│ Lobby PDA  │◀───────│ Joiner  │
└─────────┘        └────────────┘        └─────────┘
                         │
                         │ end_game
                         ▼
              ┌─────────────────────┐
              │   Distribution      │
              │  • 95% to winner    │
              │  • 2.5% to treasury │
              │  • 2.5% to creator  │
              └─────────────────────┘
```

---

## Anti-Cheat Measures

1. **Server-side pattern generation**: Branch pattern created on backend, client cannot predict
2. **Input logging**: Every chop recorded with timestamp for analysis
3. **Bot detection**: Pattern analysis flags suspicious accounts
   - Inhuman reaction times
   - Perfect timing patterns
   - Unnatural input sequences
4. **TX replay protection**: Each payment signature can only be used once

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `src/pages/ChopPage.tsx` | Main React component, state machine, UI |
| `src/game/chop/ChopGame.ts` | Phaser game scene, mechanics |
| `src/game/chop/ChopBoot.ts` | Asset preloader |
| `src/game/chop/index.ts` | Game factory |

### Backend (Convex)
| File | Purpose |
|------|---------|
| `convex/chopSolo.ts` | Solo mode queries/mutations |
| `convex/chopSoloActions.ts` | Payment verification (RPC) |
| `convex/chopLobbies.ts` | PVP lobby management |
| `convex/lib/soloPaymentVerifier.ts` | SOL transfer verification |
| `convex/chopBotDetection.ts` | Anti-cheat analysis |

### Smart Contract (Anchor)
| File | Purpose |
|------|---------|
| `programs/chop_prgm/src/lib.rs` | Program entry |
| `programs/chop_prgm/src/state.rs` | Account structures |
| `programs/chop_prgm/src/instructions/*.rs` | Instruction handlers |

---

## Constants

### Pricing
| Constant | Value |
|----------|-------|
| Solo start price | 0.1 SOL |
| PVP minimum bet | 0.001 SOL |
| Platform fee (PVP) | 2.5% |
| Creator fee (PVP) | 2.5% |

### Game Settings
| Constant | Value |
|----------|-------|
| Time bar max | 100 |
| Time refill per chop | +8 |
| Visible tree segments | 7 |
| Branch probability | 60% |
| Side alternation chance | 70% |

### Treasury
```
Solo Treasury: FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB
```

---

## Game Events (Phaser ↔ React)

### From Phaser to React
| Event | Data | Description |
|-------|------|-------------|
| `chop:gameover` | `{ score }` | Game ended |
| `chop:death` | `{ score, timestamp }` | Player died |
| `chop:newhighscore` | `{ score }` | Beat #1 on leaderboard |
| `chop:playing` | - | Countdown finished, game started |

### From React to Phaser
| Event | Data | Description |
|-------|------|-------------|
| `chop:start` | `{ branchPattern }` | Start countdown |
| `chop:restart` | - | Reset game state |
| `chop:continue` | `{ score }` | Resume from death |
| `chop:highscore` | `{ score }` | Update displayed high score |

---

## Development

```bash
# Install dependencies
bun install

# Run development server (frontend + Convex)
bun run dev

# Build smart contract
cd programs/chop_prgm && anchor build

# Deploy smart contract (devnet)
anchor deploy --provider.cluster devnet
```
