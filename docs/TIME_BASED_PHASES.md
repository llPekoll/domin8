# Time-Based Game Phase System

## Overview

The game now uses a **time-based phase calculation system** instead of polling the blockchain every 3 seconds. This is more efficient, predictable, and provides a better user experience.

## How It Works

### Core Principle

Game phases are calculated from timestamps, not from repeated blockchain queries. Both frontend and backend use the same pure function to determine the current phase.

```typescript
calculateGamePhase(
  blockchainStatus:  'waiting' | 'awaitingWinnerRandomness' | 'finished',
  startTimestamp: number,    // Unix timestamp in seconds
  endTimestamp: number,      // Unix timestamp in seconds
  winner?: string | null,
  currentTime: number = Date.now() / 1000
): GamePhase
```

### Phase Durations

```typescript
const PHASE_DURATIONS = {
  WAITING: 30, // Betting window open (0-30s)
  FIGHTING: 10, // VRF requested, animations playing (30-40s)
  RESULTS: 5, // Winner announced, celebration (40-45s)
};
```

### Game Phases

1. **IDLE** - No active game
2. **WAITING** - Betting window open (0-30s)
3. **BETTING_CLOSED** - Brief transition (30-32s)
4. **FIGHTING** - Characters fighting, waiting for VRF (32-40s)
5. **VRF_DELAYED** - VRF taking longer than 8 seconds
6. **RESULTS** - Winner announced (40-45s)
7. **FINISHED** - Game complete, ready for next round
8. **ERROR** - Something went wrong (timeout after 75s)

## Architecture

### Shared Logic (`convex/lib/gamePhases.ts`)

Pure functions that work in both frontend and backend:

- `calculateGamePhase()` - Determine current phase from timestamps
- `getPhaseStartTime()` - When does a phase start?
- `getPhaseTimeRemaining()` - How much time left in current phase?
- `shouldExecuteAction()` - Should backend execute an action now?
- `getPhaseDescription()` - User-friendly phase text

### Backend (`convex/gameManager.ts`)

Uses **scheduler-based actions** instead of polling:

```typescript
// When game starts, schedule all future actions
await ctx.scheduler.runAfter(
  30000, // 30 seconds
  internal.gameManager.closeBettingWindow,
  { gameId }
);

// After closing betting, check VRF
await ctx.scheduler.runAfter(
  5000, // 5 seconds
  internal.gameManager.checkVrfAndComplete,
  { gameId, retryCount: 0 }
);
```

**Benefits:**

- ✅ No cron running every 3 seconds
- ✅ Actions execute at exact times
- ✅ Automatic retry logic for VRF
- ✅ Clean, predictable flow

### Frontend (`src/hooks/useGamePhase.ts`)

React hook that:

- Fetches game state from Convex
- Calculates current phase from timestamps
- Updates every second for smooth countdowns
- Returns phase, time remaining, and description

```typescript
const { phase, timeRemaining, description, isDemo } = useGamePhase();
```

**Benefits:**

- ✅ No polling needed
- ✅ Always in sync (deterministic)
- ✅ Works offline (until timestamps expire)
- ✅ Smooth countdown timers

### App.tsx Integration

```typescript
// Get phase info
const { phase, timeRemaining, description, isDemo } = useGamePhase();

// Pass to Phaser scene
useEffect(() => {
  if (hasRealGame && scene.scene.key === "Game") {
    scene.updateGameState(gameData.game);
    scene.updateGamePhase(phase, timeRemaining);
  }
}, [gameData, phase, timeRemaining]);

// Show blockchain dialog during FIGHTING phase
useEffect(() => {
  const shouldShowDialog = phase === "FIGHTING" || phase === "VRF_DELAYED";
  setShowBlockchainDialog(shouldShowDialog);
}, [phase]);
```

### Phaser Scene (`src/game/scenes/Game.ts`)

New method to handle phase updates:

```typescript
updateGamePhase(phase: string, timeRemaining: number) {
  console.log(`[Game Scene] Phase update: ${phase}, time remaining: ${timeRemaining}s`);

  // Update UI with phase info
  this.uiManager.updatePhase?.(phase, timeRemaining);

  // Trigger phase-specific animations
  this.gamePhaseManager.handlePhaseTransition?.(phase, timeRemaining);
}
```

### GamePhaseManager (`src/game/managers/GamePhaseManager.ts`)

New method `handlePhaseTransition()` that responds to phases:

- **WAITING**: Players join, participants spawn
- **BETTING_CLOSED**: Brief pause, prepare for battle
- **FIGHTING**: Move all characters to center, show VRF dialog
- **VRF_DELAYED**: Show "taking longer than expected" message
- **RESULTS**: Explode eliminated participants, celebrate winner
- **FINISHED**: Clean up, prepare for next game

## Flow Example

### Small Game (2-7 participants)

