# Domin8 - Solana Battle Game

## Project Overview

A fast-paced battle royale betting game on Solana where players bet on themselves in real-time battles. Built with a Socket.io API server, PostgreSQL, React, Phaser.js, and Solana blockchain integration using Magic Block VRF for verifiable randomness.

## Tech Stack

- **Runtime**: Bun (not npm)
- **Backend**: Socket.io API server + PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **Game Engine**: Phaser.js (WebGL/Canvas)
- **Blockchain**: Solana (Anchor framework)
- **VRF Provider**: Magic Block VRF (ephemeral rollup, cost-optimized)
- **Wallet**: Privy (embedded wallets, seamless auth)
- **Styling**: Tailwind CSS
- **State**: Socket.io real-time events
- **Events**: Helius webhooks for blockchain updates
- **Deployment**: Coolify (frontend via Nixpacks, API via Dockerfile)

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
├── server/                    # Socket.io API server (Node.js)
│   ├── Dockerfile             # Production container
│   ├── src/                   # Server source code
│   └── package.json           # Server dependencies
├── programs/
│   └── domin8_prgm/           # Main game smart contract
│       ├── src/
│       │   ├── lib.rs         # Program entry (7 instructions)
│       │   ├── state/
│       │   │   ├── domin8_game.rs    # Game account structure
│       │   │   └── domin8_config.rs  # Global config
│       │   ├── instructions/  # 7 instruction handlers
│       │   │   ├── initialize_config.rs
│       │   │   ├── create_game_round.rs (no bets, no VRF)
│       │   │   ├── bet.rs (places bets, no VRF)
│       │   │   ├── vrf_callback.rs (Magic Block callback)
│       │   │   ├── end_game.rs (VRF request + winner selection)
│       │   │   ├── send_prize_winner.rs (payout)
│       │   │   └── delete_game.rs (admin cleanup)
│       │   ├── constants.rs   # Bet limits, fees
│       │   ├── error.rs       # Error codes
│       │   └── utils.rs       # Helper functions
│       └── Cargo.toml
├── src/
│   ├── game/                  # Phaser game engine
│   │   ├── scenes/
│   │   │   ├── Boot.ts        # Initialization
│   │   │   ├── Preloader.ts   # Asset loading
│   │   │   ├── Game.ts        # Main game (blockchain-synced)
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
│       └── useNFTCharacters.ts          # NFT verification
└── public/
    └── assets/                # Game assets
        ├── characters/        # Character sprites
        └── backgrounds/       # Map backgrounds
