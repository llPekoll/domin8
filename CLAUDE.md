# Domin8 - Solana Battle Game

## Project Overview

A fast-paced battle royale betting game on Solana where players bet on themselves in real-time battles. Built with Convex, React, Phaser.js, and Solana blockchain integration using Orao VRF for verifiable randomness.

## Tech Stack

- **Runtime**: Bun (not npm)
- **Backend**: Convex (real-time serverless)
- **Frontend**: React + TypeScript + Vite
- **Game Engine**: Phaser.js (WebGL/Canvas)
- **Blockchain**: Solana (Anchor framework)
- **VRF Provider**: Orao VRF (production-grade verifiable randomness)
- **Wallet**: Privy (embedded wallets, seamless auth)
- **Styling**: Tailwind CSS
- **State**: Convex React hooks

## Commands

### Frontend/Backend

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build
```

### Smart Contract (Anchor)

```bash
# Build the smart contract
anchor build

# Run tests (starts local validator, deploys, runs tests)
anchor test

# Deploy to devnet (requires SOL in wallet)
anchor deploy --provider.cluster devnet

# Deploy to localnet (for testing)
anchor deploy
```

## Project Structure

```
/
├── convex/                    # Backend functions and schema
│   ├── syncService.ts         # Blockchain sync (every 45s)
│   ├── gameScheduler.ts       # Execute smart contract calls
│   ├── gameSchedulerMutations.ts  # Job tracking
│   ├── syncServiceMutations.ts    # DB writes for sync
│   ├── players.ts             # Player CRUD operations
│   ├── characters.ts          # Character management
│   ├── maps.ts                # Map management
│   ├── schema.ts              # Database schema
│   └── crons.ts               # Scheduled functions
├── programs/
│   ├── domin8_prgm/           # Main game smart contract
│   │   ├── src/
│   │   │   ├── lib.rs         # Program entry (6 instructions)
│   │   │   ├── state/
│   │   │   │   ├── domin8_game.rs    # Game account structure
│   │   │   │   └── domin8_config.rs  # Global config
│   │   │   ├── instructions/  # 6 instruction handlers
│   │   │   │   ├── initialize_config.rs
│   │   │   │   ├── create_game_round.rs (first bet + VRF request)
│   │   │   │   ├── bet.rs (additional bets)
│   │   │   │   ├── end_game.rs (winner selection via Orao VRF)
│   │   │   │   ├── send_prize_winner.rs (payout)
│   │   │   │   └── delete_game.rs (admin cleanup)
│   │   │   ├── constants.rs   # Bet limits, fees
│   │   │   ├── error.rs       # 26+ error codes
│   │   │   └── utils.rs       # Helper functions
│   │   └── Cargo.toml
│   └── domin8_prgm.backup/    # Old version (10 instructions, mock VRF)
├── src/
│   ├── game/                  # Phaser game engine
│   │   ├── scenes/
│   │   │   ├── Boot.ts        # Initialization
│   │   │   ├── Preloader.ts   # Asset loading
│   │   │   ├── DemoScene.ts   # Client-side 20-bot demo
│   │   │   ├── Game.ts        # Real game (blockchain-synced)
│   │   │   └── CharacterPreview.ts
│   │   ├── managers/
│   │   │   ├── GamePhaseManager.ts      # Phase state machine
│   │   │   └── AnimationManager.ts      # Explosion effects
│   │   └── config.ts          # Phaser configuration
│   ├── components/            # React UI components
│   │   ├── CharacterSelection.tsx       # Betting UI
│   │   ├── MultiParticipantPanel.tsx    # Participant list
│   │   ├── BettingCountdown.tsx         # Timer
│   │   └── BlockchainDebugDialog.tsx    # Debug panel
│   └── hooks/
│       ├── usePrivyWallet.ts            # Privy integration
│       ├── useGameContract.ts           # Smart contract calls
│       ├── useActiveGame.ts             # Real-time blockchain updates
│       └── useNFTCharacters.ts          # NFT verification
└── public/
    └── assets/                # Game assets
        ├── characters/        # Character sprites
        └── backgrounds/       # Map backgrounds
