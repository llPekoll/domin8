# DOMIN8 CODEBASE ANALYSIS - COMPREHENSIVE FINDINGS

## EXECUTIVE SUMMARY

The codebase has significantly diverged from the CLAUDE.md documentation. The actual implementation is simpler than described, focusing on a **single-round real-time battle system** with **20-bot demo mode** and **Orao VRF integration** (not custom VRF program).

### Key Differences from CLAUDE.md:
1. **VRF**: Uses Orao VRF (production, battle-tested), NOT custom domin8-vrf program
2. **Game Structure**: Single round per game, NO top-4 betting/long games
3. **Demo Mode**: Exists as described (20 bots, client-side only)
4. **Bank Bot**: NOT implemented
5. **Programs**: Only `domin8_prgm` exists, NOT `domin8_prgm` + `domin8-vrf` workspace
6. **Game Phases**: Simple 3-phase (Waiting → Arena → Results), NOT 7-phase long games
7. **Betting**: Self-betting only during waiting phase, NO spectator betting

---

## 1. SMART CONTRACT STRUCTURE

### Current Implementation
```
/programs/domin8_prgm/
├── src/
│   ├── lib.rs (Program entry, 6 instructions)
│   ├── state/
│   │   ├── domin8_game.rs (Main game account)
│   │   ├── domin8_config.rs (Global config)
│   │   └── mod.rs
│   ├── instructions/ (6 instructions)
│   │   ├── initialize_config.rs (Admin setup)
│   │   ├── create_game_round.rs (First bet + VRF request)
│   │   ├── bet.rs (Additional bets)
│   │   ├── end_game.rs (Winner selection via Orao VRF)
│   │   ├── send_prize_winner.rs (Payout distribution)
│   │   └── delete_game.rs (Admin cleanup)
│   ├── constants.rs
│   ├── error.rs (26+ error codes)
│   └── utils.rs
```

**Important**: The `domin8_prgm.backup` folder contains the old program (10 instructions, mock VRF). Current is simplified.

### Instructions (6 total, NOT 11)
1. **initialize_config** - Admin-only setup
2. **create_game_round** - First bet → creates game + requests Orao VRF
3. **bet** - Join game with additional bet (skin + position)
4. **end_game** - Admin ends game, reads Orao VRF randomness, selects winner
5. **send_prize_winner** - Transfers prize to winner
6. **delete_game** - Admin cleanup

### Game State Structure
```rust
pub struct Domin8Game {
    pub game_round: u64,
    pub start_date: i64,
    pub end_date: i64,
    pub total_deposit: u64,
    pub rand: u64,
    pub map: u8,  // Background ID 0-255
    pub user_count: u64,
    pub force: [u8; 32],  // VRF force seed
    pub status: u8,  // 0 = open, 1 = closed
    pub winner: Option<Pubkey>,
    pub winner_prize: u64,
    pub winning_bet_index: Option<u64>,
    pub wallets: Vec<Pubkey>,  // Unique wallets
    pub bets: Vec<BetInfo>,    // (wallet_index, amount, skin, position)
}

pub struct BetInfo {
    pub wallet_index: u16,
    pub amount: u64,
    pub skin: u8,             // Character ID
    pub position: [u16; 2],   // [x, y] spawn coordinates
}
```

### VRF Integration
**Using ORAO VRF (Solana-native, battle-tested)**
- Program ID: `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`
- Located in: `create_game_round.rs` → CPI call to request_v2
- Located in: `end_game.rs` → Reads randomness account
- **NOT** a custom implementation as described in CLAUDE.md
- Force seed: 32 bytes from config, used for VRF entropy

---

## 2. BACKEND (API SERVER)

### Database Schema (Simplified)

```typescript
gameRoundStates: {
  roundId: number
  status: "waiting" | "finished"
  startTimestamp: number
  endTimestamp: number
  capturedAt: number
  mapId: number
  betCount: number
  betAmounts: number[]
  betSkin: number[]
  betPosition: [number, number][]
  totalPot: number
  winner: string | null
  winningBetIndex: number
  prizeSent: boolean
}

scheduledJobs: {
  jobId: string
  roundId: number
  action: "end_game" | "send_prize"
  scheduledTime: number
  status: "pending" | "completed" | "failed"
  createdAt: number
}

characters: {
  name: string
  id: number
  assetPath: string
  description: string
  nftCollection: string (optional)
  isActive: boolean
}

maps: {
  name: string
  id: number
  description: string
  spawnConfiguration: { maxPlayers, spawnRadius, minSpacing }
  isActive: boolean
}

players: {
  walletAddress: string
  externalWalletAddress: string (optional)
  displayName: string (optional)
  lastActive: number
  totalGamesPlayed: number
  totalWins: number
  achievements: string[]
}
```