```

## Key Features

### Game Mechanics

#### Waiting State (Map Carousel)

When no game is active, players see a **map carousel**:
- **Spinning Carousel**: Maps rotate visually while waiting
- **Map Selection**: Carousel stops on the selected map for next game
- **Call to Action**: Players can place bets to start a game
- **Engaging UX**: Keeps players engaged while waiting

#### Game Flow

**Triggered by API server creating a game:**

1. **Game Creation**: API server calls `create_game_round` instruction
   - Game status = **WAITING** (no bets yet)
   - **NO countdown** (start_date = 0, end_date = 0)
   - **NO VRF requested** (cost optimization!)
   - Lock system to prevent concurrent games
   - Map selected (carousel stops)

2. **First Player Bets**: User calls `bet` instruction
   - Status changes: **WAITING → OPEN**
   - **Countdown STARTS**: end_date = now + round_time (e.g., 60s)
   - Adds first bet (SOL transferred to game vault)
   - **NO VRF requested** (VRF is deferred to end_game)

3. **Additional Players Bet**: More users call `bet` instruction
   - Adds more bets (SOL transferred)
   - **NO VRF requested yet** (deferred to end_game)

4. **Countdown Expires**: API server calls `end_game` (first call)
   - **Single player**: Uses deterministic seed, returns winner immediately
   - **Multiple players**: Requests Magic Block VRF, returns early
   - Sets `vrf_requested = true`

5. **VRF Callback**: Magic Block VRF calls `vrf_callback`
   - Stores randomness in `game.rand`
   - Executed within seconds

6. **API server calls `end_game` again** (second call, ~3s later)
   - Uses stored VRF randomness to select winner
   - Game status = CLOSED
   - **Multiple players**: 5% house fee

7. **Prize Distribution**: API server calls `send_prize_winner`
   - 95% to winner (or 100% for single player refund)
   - 5% to treasury (multi-player only)

8. **Return to Carousel**: All clients return to map carousel

#### Game Flow Summary

All games follow this **optimized flow**:

1. **WAITING** (Map Carousel)
   - Carousel spins, showing available maps
   - Players can place bets anytime
   - API server creates game when ready

2. **GAME CREATION** (API server creates game)
   - Status = WAITING
   - No bets, no countdown, no VRF
   - Carousel stops on selected map

3. **FIRST BET** (countdown starts)
   - Status: WAITING → OPEN
   - start_date = now, end_date = now + 60s
   - First bet stored, NO VRF request

4. **BETTING PHASE** (up to 60 seconds)
   - More players can join via `bet` instruction
   - Each bet includes: amount, skin (character), position (spawn coords)
   - NO VRF requested during betting (deferred to end_game)

5. **GAME END - FIRST CALL** (API server calls end_game)
   - **Single player**: Deterministic seed, winner selected immediately
   - **Multi-player**: VRF requested, returns early with "call again in 3s"
   - Sets `vrf_requested = true` for multi-player

6. **VRF CALLBACK** (Magic Block responds)
   - `vrf_callback` instruction called automatically
   - Stores randomness in `game.rand`

7. **GAME END - SECOND CALL** (API server calls end_game again)
   - Uses stored VRF randomness
   - Weighted selection: bigger bet = higher chance
   - Game status = CLOSED
   - Winner determined, prize calculated

8. **PRIZE DISTRIBUTION** (API server calls send_prize_winner)
   - Winner receives 95% (or 100% if solo)
   - Treasury receives 5% (multi-player only)

9. **RETURN TO CAROUSEL**
   - System unlocked
   - Carousel resumes spinning
   - Ready for next game

#### Core Features

- **Map Carousel**: Engaging spinning carousel while waiting for games
- **Server-Managed Games**: Backend creates games, players place bets
- **VRF Cost Optimization**: VRF only requested in end_game for multi-player games
- **Single Player Refunds**: Full refund with 0% fee if only 1 player
- **Multiple Maps**: Carousel displays available maps (bg1, bg2)
- **Character System**: 8 characters available (some NFT-gated)
- **Bet-to-size**: Character size scales with bet amount
- **Helius Webhooks**: Blockchain events → API server → Frontend via WebSocket
- **Magic Block VRF**: Cheap, fast verifiable randomness

### Betting System

- **Self-Betting Only**: Players bet on themselves during waiting phase
- **Multiple Bets Per Player**: Limits based on bet size (20-30 bets max)
- **Currency**: Native SOL (no conversion, direct betting)
- **Betting Limits**:
  - Minimum: 0.001 SOL (hardcoded constant)
  - Maximum: Configurable (set by admin in `initialize_config`)
  - Recommended: 0.01 SOL min, 10 SOL max
- **Embedded Wallets**: Privy manages user wallets seamlessly
- **Smart Contract Escrow**: All bets locked in on-chain program (non-custodial)
- **Pool Distribution**:
  - **Multi-player**: 95% to winner, 5% house fee
  - **Single player**: 100% refund, 0% house fee
- **Trustless**: Funds secured by smart contract, automatic payouts

### Technical Features

- **Events-Based Sync**: Helius webhooks → API server → Frontend
- **Type-safe**: End-to-end TypeScript
- **Responsive**: Mobile and desktop support
- **Scalable**: Socket.io API server + PostgreSQL
- **Non-custodial**: Smart contract holds funds, not backend
- **Seamless Auth**: Privy embedded wallets (email/social login)
- **Signless UX**: Privy handles transaction signing smoothly
- **Verifiable**: Magic Block VRF randomness on-chain

## Smart Contract Architecture

### Program: domin8_prgm

**Program ID**: `7bHYHZVu7kWRU4xf7DWypCvefWvuDqW1CqVfsuwdGiR7` (Devnet)

### Instructions (7 total)

1. **initialize_config** - Admin-only setup
   - Sets: treasury wallet, house fee, min/max bet amounts, round time
   - Creates global config account (PDA)
   - **NO active_game PDA created** (removed for simplification)

2. **create_game_round** - API server creates game
   - **NO bets placed** (just initializes game)
   - **NO VRF request** (deferred to end_game)
   - **NO countdown** (starts on first bet)
   - Game status = WAITING
   - Locks system (prevents concurrent games)

3. **bet** - Players place bets
   - **First bet**: Starts countdown (status: WAITING → OPEN)
   - Transfers SOL to game vault
   - Adds bet with skin + position
   - Checks bet limits (amount, per-user count)
   - **NO VRF request** (VRF is deferred to end_game)

4. **vrf_callback** - Magic Block VRF callback
   - Called automatically by Magic Block VRF after end_game requests it
   - Stores randomness in `game.rand`
   - Executed within seconds of VRF request

5. **end_game** - VRF request + Winner selection
   - **Single player**: Uses deterministic seed, completes immediately
   - **Multiple players (first call)**: Requests Magic Block VRF, returns early
   - **Multiple players (second call)**: Uses stored VRF randomness
   - Weighted selection by bet amounts
   - Closes game (status = CLOSED)
   - Stores winner + prize amount
   - **Single player**: 0% house fee (full refund)
   - **Multiple players**: 5% house fee

6. **send_prize_winner** - Payout distribution
   - Transfers prize to winner (95% or 100%)
   - Transfers house fee to treasury (5% or 0%)
   - Marks prize as sent

7. **delete_game** - Admin cleanup
   - Removes old game accounts
   - Frees up storage

### Game State Structure

```rust
pub struct Domin8Game {
    pub game_round: u64,          // Increments each game
    pub start_date: i64,          // Unix timestamp (set on first bet)
    pub end_date: i64,            // Unix timestamp (set on first bet)
    pub total_deposit: u64,       // Total pool in lamports
    pub rand: u64,                // VRF randomness (from callback)
    pub map: u8,                  // Background ID (0-255)
    pub user_count: u64,          // Unique players
    pub force: [u8; 32],          // VRF force seed (entropy)
    pub status: u8,               // 0 = waiting, 1 = open, 2 = closed
    pub vrf_requested: bool,      // True if VRF requested in end_game (for multi-player)
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

// Game status constants
GAME_STATUS_WAITING = 0   // Game created, no bets yet
GAME_STATUS_OPEN = 1      // First bet placed, countdown started
GAME_STATUS_CLOSED = 2    // Game ended, winner selected

// Anti-spam limits
MAX_BETS_PER_GAME = 1000 total bets
MAX_BETS_PER_USER_SMALL = 20 (for bets < 0.01 SOL)
MAX_BETS_PER_USER_LARGE = 30 (for bets >= 0.01 SOL)
SMALL_BET_THRESHOLD = 10_000_000 lamports (0.01 SOL)

// Timing
MIN_ROUND_TIME = 10 seconds
MAX_ROUND_TIME = 86400 seconds (24 hours)
```

## Database Schema (PostgreSQL)

### Core Tables

**gameRoundStates** - Real game state cache
- `roundId`: number (from blockchain)
- `status`: "waiting" | "open" | "closed"
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
- `vrfRequested`: boolean (tracks if VRF was requested in end_game)

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

## API Server Backend

### Key Features

- Game scheduling (create rounds, end games, send prizes)
- Job tracking (prevent duplicates, status updates)
- Helius webhook listener for blockchain events
- Real-time updates via Socket.io WebSocket
- Player/character/map management via PostgreSQL
- Leaderboard, chat, XP system

## VRF Integration (Magic Block)

### Magic Block VRF Overview

**Provider**: Magic Block (ephemeral rollup VRF)
**SDK**: `ephemeral-vrf-sdk`
**Cost**: Much cheaper than Orao VRF (~90% savings)

### VRF Flow

1. **Betting Phase** (no VRF)
   - All bets placed via `bet` instruction
   - NO VRF request during betting (saves cost!)
   - **Single player games**: Will never request VRF

2. **VRF Request** (in end_game, multi-player only)
   - When countdown expires, API server calls `end_game`
   - If `user_count > 1` and `!vrf_requested`:
     - Requests VRF via `create_request_randomness_ix` from SDK
     - Sets `vrf_requested = true`
     - Returns early: "Call end_game again in 3 seconds"
   - **Single player**: Uses deterministic seed, completes immediately

3. **Callback Execution** (automatic)
   - Magic Block VRF calls `vrf_callback` instruction
   - Stores randomness in `game.rand`
   - Executed within seconds

4. **Winner Selection** (end_game second call)
   - API server calls `end_game` again (~3s later)
   - Uses `game.rand` from callback
   - Weighted selection: higher bets = higher win chance

5. **Verification**
   - Magic Block provides verifiable randomness
   - On-chain callback ensures integrity

### Why Magic Block VRF?

- **Cost-Optimized**: ~90% cheaper than Orao VRF
- **Deferred Request**: Only triggered in end_game (not during betting)
- **Fast**: Sub-second callback execution
- **Verifiable**: Cryptographic proofs on-chain
- **Ephemeral Rollup**: Optimized for low-cost operations

### Winner Selection Algorithm

```rust
// Pseudo-code (implemented in smart contract)
1. Check player count
2. If single player: use deterministic seed, full refund
3. If multiple players: use Magic Block VRF randomness
4. Calculate total pool (sum of all bet amounts)
5. Random point = randomness % total_pool
6. Iterate through bets, accumulate weights
7. Winner = first bet where cumulative >= random_point
8. Calculate prize (95% pool for multi-player, 100% for solo)
```

**Example (Multi-Player)**:
- Bet 1: 1 SOL (weight: 1)
- Bet 2: 3 SOL (weight: 3)
- Bet 3: 1 SOL (weight: 1)
- Total: 5 SOL
- Random point: 3.7
- Cumulative: 0→1 (Bet 1), 1→4 (Bet 2), 4→5 (Bet 3)
- Winner: Bet 2 (because 3.7 falls in range 1-4)
- Prize: 4.75 SOL (95%), House: 0.25 SOL (5%)

**Example (Single Player)**:
- Bet 1: 2 SOL
- Deterministic seed (no VRF)
- Winner: Player 1 (only player)
- Prize: 2 SOL (100%), House: 0 SOL (0%)

## Frontend Architecture

### Game Phases (GamePhaseManager)

```typescript
enum GamePhase {
  IDLE = "idle",              // Show map carousel
  WAITING = "waiting",        // Accepting bets (countdown running)
  VRF_PENDING = "vrf_pending", // Waiting for end_game
  CELEBRATING = "celebrating", // Winner celebration (15s)
  FIGHTING = "fighting",      // Battle animations
  CLEANUP = "cleanup"         // Preparing for next game
}
```

### Map Carousel (Waiting State)

When no game is active, players see the **map carousel**:

- **Spinning Animation**: Maps rotate continuously
- **Visual Engagement**: Keeps players interested while waiting
- **Map Preview**: Shows available arenas (bg1, bg2)
- **Stops on Selection**: When game is created, carousel stops on selected map
- **Bet Prompt**: UI encourages players to place bets

### Key React Hooks

**usePrivyWallet.ts**
- Manages Privy wallet connection
- Returns: `connected`, `publicKey`, `solBalance`, `wallet`

**useGameContract.ts**
- `placeBet(amount, skin, position)` - Send bet transaction
- `validateBet(amount)` - Check bet validity
- Builds Anchor instructions manually
- Signs via Privy's `signAndSendAllTransactions()`
- Supports `bet` instruction (API server creates games)

**useNFTCharacters.ts**
- Checks NFT ownership for exclusive characters
- Calls `verifyNFTOwnership` API action

## Game Flow Diagram

```
┌──────────────────────┐
│   MAP CAROUSEL       │ Spinning maps while waiting
│  Engaging idle state │ Players can bet anytime
└──────────────────────┘
           ↓ [API server creates game]
┌──────────────────────────────────────┐
│ Server: create_game_round            │
│ - Status = WAITING                   │
│ - NO bets, NO countdown, NO VRF      │
│ - Carousel stops on selected map     │
│ - Game account initialized           │
│ - System locked                      │
└──────────────────────────────────────┘
           ↓ [First user clicks "Place Bet"]
┌──────────────────────────────────────┐
│ User: bet instruction (1st bet)      │
│ 1. Status: WAITING → OPEN            │
│ 2. Countdown STARTS (60s)            │
│ 3. Bet stored (SOL transferred)      │
│ 4. NO VRF requested (saves cost!)    │
└──────────────────────────────────────┘
           ↓ [More players can join]
┌──────────────────────────────────────┐
│ BETTING PHASE (up to 60 seconds)     │
│ - Players call bet() instruction     │
│ - Each bet: skin + position          │
│ - Status = OPEN                      │
│ - Helius webhooks → API server       │
│ - Frontend shows countdown           │
│ - NO VRF requested yet               │
└──────────────────────────────────────┘
           ↓ [End time reached]
┌──────────────────────────────────────┐
│ gameScheduler.executeEndGame() #1    │
│ 1. Server scheduler triggers         │
│ 2. Calls smart contract end_game()   │
│ 3. Single player: deterministic seed │
│    → Winner selected immediately     │
│ 4. Multi-player: VRF requested       │
│    → Returns early, call again in 3s │
└──────────────────────────────────────┘
           ↓ [VRF callback (multi-player)]
┌──────────────────────────────────────┐
│ Magic Block VRF: vrf_callback        │
│ - Stores randomness in game.rand     │
│ - Executes within seconds            │
└──────────────────────────────────────┘
           ↓ [~3 seconds later]
┌──────────────────────────────────────┐
│ gameScheduler.executeEndGame() #2    │
│ 1. Server calls end_game again       │
│ 2. Uses stored VRF randomness        │
│ 3. Status = CLOSED                   │
│ 4. Winner stored in blockchain       │
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
│ 3. Single: 100% (no house fee)       │
│ 4. Multi: 95% winner, 5% treasury    │
└──────────────────────────────────────┘
           ↓ [Prize sent]
┌──────────────────────────────────────┐
│ CLEANUP PHASE                        │
│ 1. Fade out game                     │
│ 2. Return to map carousel            │
│ 3. Carousel resumes spinning         │
│ 4. Server can create next game       │
└──────────────────────────────────────┘
```

## Cost Analysis

### Game Costs

**Per Game Costs** (Backend pays):

**Single Player (1 bet only)**:
- Create game: ~0.000005 SOL
- End game: ~0.000005 SOL
- Send prize: ~0.000005 SOL
- **VRF cost**: $0 (NO VRF requested!)
- **Total Backend Cost**: ~0.000015 SOL (~$0.003 at $200/SOL)
- **House Fee**: 0% (full refund)

**Multi-Player (2+ bets)**:
- Create game: ~0.000005 SOL
- Magic Block VRF: ~0.00001 SOL (cheap!)
- End game: ~0.000005 SOL
- Send prize: ~0.000005 SOL
- **Total Backend Cost**: ~0.000025 SOL (~$0.005 at $200/SOL)
- **House Fee**: 5% of pool

**Per Player Costs** (User pays):
- Bet transaction: ~0.000005 SOL (~$0.001)

**Economic Model**:
- House edge: 5% of pool (multi-player) or 0% (single player)
- Example: 10 SOL pool = 0.5 SOL house fee (~$100)
- Backend cost: ~$0.005
- Net profit: ~$99.995 per multi-player game
- Scalability: Costs stay flat, revenue scales with pool size

### Cost Comparison (Old vs New)

| Scenario | Old (Orao VRF) | New (Magic Block) | Savings |
|----------|---------------|-------------------|---------|
| Single player | ~$0.025 | ~$0.003 | **88%** |
| Multi-player | ~$0.025 | ~$0.005 | **80%** |

## Environment Variables

```env
# Database
DATABASE_URL=                                    # PostgreSQL connection string

# Solana
SOLANA_RPC_URL=
VITE_SOLANA_NETWORK=devnet                      # Client-side (Vite exposes VITE_*)
GAME_PROGRAM_ID=7bHYHZVu7kWRU4xf7DWypCvefWvuDqW1CqVfsuwdGiR7
BACKEND_WALLET_SECRET=                          # For settlements

# Privy
VITE_PRIVY_APP_ID=                              # Client-side (exposed to browser)
PRIVY_APP_SECRET=                               # Backend-only (server uses this)

# Helius (for webhooks)
HELIUS_API_KEY=                                 # For blockchain event monitoring

# Note: Vite only exposes variables prefixed with VITE_ to the browser
# All other variables are only accessible server-side
```

## Security

- Never commit secrets or private keys
- Use environment variables for sensitive data
- Validate all user inputs on-chain
- Smart contract enforces all game rules
- Non-custodial: Backend cannot access player funds
- Verifiable: Magic Block VRF provides cryptographic proofs
- Helius webhooks for secure event monitoring

## Resources

- [Socket.io Docs](https://socket.io/docs/)
- [Phaser.js Docs](https://phaser.io/docs)
- [Solana Cookbook](https://solanacookbook.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Magic Block VRF](https://github.com/magicblock-labs/ephemeral-vrf-sdk)
- [Privy Docs](https://docs.privy.io/)
- [Helius Docs](https://docs.helius.dev/)
- [Bun Documentation](https://bun.sh/docs)

---

## Architecture Summary

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     USER EXPERIENCE                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Login with email/social (Privy)                          │
│ 2. See map carousel spinning (engaging idle state)          │
│ 3. Click "Bet 0.5 SOL" → Privy signs seamlessly             │
│ 4. Carousel stops on selected map                           │
│ 5. Wait 60s for other players (or instant if solo)          │
│ 6. Watch game play (Phaser animations)                      │
│ 7. Winner announced → SOL arrives in wallet                 │
│ 8. Return to map carousel                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  TECHNOLOGY LAYERS                           │
├─────────────────────────────────────────────────────────────┤
│ Frontend (React + Vite + Phaser)                            │
│   - Privy for auth + embedded wallets                       │
│   - Socket.io for real-time updates (<1s)                   │
│   - 60fps animations on canvas                              │
├─────────────────────────────────────────────────────────────┤
│ Backend (Socket.io API + PostgreSQL)                        │
│   - Creates games (create_game_round)                       │
│   - Scheduled jobs (end_game, send_prize)                   │
│   - Helius webhook listener (event processing)              │
│   - Player/character/map management                         │
├─────────────────────────────────────────────────────────────┤
│ Blockchain (Solana)                                         │
│   - domin8_prgm: Bet escrow (7 instructions)                │
│   - Magic Block VRF: Cost-optimized randomness              │
│   - All bets locked in smart contracts                      │
│   - Non-custodial, trustless, transparent                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Hybrid On/Off-Chain**
- ✅ Bets: On-chain (trustless escrow)
- ✅ VRF: On-chain (Magic Block VRF, cost-optimized)
- ✅ Game Creation: Server-managed (off-chain trigger)
- ✅ Game Logic: Off-chain (fast, flexible)
- ✅ Animations: Off-chain (smooth, no blockchain lag)

**2. Single Global Game**
- One game instance for entire platform
- Creates urgency and social dynamics
- Simpler architecture than parallel games
- Map carousel while waiting for players

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

**5. Magic Block VRF (Cost-Optimized)**
- Ephemeral rollup VRF (~90% cheaper than Orao)
- Deferred request (only in end_game for multi-player)
- Single player games: NO VRF (100% savings)
- Fast callback execution (sub-second)

**6. Smart Contract Escrow**
- Non-custodial (backend can't steal)
- Transparent (all bets on-chain)
- Verifiable (Magic Block VRF proofs)
- Marketing advantage (provably fair)

**7. Events-Based Architecture**
- Helius webhooks for blockchain events
- API server stores and broadcasts events
- Frontend subscribes via WebSocket
- No polling, no active_game PDA needed

---

## Notes

### What's Implemented
✅ Map carousel (engaging waiting state)
✅ Real game mode (server-managed)
✅ Magic Block VRF integration (cost-optimized)
✅ 7-instruction smart contract (optimized)
✅ Privy wallet integration (seamless UX)
✅ Helius webhooks + Socket.io events
✅ 8 characters (some NFT-gated)
✅ 2 maps (bg1, bg2)
✅ Bet-to-size scaling
✅ Smart explosion effects (winner stays)
✅ Non-custodial escrow
✅ Dynamic prize distribution (95/5 or 100/0)
✅ VRF cost optimization (deferred to end_game)
✅ Single player full refund (0% house fee)

### Removed/Simplified
❌ Demo mode (replaced with map carousel)
❌ active_game PDA (events-based sync instead)
❌ Orao VRF (replaced with Magic Block)
❌ VRF during betting (deferred to end_game)
❌ Fixed house fee (0% for solo, 5% for multi)
❌ Blockchain polling (Helius webhooks instead)

### Key Optimizations
✅ **VRF Cost**: 80-90% reduction vs Orao VRF
✅ **Single Player**: 100% VRF cost savings (no request)
✅ **Architecture**: Simplified (no active_game PDA)
✅ **Events**: Real-time via Helius webhooks
✅ **Fairness**: Single player full refund (0% fee)

### Flow Confirmed
✅ Map carousel spins while waiting for players
✅ API server creates game (carousel stops on map)
✅ First bet starts countdown (60s)
✅ Betting phase: players place bets (no VRF)
✅ Countdown expires → end_game (1st call)
✅ Single player: full refund, deterministic seed (immediate)
✅ Multi-player: VRF requested in end_game, returns early
✅ VRF callback stores randomness
✅ API server calls end_game again (2nd call, ~3s later)
✅ Multi-player: 95/5 split, VRF randomness
✅ Prize sent → return to carousel
✅ Carousel resumes, ready for next game