```

## Key Features

### Game Mechanics

#### Game Modes

The platform has two distinct modes:

##### Demo Mode (Client-Side Only)

- **Local Execution**: Runs entirely in user's browser (Phaser.js)
- **20 Bots**: Fixed bot count for demo games
- **Client-Generated**: Each user sees their own independent demo
- **Randomness**: Uses Math.random() locally, no blockchain/backend calls
- **Purpose**: Showcase gameplay, attract new players, zero cost
- **Instant Start**: No waiting for server, loads immediately
- **Phases**: Spawning (20s) → Arena (2-3s) → Results (15s) → Auto-restart
- **No Database**: 100% client-side, no records stored

##### Real Game Mode

Triggered when **first player places a bet**:

1. **Game Creation**: First bet calls `create_game_round` instruction
2. **Demo Stops**: Client-side demo stops in user's browser
3. **VRF Request**: Smart contract requests Orao VRF randomness
4. **Waiting Phase**: 30-second countdown for other players
5. **Additional Bets**: Other players call `bet` instruction
6. **Game End**: Backend calls `end_game` after countdown
7. **Winner Selection**: Orao VRF determines winner (weighted by bet amounts)
8. **Settlement**: Backend calls `send_prize_winner` for payout
9. **Return to Demo**: All clients return to local client-side demo

#### Game Flow (Single Round)

All real games follow the same **3-phase structure**:

1. **WAITING PHASE** (30 seconds)
   - First bet creates game via `create_game_round`
   - Additional players join via `bet` instruction
   - Game status = 0 (open)
   - Each bet includes: amount, skin (character), position (spawn coords)

2. **ARENA PHASE** (Variable duration)
   - Countdown reaches zero
   - Backend calls `end_game` instruction
   - Orao VRF provides randomness
   - Winner selected on-chain (weighted by bet amounts)
   - Game status = 1 (closed)
   - Frontend shows battle animations

3. **RESULTS PHASE** (15 seconds)
   - Winner celebration animations
   - Eliminated participants explode
   - Backend calls `send_prize_winner`
   - 95% pool to winner, 5% house fee
   - Return to demo mode

#### Core Features

- **Client-Side Demo**: Each user runs their own demo locally, zero server cost
- **Single Global Real Game**: One blockchain-synced game for all real players
- **Demo-to-Real Transition**: Client demo stops, real game starts on first bet
- **Multiple Maps**: Random selection between bg1 and bg2 backgrounds
- **Character System**: 8 characters available (some NFT-gated)
- **Bet-to-size**: Character size scales with bet amount
- **Real-time Updates**: Blockchain state synced to clients in <1 second
- **Server-side Settlement**: Convex schedules smart contract calls
- **No Demo Backend**: Demo runs purely in browser, no database records
- **Orao VRF**: Production-grade verifiable randomness from Solana

### Betting System

- **Self-Betting Only**: Players bet on themselves during waiting phase
- **One Bet Per Game**: Each player can place one bet per game round
- **Currency**: Native SOL (no conversion, direct betting)
- **Betting Limits**:
  - Minimum: 0.001 SOL (hardcoded constant)
  - Maximum: Configurable (set by admin in `initialize_config`)
  - Recommended: 0.01 SOL min, 10 SOL max
- **Embedded Wallets**: Privy manages user wallets seamlessly
- **Smart Contract Escrow**: All bets locked in on-chain program (non-custodial)
- **Pool Distribution**: 95% to winner, 5% house fee
- **Trustless**: Funds secured by smart contract, automatic payouts

### Technical Features

- **Real-time**: Blockchain updates in <1 second via WebSocket subscriptions
- **Type-safe**: End-to-end TypeScript
- **Responsive**: Mobile and desktop support
- **Scalable**: Serverless architecture (Convex)
- **Non-custodial**: Smart contract holds funds, not backend
- **Seamless Auth**: Privy embedded wallets (email/social login)
- **Signless UX**: Privy handles transaction signing smoothly
- **Verifiable**: Orao VRF randomness on-chain

## Smart Contract Architecture

### Program: domin8_prgm

**Program ID**: `D8zxCM4tehr4Aux9zvonwCCYjV71WEgFnssWxgpgEEb7` (Devnet)

### Instructions (6 total)

1. **initialize_config** - Admin-only setup
   - Sets: treasury wallet, house fee, min/max bet amounts, round time
   - Creates global config account (PDA)

2. **create_game_round** - First bet creates game
   - Transfers SOL from player to game vault
   - Requests Orao VRF randomness
   - Locks system (prevents concurrent games)
   - Stores first bet with skin + position

3. **bet** - Additional players join
   - Transfers SOL to game vault
   - Adds bet to game with skin + position
   - Checks bet limits (amount, per-user count)

4. **end_game** - Winner selection
   - Reads Orao VRF randomness
   - Weighted selection by bet amounts
   - Closes game (status = 1)
   - Stores winner + prize amount

5. **send_prize_winner** - Payout distribution
   - Transfers 95% pool to winner
   - Transfers 5% fee to treasury
   - Marks prize as sent

6. **delete_game** - Admin cleanup
   - Removes old game accounts
   - Frees up storage

### Game State Structure

```rust
pub struct Domin8Game {
    pub game_round: u64,          // Increments each game
    pub start_date: i64,          // Unix timestamp
    pub end_date: i64,            // Unix timestamp
    pub total_deposit: u64,       // Total pool in lamports
    pub rand: u64,                // VRF randomness (unused, legacy)
    pub map: u8,                  // Background ID (0-255)
    pub user_count: u64,          // Unique players
    pub force: [u8; 32],          // VRF force seed (entropy)
    pub status: u8,               // 0 = open, 1 = closed
    pub winner: Option<Pubkey>,   // Winner wallet
    pub winner_prize: u64,        // Prize amount
    pub winning_bet_index: Option<u64>, // Which bet won
    pub wallets: Vec<Pubkey>,     // Unique wallets (deduplicated)
    pub bets: Vec<BetInfo>,       // All bets with details
}

