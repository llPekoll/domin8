# Royal Rumble - Multiplayer Battle Royale Game

A fast-paced, real-time battle royale betting game built on Solana blockchain where players control multiple characters in dynamic arenas.

## 🎮 Game Overview

Royal Rumble is a multiplayer battle game where:

- Players can control multiple characters (GameParticipants) in a single match
- Each player starts with a randomly assigned character that can be re-rolled
- Games adapt dynamically based on participant count
- Winners earn rewards proportional to their bets
- Built with real-time updates using Convex

## 🚀 Quick Start

### Local Development with Convex

```bash
# Install dependencies using Bun (required)
bun install

# Start Convex backend locally with Docker Compose
docker-compose up

# Get admin key
docker compose exec backend ./generate_admin_key.sh
# In a separate terminal, run the development server

# push env var in convex
CRANK_AUTHORITY_PRIVATE_KEY=<PRIVATE_KEY_OF_A_WALLET>
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
```

at that stage you still have to copy seeds to make it work
Go in convex -> Data on the left panel -> then add
copy the the json (list are valid too)
->seed/characters.json
->seed/maps.json
then you can start the game

```bash
bun dev
```

**Important Notes:**

- **Docker Compose**: Required to run Convex backend locally with database support
- **Database Target**: The `docker-compose.yml` includes a PostgreSQL database connection (see `POSTGRES_URL` in environment variables)
- **Ports Used**:
  - `3210` - Convex backend
  - `3211` - Site proxy
  - `6791` - Convex dashboard
- **Dashboard Access**: Visit `http://localhost:6791` to access the Convex dashboard after starting Docker Compose

## 🎲 Game Mechanics

### Dynamic Game Phases

The game adapts based on the number of participants:

#### Small Games (< 8 participants)

**3 phases (45 seconds total)**

- Waiting Phase (30s) - Players join and place bets
- Arena Phase (10s) - Characters spawn and move to center
- Results Phase (5s) - Winners announced and payouts distributed

#### Large Games (≥ 8 participants)

**7 phases (75 seconds total)**

- Waiting Phase (30s) - Players join and place bets
- Selection Phase - Character selection and preparation
- Arena Phase (10s) - Characters spawn and move to center
- Elimination Phase - Initial eliminations
- Betting Phase (15s) - Spectators bet on top survivors
- Battle Phase (15s) - Final showdown
- Results Phase (5s) - Winners announced and payouts distributed

### Key Features

- **Multiple Characters per Player**: Control multiple GameParticipants in a single match
- **Character System**: Start with a random character, option to re-roll
- **Multiple Maps**: Various arenas with unique spawn configurations
- **Bet-to-Size Scaling**: Character size increases with bet amount
- **Real-time Updates**: Live game state synchronization via Convex
- **Smart Matchmaking**: Automatic bot filling for entertainment value

