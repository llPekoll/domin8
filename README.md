# Royal Rumble - Multiplayer Battle Royale Game

A fast-paced, real-time battle royale betting game built on Solana blockchain where players control multiple characters in dynamic arenas.

## Game Overview

Royal Rumble is a multiplayer battle game where:

- Players can control multiple characters (GameParticipants) in a single match
- Each player starts with a randomly assigned character that can be re-rolled
- Games adapt dynamically based on participant count
- Winners earn rewards proportional to their bets
- Built with real-time updates using Socket.io

## Quick Start

### Local Development

```bash
# Install dependencies using Bun (required)
bun install

# Start the backend API server (Socket.io + PostgreSQL)
bun run server:dev

# In a separate terminal, run the frontend development server
bun run dev
```

### Seed Data

To populate initial game data, insert the seed files into your PostgreSQL database:

- `seed/characters.json` - Character definitions
- `seed/maps.json` - Map configurations

Then you can start the game.

**Ports Used:**

- `5173` - Frontend (Vite dev server)
- `3000` - Backend API (Socket.io server)

## Game Mechanics

### Dynamic Game Phases

The game adapts based on the number of participants:

#### Small Games (< 8 participants)

**3 phases (45 seconds total)**

- Waiting Phase (30s) - Players join and place bets
- Arena Phase (10s) - Characters spawn and move to center
- Results Phase (5s) - Winners announced and payouts distributed

#### Large Games (>= 8 participants)

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
- **Real-time Updates**: Live game state synchronization via Socket.io
- **Smart Matchmaking**: Automatic bot filling for entertainment value

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Backend**: Socket.io API server (Node.js)
- **Database**: PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **Game Engine**: [Phaser.js](https://phaser.io/) - 2D game framework
- **Blockchain**: Solana (Anchor framework)
- **Styling**: Tailwind CSS
- **Deployment**: Coolify with Nixpacks (frontend) and Dockerfile (backend)

## Project Structure

```
/
├── server/              # Backend API (Socket.io + PostgreSQL)
│   ├── index.ts         # Server entry point
│   └── ...              # API routes, game logic, DB access
├── src/
│   ├── game/           # Phaser game engine
│   │   ├── scenes/     # Game scenes for each phase
│   │   └── config.ts   # Game configuration
│   ├── components/     # React UI components
│   └── app/           # Application pages
├── programs/
│   └── domin8_prgm/    # Solana smart contract (Anchor)
└── public/
    └── assets/        # Game assets
        ├── characters/ # Character sprites
        └── maps/      # Background images
```

## Adding Content

### New Character

1. Add sprite to `/public/assets/characters/`
2. Insert record in `characters` table (PostgreSQL)
3. Configure animations (idle, walk, attack)

### New Map

1. Add background to `/public/assets/maps/`
2. Insert record in `maps` table (PostgreSQL)
3. Configure spawn positions and limits

## Development

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [PostgreSQL](https://www.postgresql.org/) - Database (or use Coolify-managed instance)
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

# Start the backend API server
bun run server:dev

# Run frontend development server (in a separate terminal)
bun run dev

# Build for production
bun run build

# Run linting
bun run lint

# Type checking
bun run typecheck
```

## Game Rules

### Betting System

- **Entry Bets**: Place during waiting phase (bet on yourself)
- **Spectator Bets**: Place during betting phase (bet on others)
- **Payout Distribution**: 95% to winners, 5% house edge
- **Min/Max Limits**: 10-10,000 game coins per bet

### Single Player Mode

- Automatically runs with bots for entertainment
- Player always wins (practice mode)
- Bet is refunded with no profit/loss

## Environment Variables

Create a `.env.local` file (copy from `.env.example`):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/domin8

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

## Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions and codebase overview
- [GAME_SPECS.md](./GAME_SPECS.md) - Detailed game specifications
- [ANIMATION_ENGINE_SPECS.md](./ANIMATION_ENGINE_SPECS.md) - Animation system details
- [SINGLE_PLAYER_LOGIC.md](./SINGLE_PLAYER_LOGIC.md) - Single player mode details
- [ROADMAP.md](./ROADMAP.md) - Development roadmap

## Contributing

1. Check existing issues and documentation
2. Follow the code style in existing files
3. Test your changes thoroughly
4. Submit a pull request with clear description

## License

[Your License Here]

## Resources

- [Phaser.js Documentation](https://phaser.io/docs)
- [Solana Cookbook](https://solanacookbook.com/)
- [Bun Documentation](https://bun.sh/docs)
- [Socket.io Documentation](https://socket.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [metalslug font](https://fontstruct.com/fontstructions/download/2547046)
  //cursor
  https://aspecsgaming.itch.io/pixel-art-cursors/download/eyJleHBpcmVzIjoxNzYxNzU1NDU5LCJpZCI6Mjc1MDYyOX0%3d.6PqdH7xtvE7mIDdAY4NOXhcY8NM%3d
  // last blade
  https://downloads.khinsider.com/game-soundtracks/album/the-last-blade-original-soundtrack-1997
  // loader
  https://phaser.io/examples/v3.85.0/game-objects/nine-slice/view/progress-bar
  // the music
  https://opengameart.org/content/battle-theme-a#
  https://www.patreon.com/cynicmusic

presenceWallet = Bptm31P2QPrdePaGrqUN8ApAZqHnEuqh8y69UHpy51a