pub struct BetInfo {
    pub wallet_index: u16,        // Index into wallets Vec
    pub amount: u64,              // Bet in lamports
    pub skin: u8,                 // Character ID (0-255)
    pub position: [u16; 2],       // [x, y] spawn coordinates
}
```

### Bet Limits & Constants

```rust
// Minimum bet (hardcoded)
MIN_DEPOSIT_AMOUNT = 1_000_000 lamports (0.001 SOL)

// Maximum bet (configurable, no hardcoded limit)
// Set during initialize_config by admin

// House fee cap
MAX_HOUSE_FEE = 1000 basis points (10%)

// Anti-spam limits
MAX_BETS_PER_GAME = 1000 total bets
MAX_BETS_PER_USER_SMALL = 20 (for bets < 0.01 SOL)
MAX_BETS_PER_USER_LARGE = 30 (for bets >= 0.01 SOL)
SMALL_BET_THRESHOLD = 10_000_000 lamports (0.01 SOL)

// Timing
MIN_ROUND_TIME = 10 seconds
MAX_ROUND_TIME = 86400 seconds (24 hours)
```

## Database Schema (Convex)

### Core Tables

**gameRoundStates** - Real game state cache
- `roundId`: number (from blockchain)
- `status`: "waiting" | "finished"
- `startTimestamp`: number
- `endTimestamp`: number
- `capturedAt`: number (sync timestamp)
- `mapId`: number
- `betCount`: number
- `betAmounts`: number[]
- `betSkin`: number[]
- `betPosition`: [number, number][]
- `totalPot`: number
- `winner`: string | null (wallet address)
- `winningBetIndex`: number
- `prizeSent`: boolean

**scheduledJobs** - Backend task tracking
- `jobId`: string
- `roundId`: number
- `action`: "end_game" | "send_prize"
- `scheduledTime`: number
- `status`: "pending" | "completed" | "failed"
- `createdAt`: number

**players** - Player profiles
- `walletAddress`: string (primary key)
- `externalWalletAddress`: string (optional)
- `displayName`: string (optional)
- `lastActive`: number
- `totalGamesPlayed`: number
- `totalWins`: number
- `achievements`: string[]

**characters** - Character definitions
- `name`: string
- `id`: number
- `assetPath`: string (e.g., "/characters/orc.png")
- `description`: string
- `nftCollection`: string (optional, for exclusive characters)
- `isActive`: boolean

**maps** - Arena configurations
- `name`: string
- `id`: number
- `description`: string
- `spawnConfiguration`: { maxPlayers, spawnRadius, minSpacing }
- `isActive`: boolean

### Available Characters

From `seed/characters.json`:
- ID 1: orc
- ID 3: male
- ID 4: sam
- ID 5: warrior
- ID 6: pepe
- ID 7: darthvader
- ID 8: huggywuggy
- ID 9: yasuo

### Available Maps

From `seed/maps.json`:
- ID 1: bg1 (128 max players, 200px spawn radius)
- ID 2: bg2 (128 max players, 200px spawn radius)

## Convex Backend

### Scheduled Functions (Crons)

```typescript
// Every 45 seconds - sync blockchain state to Convex
crons.interval("sync-blockchain-state", { seconds: 45 },
  internal.syncService.syncBlockchainState
);