## 🏗️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Backend**: [Convex](https://convex.dev/) - Real-time serverless backend
- **Frontend**: React + TypeScript + Vite
- **Game Engine**: [Phaser.js](https://phaser.io/) - 2D game framework
- **Blockchain**: Solana (Anchor framework)
- **Styling**: Tailwind CSS
- **State Management**: Convex React hooks

## 📁 Project Structure

```
/
├── convex/              # Backend logic
│   ├── games.ts         # Game loop and phase management
│   ├── players.ts       # Player actions and betting
│   ├── schema.ts        # Database schema
│   └── crons.ts         # Scheduled tasks
├── src/
│   ├── game/           # Phaser game engine
│   │   ├── scenes/     # Game scenes for each phase
│   │   └── config.ts   # Game configuration
│   ├── components/     # React UI components
│   └── app/           # Application pages
└── public/
    └── assets/        # Game assets
        ├── characters/ # Character sprites
        └── maps/      # Background images
```

## 🎨 Adding Content

### New Character

1. Add sprite to `/public/assets/characters/`
2. Insert record in `characters` table
3. Configure animations (idle, walk, attack)

### New Map

1. Add background to `/public/assets/maps/`
2. Insert record in `maps` table
3. Configure spawn positions and limits

## 🔧 Development

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [Docker](https://www.docker.com/) & Docker Compose - For local Convex backend
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) - For smart contract development
- [Anchor](https://www.anchor-lang.com/docs/installation) - Solana framework

### Wallet & Program Configuration

Each developer needs their own wallet and program ID for development. This project uses environment variables to manage machine-specific configurations.

#### Setup Your Development Environment

1. **Create your Solana wallet**:

```bash
# Generate a new wallet (for testnet/devnet)
solana-keygen new --outfile solana/my-wallet.json
```

2. **Configure your `.env.local`** (not committed to git):

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and add your wallet path
ANCHOR_WALLET=./solana/my-wallet.json
```

3. **Build and deploy your program**:

```bash
# Build the smart contract
bun run anchor:build

# Deploy to devnet (make sure your wallet has devnet SOL)
bun run anchor:deploy
```

4. **Update your `.env.local` with the deployed program ID**:

```bash
# After deploy, you'll get a program ID like: 8BH1JMeZCohtUKcfGGTqpYjpwxMowZBi6HrnAhc6eJFz
# Add it to your .env.local:
ANCHOR_PROGRAM_ID=<your-deployed-program-id>
```

### Anchor Commands

All Anchor commands automatically use your wallet and program ID from `.env.local`:

```bash
# Build the smart contract
bun run anchor:build

# Deploy to devnet with your wallet
bun run anchor:deploy

# Run tests with your configuration
bun run anchor:test

# Start local validator
bun run anchor:localnet
```

### Development Commands

```bash
# Install dependencies
bun install

# Start Convex backend (required for development)
docker-compose up

# Run development server (in a separate terminal)
bun run dev

# Stop Convex backend
docker-compose down

# Build for production
bun run build

# Run linting
bun run lint

# Type checking
bun run typecheck
```

### Local Convex Backend

The project uses Docker Compose to run a local Convex backend with PostgreSQL database support. This provides:

- Full offline development capabilities
- Local database for testing
- Convex dashboard at `http://localhost:6791`
- Backend API at `http://localhost:3210`

## 🎯 Game Rules

### Betting System

- **Entry Bets**: Place during waiting phase (bet on yourself)
- **Spectator Bets**: Place during betting phase (bet on others)
- **Payout Distribution**: 95% to winners, 5% house edge
- **Min/Max Limits**: 10-10,000 game coins per bet

### Single Player Mode

- Automatically runs with bots for entertainment
- Player always wins (practice mode)
- Bet is refunded with no profit/loss

## 🚦 Environment Variables

Create a `.env.local` file (copy from `.env.example`):

```env
# Convex configuration
CONVEX_DEPLOYMENT=your-deployment
VITE_CONVEX_URL=http://127.0.0.1:3210

# Solana configuration
SOLANA_RPC_URL=your-rpc-url
VITE_SOLANA_NETWORK=devnet

# Anchor configuration (machine-specific)
ANCHOR_WALLET=./solana/your-wallet.json
ANCHOR_PROGRAM_ID=your-program-id-after-deploy

# Other services
PRIVY_APP_SECRET=your-privy-secret
VITE_PRIVY_APP_ID=your-privy-app-id
```

**Note**: Each developer should have their own `.env.local` with their specific wallet and program ID.

## 📚 Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions and codebase overview
- [GAME_SPECS.md](./GAME_SPECS.md) - Detailed game specifications
- [ANIMATION_ENGINE_SPECS.md](./ANIMATION_ENGINE_SPECS.md) - Animation system details
- [CONVEX_IMPLEMENTATION.md](./CONVEX_IMPLEMENTATION.md) - Backend implementation guide
- [SINGLE_PLAYER_LOGIC.md](./SINGLE_PLAYER_LOGIC.md) - Single player mode details
- [ROADMAP.md](./ROADMAP.md) - Development roadmap

## 🤝 Contributing

1. Check existing issues and documentation
2. Follow the code style in existing files
3. Test your changes thoroughly
4. Submit a pull request with clear description

## 📄 License

[Your License Here]

## 🔗 Resources

- [Convex Documentation](https://docs.convex.dev/)
- [Phaser.js Documentation](https://phaser.io/docs)
- [Solana Cookbook](https://solanacookbook.com/)
- [Bun Documentation](https://bun.sh/docs)
- [metalslug font](https://fontstruct.com/fontstructions/download/2547046)
  //cursor
  https://aspecsgaming.itch.io/pixel-art-cursors/download/eyJleHBpcmVzIjoxNzYxNzU1NDU5LCJpZCI6Mjc1MDYyOX0%3d.6PqdH7xtvE7mIDdAY4NOXhcY8NM%3d
  // last blade
  https://downloads.khinsider.com/game-soundtracks/album/the-last-blade-original-soundtrack-1997
  // loader
  https://phaser.io/examples/v3.85.0/game-objects/nine-slice/view/progress-bar