**NO TABLES FOR**: demo bots, top-4 betting, bank games, spectator bets

### Functions (8 files)

1. **syncService.ts** - Syncs blockchain to database every 45s
   - `syncBlockchainState()` → main cron job
   - `syncActiveGame()` → stores game state in DB
   - `processEndedGames()` → detects when game should end
   - `scheduleEndGameAction()` → schedules server job

2. **gameScheduler.ts** - Executes game state transitions
   - `executeEndGame()` → calls smart contract end_game
   - `executeSendPrize()` → calls smart contract send_prize_winner

3. **gameSchedulerMutations.ts** - DB operations for jobs
   - Job tracking (prevent duplicates)
   - Status updates
   - Cleanup old jobs

4. **players.ts** - Player operations
   - `getPlayer(walletAddress)`
   - `createPlayer(walletAddress, displayName)`
   - `getPlayersByWallets(addresses)`

5. **characters.ts** - Character management
   - Seed loading
   - Query helpers

6. **maps.ts** - Map management
   - Seed loading

7. **syncServiceMutations.ts** - DB writes for sync
   - `upsertGameState(gameRound)`

8. **webhooks.ts** - Incoming webhooks (if any)

### Crons (Running)

```typescript
// Every 45 seconds - sync blockchain state to database
crons.interval("sync-blockchain-state", { seconds: 45 },
  internal.syncService.syncBlockchainState
);

// Every 6 hours - cleanup old scheduled jobs
crons.interval("cleanup-old-scheduled-jobs", { hours: 6 }, 
  internal.gameSchedulerMutations.cleanupOldJobs
);
```

**NOT RUNNING** (commented out):
- Game recovery cron
- Transaction cleanup cron

---

## 3. FRONTEND ARCHITECTURE

### Game Scenes (Phaser.js)

**Boot.ts** - Initialization

**Preloader.ts** - Asset loading
- Loads character sprites from `/public/assets/characters/`
- Loads background images
- Loads audio files

**DemoScene.ts** - Client-side demo mode
- Runs continuously when no real game active
- Spawns 20 bots with random timing (0.2-3s intervals)
- 3 phases: spawning (20s) → arena (2-3s) → results (15s)
- Auto-restarts after completion
- **NO database calls, NO blockchain calls**
- Uses Math.random() for all randomness

**Game.ts** - Real game (blockchain-synced)
- Listens to `useActiveGame()` hook for blockchain updates
- Spawns participants from blockchain bet data (wallets + bet info)
- Manages game phases via GamePhaseManager
- Updates in real-time when blockchain changes

**CharacterPreview.ts** - Preview scene for UI

### Game Phase Manager

```typescript
enum GamePhase {
  IDLE = "idle",              // Show demo
  WAITING = "waiting",        // Accepting bets (30s)
  VRF_PENDING = "vrf_pending", // Waiting for Orao VRF result
  CELEBRATING = "celebrating", // Winner celebration (15s)
  FIGHTING = "fighting",      // Battle animations
  CLEANUP = "cleanup"         // Preparing for next game
}
```

**Logic**:
- When status=0 (open) → WAITING phase
- When countdown=0 → VRF_PENDING (waiting for end_game)
- When winner detected → CELEBRATING

### React Components

1. **Header.tsx** - Top navigation, balance display
2. **CharacterSelection.tsx** - Betting UI
   - Character selection dropdown
   - Bet amount input (0.01-10 SOL)
   - Skin selection
   - Position selection
   - Calls `useGameContract.placeBet()`
3. **MultiParticipantPanel.tsx** - Shows all participants
4. **BettingCountdown.tsx** - Waiting phase timer
5. **PlayerOnboarding.tsx** - Privy auth flow
6. **PrivyWalletButton.tsx** - Wallet connection
7. **ProfileDialog.tsx** - Player stats
8. **NFTCharacterModal.tsx** - NFT character unlock
9. **BlockchainDebugDialog.tsx** - Debug panel

### Hooks

**usePrivyWallet.ts**
- Manages Privy wallet connection
- Returns: connected, publicKey, solBalance, wallet