// Every 6 hours - cleanup old scheduled jobs
crons.interval("cleanup-old-scheduled-jobs", { hours: 6 },
  internal.gameSchedulerMutations.cleanupOldJobs
);
```

### Key Functions

**syncService.ts**
- `syncBlockchainState()` - Main cron: reads active_game PDA, syncs to DB
- `syncActiveGame()` - Stores game state in gameRoundStates table
- `processEndedGames()` - Detects when countdown expires
- `scheduleEndGameAction()` - Creates scheduled job for end_game

**gameScheduler.ts**
- `executeEndGame()` - Calls smart contract end_game instruction
- `executeSendPrize()` - Calls smart contract send_prize_winner instruction

**gameSchedulerMutations.ts**
- Job tracking (prevent duplicates)
- Status updates (pending → completed/failed)
- Cleanup old jobs (older than 24 hours)

### Real-time Features

- Blockchain updates synced every 45 seconds
- Frontend subscribes to `active_game` PDA directly (<1s updates)
- Automatic UI updates via Convex hooks
- Optimistic updates with rollback

## VRF Integration (Orao)

### Orao VRF Overview

**Provider**: Orao Network (production-grade Solana VRF)
**Program ID**: `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`

### VRF Flow

1. **Request** (create_game_round)
   - Smart contract calls Orao VRF `request_v2` via CPI
   - Force seed (32 bytes) provided for entropy
   - Orao generates verifiable randomness (~1-3 seconds)

2. **Fulfillment** (automatic)
   - Orao VRF stores randomness in on-chain account
   - Randomness account PDA derived from force seed

3. **Consumption** (end_game)
   - Backend calls `end_game` instruction
   - Smart contract reads Orao randomness account
   - Extracts random bytes for winner selection
   - Weighted selection: higher bets = higher win chance

4. **Verification**
   - Anyone can verify randomness on-chain
   - Orao provides cryptographic proofs
   - Reproducible: same seed + bets = same winner

### Why Orao VRF?

- **Production-Grade**: Battle-tested, used by major Solana dapps
- **No Custom Audit**: Saves $10-50k in audit costs
- **Fast**: 1-3 second randomness generation
- **Verifiable**: Cryptographic proofs on-chain
- **Reliable**: No custom implementation bugs

### Winner Selection Algorithm

```rust
// Pseudo-code (implemented in smart contract)
1. Read Orao VRF randomness (32 bytes)
2. Convert to u64 random number
3. Calculate total pool (sum of all bet amounts)
4. Random point = random_number % total_pool
5. Iterate through bets, accumulate weights
6. Winner = first bet where cumulative >= random_point
```

**Example**:
- Bet 1: 1 SOL (weight: 1)
- Bet 2: 3 SOL (weight: 3)
- Bet 3: 1 SOL (weight: 1)
- Total: 5 SOL
- Random point: 3.7
- Cumulative: 0→1 (Bet 1), 1→4 (Bet 2), 4→5 (Bet 3)
- Winner: Bet 2 (because 3.7 falls in range 1-4)

## Frontend Architecture

### Game Phases (GamePhaseManager)

```typescript
enum GamePhase {
  IDLE = "idle",              // Show demo
  WAITING = "waiting",        // Accepting bets (30s)
  VRF_PENDING = "vrf_pending", // Waiting for end_game
  CELEBRATING = "celebrating", // Winner celebration (15s)
  FIGHTING = "fighting",      // Battle animations
  CLEANUP = "cleanup"         // Preparing for next game
}
```

### Demo Mode Details

**Configuration** (`demoTimings.ts`):
```typescript
SPAWNING_PHASE_DURATION: 20_000ms      // 20 seconds
BOT_SPAWN_MIN_INTERVAL: 200ms          // Fast bursts
BOT_SPAWN_MAX_INTERVAL: 3_000ms        // Long pauses
ARENA_PHASE_MIN_DURATION: 2_000ms      // 2s minimum
ARENA_PHASE_MAX_DURATION: 3_000ms      // 3s maximum
RESULTS_PHASE_DURATION: 15_000ms       // 15s celebration
DEMO_PARTICIPANT_COUNT: 20             // Always 20 bots
```

**Bot Generation**:
- Random names (e.g., "Shadow847", "Blaze123")
- Random characters from database
- Random bet amounts: 0.001-10 SOL (exponential distribution)
- Random color hues (0-360)
- Unique spawn positions from pre-calculated grid

**Winner Selection**:
- Weighted by bet amount (same algorithm as real games)
- Uses Math.random() (not verifiable, demo only)

### Key React Hooks

**usePrivyWallet.ts**
- Manages Privy wallet connection
- Returns: `connected`, `publicKey`, `solBalance`, `wallet`

**useGameContract.ts**
- `placeBet(amount, skin, position, map)` - Send bet transaction
- `validateBet(amount)` - Check bet validity
- Builds Anchor instructions manually
- Signs via Privy's `signAndSendAllTransactions()`
- Supports both `create_game_round` and `bet` instructions

**useActiveGame.ts**
- Subscribes to `active_game` PDA via WebSocket
- Real-time updates (<1s latency)
- Returns blockchain game state + map lookup
- Transforms Solana PublicKey → base58 string

**useNFTCharacters.ts**
- Checks NFT ownership for exclusive characters
- Calls `verifyNFTOwnership` Convex action

## Game Flow Diagram

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
│    - bet_amount (SOL)                │
│    - skin (char ID)                  │
│    - position (spawn coords)         │
│    - map (background ID)             │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ Smart Contract: create_game_round    │
│ 1. Validate bet amount               │
│ 2. Create game account (PDA)         │
│ 3. Request Orao VRF seed             │
│ 4. Lock system (prevent new games)   │
│ 5. Transfer SOL to game vault        │
│ 6. Return: first bet stored          │
└──────────────────────────────────────┘
           ↓ [Demo stops, real game starts]
┌──────────────────────────────────────┐
│ WAITING PHASE (30 seconds)           │
│ - Other players call bet()           │
│ - Each bet: skin + position          │
│ - Status = 0 (open)                  │
│ - Convex syncs every 45s             │
│ - Frontend shows countdown           │
└──────────────────────────────────────┘
           ↓ [End time reached]
┌──────────────────────────────────────┐
│ gameScheduler.executeEndGame()       │
│ 1. Convex scheduler triggers         │
│ 2. Calls smart contract end_game()   │
│ 3. Orao VRF used to select winner    │
│ 4. Status = 1 (closed)               │
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

## Cost Analysis

### Demo Games
- **Total Cost**: $0 (free)
- **Breakdown**: No blockchain transactions, pure client-side

### Real Games

**Per Game Costs** (Backend pays):
- Create game: ~0.000005 SOL
- Lock game: ~0.000005 SOL
- Orao VRF request: ~0.0001 SOL
- End game: ~0.000005 SOL
- Send prize: ~0.000005 SOL
- **Total Backend Cost**: ~0.00012 SOL (~$0.025 at $200/SOL)

**Per Player Costs** (User pays):
- Bet transaction: ~0.000005 SOL (~$0.001)

**Economic Model**:
- House edge: 5% of pool
- Example: 10 SOL pool = 0.5 SOL house fee (~$100)
- Backend cost: ~$0.025
- Net profit: ~$99.975 per game
- Scalability: Costs stay flat, revenue scales with pool size

## Environment Variables

```env
# Convex Backend
CONVEX_DEPLOYMENT=