```
Time 0s:   First bet placed
           → Game created in Convex
           → GameRound initialized on Solana
           → Phase: WAITING

Time 0-30s: Players join
           → Phase: WAITING (countdown showing)
           → New participants spawn in real-time

Time 30s:  Backend scheduler triggers closeBettingWindow()
           → Solana transaction: close betting + request VRF
           → Phase: BETTING_CLOSED

Time 32s:  Phase calculation switches to FIGHTING
           → Phaser: Move all characters to center
           → UI: Show "Waiting for VRF..." dialog

Time 35s:  VRF fulfills (3 seconds later)
           → Backend checks VRF, finds it fulfilled
           → Backend calls selectWinnerAndPayout()
           → GameRound.winner gets set

Time 40s:  Phase calculation switches to RESULTS
           → Phaser: Explode eliminated participants
           → Winner stays in center, celebration
           → UI: Show winner name and payout

Time 45s:  Phase calculation switches to FINISHED
           → Phaser: Fade out all participants
           → Return to demo mode

Total: 45 seconds from start to finish
```

## Key Benefits

### 1. No Polling

**Before:** Cron runs every 3 seconds to check blockchain
**After:** One-time scheduled actions + time-based UI updates

### 2. Predictable Timing

**Before:** Phases could vary based on cron timing
**After:** Phases always start at exact timestamps

### 3. Consistent UI

**Before:** Frontend and backend could show different phases
**After:** Same calculation logic everywhere (deterministic)

### 4. Smooth Countdowns

**Before:** Timer jumps every time Convex updates
**After:** Frontend updates every second independently

### 5. VRF Flexibility

**Before:** Fixed 10-second window, might be too short
**After:** FIGHTING phase extends naturally, VRF_DELAYED if needed

### 6. Better UX

**Before:** User sees "waiting" while VRF processes
**After:** Clear "Fighting" phase with visual feedback

## Handling VRF Timing

VRF fulfillment is the only unpredictable element (typically 1-8 seconds). The system handles this elegantly:

1. **FIGHTING phase (30-40s)**: Expected VRF window
2. **Check at 38s**: Has VRF fulfilled?
   - ✅ Yes → Show results early
   - ❌ No → Continue showing FIGHTING
3. **VRF_DELAYED (after 38s)**: Show "taking longer" message
4. **Max retry (50s)**: After 10 retries, mark game as error

This gives VRF up to 20 seconds to complete while keeping users informed.

## Testing the System

### Check Current Phase

Open the **Blockchain Debug Dialog** (purple `?` button) and look at:

- `currentRoundId`: Which game round
- `startTimestamp`: When game started
- `endTimestamp`: When betting closes
- `status`: Blockchain status
- `winner`: Has winner been determined?

Then check the browser console for:

```
{ gameData, phase, timeRemaining, description }
```

### Verify Phase Transitions

Watch console logs as game progresses:

```
[GamePhaseManager] Phase: WAITING, Changed: true, Time: 30s
[GamePhaseManager] Phase: BETTING_CLOSED, Changed: true, Time: 0s
[GamePhaseManager] Phase: FIGHTING, Changed: true, Time: 10s
[GamePhaseManager] FIGHTING phase started - moving participants to center
[GamePhaseManager] Phase: RESULTS, Changed: true, Time: 5s
[GamePhaseManager] RESULTS phase - showing winner
```

### Test VRF Delay

If VRF takes longer than 8 seconds:

```
[GamePhaseManager] Phase: VRF_DELAYED, Changed: true, Time: 2s
[GamePhaseManager] VRF taking longer than expected...
```

## Known Issues & TODOs

### Current State

- ✅ Time-based phase calculation implemented
- ✅ Backend uses scheduler (not polling)
- ✅ Frontend hook calculates phases
- ✅ Phaser scenes respond to phases
- ✅ Blockchain dialog shows during FIGHTING

### Future Improvements

- [ ] UIManager.updatePhase() implementation (timer display)
- [ ] Better VRF delay visuals (loading spinner, progress bar)
- [ ] Phase-based sound effects (battle music during FIGHTING)
- [ ] Analytics: Track average VRF fulfillment time
- [ ] Error recovery: Auto-refund if game stuck

## Debugging Commands

```bash
# Check if game is active
bun run convex dev

# Watch game state in real-time
# Open http://localhost:5173 and click purple ? button

# Create a test game (terminal)
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=./solana/wallet.json \
npx ts-node scripts/create-game.ts

# Place a bet (UI)
# Click "Bet 0.1 SOL" button

# Monitor phases (browser console)
# Watch logs: { gameData, phase, timeRemaining, description }
```

## Summary

The time-based phase system is a brilliant architectural improvement that:

- Eliminates unnecessary blockchain polling
- Provides smooth, predictable UI updates
- Handles VRF timing gracefully
- Uses shared logic between frontend and backend
- Enables future features like advanced animations and sound

**Credits:** Suggested by user as "you know how long is a game so you can guess all the phase occurs that will avoid make a polling every 3 sec from a cron"