**useGameContract.ts** (29KB)
- `placeBet(amount, skin, position, map)` → sends transaction via Privy
- `validateBet(amount)` → checks bet validity
- Builds Anchor instructions manually (NOT using Program.methods)
- Signs/sends via Privy's `signAndSendAllTransactions()`
- Supports both create_game_round and bet instructions

**useActiveGame.ts**
- Subscribes to `active_game` PDA via `getSharedGameSubscription()`
- Real-time updates (<1s) vs API polling (45s)
- Returns blockchain game state + map lookup
- Transforms Solana PublicKey → base58 string

**useNFTCharacters.ts**
- Checks if user owns NFT collection for exclusive characters
- Calls `verifyNFTOwnership` server action

**useGameState.ts** - Legacy game state helper

---

## 4. ACTUAL GAME FLOW

### Simplified Single-Round Flow

```
┌──────────────────────┐
│   Demo Mode (20 bots)│ Runs continuously in DemoScene
│  No DB, No Blockchain│ Math.random() for all RNG
└──────────────────────┘
           ↓ [User clicks "Place Bet"]
┌──────────────────────────────────────┐
│ 1. User selects character + bet      │
│ 2. Frontend calls placeBet()          │
│ 3. Privy signs create_game_round     │ First bet = create game
│ 4. Transaction includes:             │
│    - round_id (auto-increment)       │
│    - bet_amount (SOL)               │
│    - skin (char ID)                 │
│    - position (spawn coords)        │
│    - map (background ID)            │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ Smart Contract: create_game_round    │
│ 1. Validate bet amount               │
│ 2. Create game account (PDA)         │
│ 3. Request Orao VRF seed            │
│ 4. Lock system (prevent new games)   │
│ 5. Transfer SOL to game vault        │
│ 6. Return: first bet stored          │
└──────────────────────────────────────┘
           ↓ [Demo stops, real game starts]
┌──────────────────────────────────────┐
│ WAITING PHASE (30 seconds)           │
│ - Other players can call bet()       │
│ - Each bet: skin + position          │
│ - Status = 0 (open)                 │
│ - Server syncs every 45s              │
│ - Frontend shows countdown           │
└──────────────────────────────────────┘
           ↓ [End time reached]
┌──────────────────────────────────────┐
│ gameScheduler.executeEndGame()       │
│ 1. Server scheduler triggers          │
│ 2. Calls smart contract end_game()   │
│ 3. Orao VRF used to select winner   │
│ 4. Status = 1 (closed)              │
│ 5. Winner stored in blockchain       │
└──────────────────────────────────────┘
           ↓ [Winner determined]
┌──────────────────────────────────────┐
│ CELEBRATING PHASE (15 seconds)       │
│ - Animations show winner             │
│ - Other participants explode         │
│ - Celebration particles              │
└──────────────────────────────────────┘
           ↓ [15s elapsed]
┌──────────────────────────────────────┐
│ gameScheduler.executeSendPrize()     │
│ 1. Calls smart contract send_prize   │
│ 2. Distributes SOL to winner         │
│ 3. Calculates prize (95% pool)       │
│ 4. House fee (5%) to treasury        │
└──────────────────────────────────────┘
           ↓ [Prize sent]
┌──────────────────────────────────────┐
│ CLEANUP PHASE                        │
│ 1. Fade out game                     │
│ 2. Return to demo mode               │
│ 3. DemoScene restarts locally        │
└──────────────────────────────────────┘
```

### Key Differences from CLAUDE.md

1. **No Top-4 Betting**: Only one winner selection (Orao VRF once)
2. **No Bank Bot**: Solo players still wait for real opponents or timeout
3. **No Spectator Phase**: No second round of betting
4. **Single Map**: Random between bg1/bg2, no complex selection
5. **No Participant Limits**: Just accepts bets until time limit
6. **Simple Payouts**: Winner takes 95%, house takes 5%

---

## 5. DEMO MODE DETAILS

### Configuration
```typescript
// demoTimings.ts
SPAWNING_PHASE_DURATION: 20_000,     // 20 seconds
BOT_SPAWN_MIN_INTERVAL: 200,         // ms between spawns (fast bursts)
BOT_SPAWN_MAX_INTERVAL: 3_000,       // ms between spawns (long pauses)
ARENA_PHASE_MIN_DURATION: 2_000,     // 2s minimum
ARENA_PHASE_MAX_DURATION: 3_000,     // 3s maximum
RESULTS_PHASE_DURATION: 15_000,      // 15s celebration

DEMO_PARTICIPANT_COUNT = 20  // Always 20 bots
```