# Solana
SOLANA_RPC_URL=
VITE_SOLANA_NETWORK=devnet                      # Client-side (Vite exposes VITE_*)
GAME_PROGRAM_ID=D8zxCM4tehr4Aux9zvonwCCYjV71WEgFnssWxgpgEEb7
ORAO_VRF_PROGRAM_ID=VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y
BACKEND_WALLET_SECRET=                          # For settlements

# Privy
VITE_PRIVY_APP_ID=                              # Client-side (exposed to browser)
PRIVY_APP_SECRET=                               # Backend-only (Convex uses this)

# Note: Vite only exposes variables prefixed with VITE_ to the browser
# All other variables are only accessible server-side in Convex
```

## Security

- Never commit secrets or private keys
- Use environment variables for sensitive data
- Validate all user inputs on-chain
- Smart contract enforces all game rules
- Non-custodial: Backend cannot access player funds
- Verifiable: Orao VRF provides cryptographic proofs

## Resources

- [Convex Docs](https://docs.convex.dev/)
- [Phaser.js Docs](https://phaser.io/docs)
- [Solana Cookbook](https://solanacookbook.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Orao VRF Docs](https://docs.orao.network/)
- [Privy Docs](https://docs.privy.io/)
- [Bun Documentation](https://bun.sh/docs)

---

## Architecture Summary

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     USER EXPERIENCE                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Login with email/social (Privy)                          │
│ 2. Watch demo game (20 bots, entertaining)                  │
│ 3. Click "Bet 0.5 SOL" → Privy signs seamlessly             │
│ 4. Wait 30s for other players                               │
│ 5. Watch game play (Phaser animations)                      │
│ 6. Winner announced → SOL arrives in wallet                 │
│ 7. Return to demo mode                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  TECHNOLOGY LAYERS                           │
├─────────────────────────────────────────────────────────────┤
│ Frontend (React + Vite + Phaser)                            │
│   - Privy for auth + embedded wallets                       │
│   - Real-time blockchain updates (<1s via WebSocket)        │
│   - 60fps animations on canvas                              │
├─────────────────────────────────────────────────────────────┤
│ Backend (Convex Serverless)                                 │
│   - Blockchain sync (45s intervals)                         │
│   - Scheduled jobs (end_game, send_prize)                   │
│   - Player/character/map management                         │
├─────────────────────────────────────────────────────────────┤
│ Blockchain (Solana)                                         │
│   - domin8_prgm: Bet escrow (6 instructions)                │
│   - Orao VRF: Verifiable randomness                         │
│   - All bets locked in smart contracts                      │
│   - Non-custodial, trustless, transparent                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Hybrid On/Off-Chain**
- ✅ Bets: On-chain (trustless escrow)
- ✅ VRF: On-chain (Orao VRF, verifiable randomness)
- ✅ Game Logic: Off-chain (fast, flexible)
- ✅ Animations: Off-chain (smooth, no blockchain lag)

**2. Single Global Game**
- One game instance for entire platform
- Creates urgency and social dynamics
- Simpler architecture than parallel games
- Demo always running when no real players

**3. Direct SOL (No Tokens)**
- Users bet real SOL, not internal currency
- Clearer value proposition
- Less code complexity
- No conversion confusion

**4. Privy for Wallets**
- Email/social login (no crypto knowledge required)
- Embedded wallets (seamless transaction signing)
- Users control keys (can export)
- 1-2 second bet confirmations

**5. Orao VRF (Not Custom)**
- Production-grade randomness provider
- No audit costs ($10-50k savings)
- Battle-tested, reliable
- Cryptographic verification built-in

**6. Smart Contract Escrow**
- Non-custodial (backend can't steal)
- Transparent (all bets on-chain)
- Verifiable (Orao VRF proofs public)
- Marketing advantage (provably fair)

---

## Notes

### What's Implemented
✅ Demo mode with 20 bots (client-side only)
✅ Real game mode (blockchain-synced)
✅ Orao VRF integration (production-grade)
✅ 6-instruction smart contract (optimized)
✅ Privy wallet integration (seamless UX)
✅ Real-time blockchain updates (<1s)
✅ 8 characters (some NFT-gated)
✅ 2 maps (bg1, bg2)
✅ Bet-to-size scaling
✅ Smart explosion effects (winner stays)
✅ Non-custodial escrow
✅ 95/5 prize distribution

### Not Implemented
❌ Bank bot (solo player opponent)
❌ Top-4 betting phase
❌ Spectator betting
❌ Multi-phase variable games
❌ Custom VRF program
❌ Multiple bets per player per game

### Simplified vs Original Design
The actual codebase is **simpler and more elegant** than originally documented:
- Single-round games (not variable 3-7 phases)
- One VRF call per game (not two)
- Self-betting only (no spectator phase)
- Orao VRF (not custom implementation)
- Fixed 3 phases (waiting → arena → results)

This simplification makes the game:
- Easier to understand
- Faster to play
- Cheaper to run
- More reliable (fewer edge cases)
- Still provably fair (Orao VRF)