### Bot Generation
```typescript
// demoGenerator.ts
function generateDemoParticipant(index, characters) {
  // Random name + index (e.g., "Shadow847", "Blaze123")
  // Random character from database
  // Random bet: 0.001-10 SOL (exponential distribution)
  // Random color hue (0-360)
  // Unique position from pre-calculated spawn points
}

// Spawn intervals cluster bots (some fast, some slow)
// Creates dramatic pauses between spawns
```

### Winner Selection
```typescript
function generateDemoWinner(participants) {
  // Weight by bet amount
  // Exponential curve: higher bets = higher win chance
  // Random selection based on weights
  // Return winning bot index
}
```

### Key Points
- **20 bots every time** (not configurable)
- **Random spawn timing** (creates tension)
- **No database** (100% client-side)
- **No blockchain** (no cost)
- **Math.random()** (reproducible but not verifiable)
- **3 phases always** (spawning → arena → results)
- **Auto-restart** (runs indefinitely until real game)

---

## 6. BETTING SYSTEM

### Bet Placement Flow

```typescript
// Frontend: useGameContract.ts
async function placeBet(amount: number, skin: number, position: [number, number], map: number) {
  1. Create instruction buffer (manually, not via Anchor)
  2. Create transaction
  3. Add fees (~5000 lamports per tx)
  4. Sign + Send via Privy.signAndSendAllTransactions()
  5. Wait for confirmation
  6. Return signature (base58)
}
```

### Bet Validation
```
Minimum: 0.01 SOL (10_000_000 lamports)
Maximum: 10 SOL (10_000_000_000 lamports)
Per-user limits:
  - Small bets (<0.01 SOL): max 20 bets
  - Large bets (≥0.01 SOL): max 30 bets
Per-game limits: Max 64 total bets (prevent account size explosion)
```

### Bet Data Storage
```
On-chain (smart contract):
  - betIndex: which bet in the bets array
  - amount: SOL in lamports
  - skin: character ID (0-255)
  - position: [x, y] spawn coordinates
  - walletIndex: which unique wallet placed bet

Off-chain (database):
  - Cached for faster queries
  - NO bet signatures stored (blockchain is source of truth)
  - NO off-chain betting
```

### Characters
```json
Available Characters (seed/characters.json):
{
  "id": 1,
  "name": "orc",
  "assetPath": "/characters/orc.png",
  "isActive": true
}
// IDs: 1 (orc), 3 (male), 4 (sam), 5 (warrior), 6 (pepe), 7 (darthvader), 8 (huggywuggy), 9 (yasuo)
// Some support NFT collections for exclusive unlock
```

### Maps
```json
{
  "id": 1,
  "name": "bg1",
  "spawnConfiguration": {
    "maxPlayers": 128,
    "spawnRadius": 200,
    "minSpacing": 40
  }
}
// Random selection between bg1 (ID=1) and bg2 (ID=2)
```

---

## 7. VRF INTEGRATION

### Current: ORAO VRF (Battle-Tested)

**Advantages**:
- Production-grade, used by major apps
- Solana-native (fast, reliable)
- No custom audit needed
- Proven randomness source

**Flow**:
1. `create_game_round()` → CPI call to ORAO request_v2
2. Game stores force seed (entropy input)
3. Orao generates randomness
4. Admin calls `end_game()` → reads Orao randomness account
5. Extract random bytes → weighted selection by bet
6. Winner determined on-chain

**Not Implemented**:
- The custom `domin8-vrf` program in CLAUDE.md
- Two-round VRF (top-4 then winner)
- VRF seed storage separate accounts
- Backend VRF requests from server

---

## 8. ACTUAL FEATURES VS DOCUMENTED

### EXISTS (As Described)
✅ Demo mode with 20 bots
✅ Client-side RNG (Math.random)
✅ Multiple characters
✅ Bet-to-size scaling (character size = f(bet amount))
✅ Real-time blockchain updates (<1s)
✅ Privy wallet integration
✅ On-chain bet escrow (non-custodial)
✅ Smart contract payouts
✅ NFT character unlock system
✅ Multiple maps/backgrounds
✅ Orao VRF randomness

### MISSING (In CLAUDE.md but NOT implemented)
❌ Bank bot (solo player opponent)
❌ Top-4 betting phase
❌ Spectator betting
❌ Long game format (7 phases)
❌ Custom VRF program (domin8-vrf)
❌ Two-round VRF selection
❌ Multiple game types based on participant count
❌ VRF seed accounts on-chain
❌ Blockchain call status tracking
❌ Game participant table (just stores on blockchain)
❌ Bet signature tracking in database

### DIFFERENT
⚠️ Game phases: 3 fixed (waiting → arena → results), not 3-7 variable
⚠️ VRF: Orao (external), not custom program
⚠️ Betting: Sequential (first bet = create), not parallel
⚠️ Winner selection: Once per game, not twice
⚠️ Sync interval: 45s, not 3s (game loop)
⚠️ Prize sending: Scheduled job, not automatic
⚠️ Participants: Stored on-chain only, not in database tables

---

## 9. ACTUAL GIT HISTORY (Last 10 Commits)

```
a4a984c fix: remove gamelobby
d86d4ac fix: update animations
16941f4 Merge pull request #15 from llPekoll/placeBet-optimisation
bd43ccf fix: update animations
1d4c009 fix: update animations
0eaaf3a fix: update animations
684f322 fix: update animations
bdce07b fix: update animations
7aebc4e fix: update animations
193a17f less width multi panel
```

**Recent focus**: Animation refinements, betting optimization, UI cleanup. No changes to game phases/features.

---

## 10. ENVIRONMENT & CONSTANTS

### Solana Program
```
Program ID: D8zxCM4tehr4Aux9zvonwCCYjV71WEgFnssWxgpgEEb7
Network: Devnet (per Anchor.toml)
Orao VRF: VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y
```

### Server Functions
```
Sync interval: 45 seconds (blockchain to DB)
Job cleanup: Every 6 hours
Blockchain clock buffer: 1 second
Max bets per game: 64 (account size limit)
```

### Bet Limits
```
Min bet: 0.01 SOL
Max bet: 10 SOL
Small bet (<0.01): Max 20 per user
Large bet (≥0.01): Max 30 per user
House fee: 5% (500 basis points)
```

### Demo Constants
```
Bot count: Always 20
Spawning phase: 20 seconds
Arena phase: 2-3 seconds (random)
Results phase: 15 seconds
Total cycle: ~37-38 seconds + restart
```

---

## 11. MISSING FEATURES IN CODE

These features are mentioned in CLAUDE.md but NOT in the actual code:

1. **Bank Balance Tracking** - No bankBalance table or cron
2. **Game Participants Table** - No gameParticipants table (just blockchain)
3. **NFT Collections Verification** - Hook exists but not integrated everywhere
4. **Transaction Queue** - No transactionQueue table
5. **Events System** - events.ts exists but mostly empty
6. **Player Stats** - achievements array exists but unused
7. **Bet Signature Tracking** - No txSignature in database (blockchain only)
8. **Multiple Participant Betting** - Can only bet once per game
9. **Spectator Mode** - No implementation
10. **Emergency Refund** - delete_game exists but no refund mechanism

---

## SUMMARY TABLE

| Feature | CLAUDE.md | Reality | Status |
|---------|-----------|---------|--------|
| VRF Type | Custom domin8-vrf | Orao VRF | Different |
| Game Phases | 3-7 variable | 3 fixed | Simpler |
| Top-4 Betting | Yes | No | Missing |
| Bank Bot | Yes | No | Missing |
| Demo Bots | 20 (yes) | 20 (yes) | Correct |
| Smart Contract | 11 instructions | 6 instructions | Fewer |
| DB Tables | 6 game-related | 3 game-related | Simpler |
| Winner Selection | Once or twice | Once | Simpler |
| Bet Storage | On + Off chain | On-chain only | Different |
| Sync Interval | 3s + 45s | 45s | Slower |

---

## FILES TO UPDATE IN CLAUDE.md

1. **Smart Contract Structure** → Describe domin8_prgm only (6 instructions)
2. **Game Flow** → Simplify to single-round 3-phase system
3. **VRF Integration** → Explain Orao VRF, remove custom program
4. **Database Schema** → Remove gameParticipants, bankBalance, transactions
5. **Game Types** → Remove top-4 betting, bank bot, spectator phases
6. **Architecture Summary** → Update to reflect actual flows
7. **Tech Stack** → Confirm all components (Phaser, API server, Anchor, Privy are correct)
8. **Features** → Mark bank bot, top-4, spectator as NOT implemented

