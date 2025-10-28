# Character Synchronization System

## Overview

This system ensures all players see the same characters at the same positions when bets are placed. It uses a two-step process:

1. **Smart Contract**: Stores the bet on-chain (amount, wallet, timestamp)
2. **Convex Database**: Stores character selection and spawn position

## Flow Diagram

```
User selects character → Places bet → Smart contract confirms
                                     ↓
                          Event listener detects BetPlaced event
                                     ↓
                          storeBetFromPDA() creates bet record
                                     ↓
                          Frontend assigns character + spawn position
                                     ↓
                          All players query bets with characters
                                     ↓
                          Game scene renders synchronized characters
```

## Key Components

### 1. Frontend: CharacterSelection.tsx

**User Action:**
```typescript
// User picks character (Orc, Mage, etc.)
const currentCharacter = { _id: "...", name: "Orc" };

// User clicks "Insert Coin"
await placeBet(0.5); // Bet placed on-chain

// IMMEDIATELY AFTER: Assign character to bet
const roundId = await fetchCurrentRoundId();
const spawnIndex = await getNextSpawnIndex({ roundId });

await assignCharacterToBet({
  roundId,
  betIndex: spawnIndex, // Same as spawn for now
  characterId: currentCharacter._id,
  spawnIndex,
});
```

### 2. Convex Mutations: betsMutations.ts

**assignCharacterToBet:**
- Links character to bet
- Assigns spawn position (prevents overlaps)
- Updates bet record with character + position

**getNextSpawnIndex:**
- Returns next available spawn slot
- Prevents position conflicts

### 3. Convex Queries: betsQueries.ts

**getCurrentRoundBets:**
- Fetches all bets for active round
- Includes character data
- Sorted by betIndex

**Game Scene Usage:**
```typescript
const bets = useQuery(api.betsQueries.getCurrentRoundBets);

// Render each bet as a character
bets.forEach(bet => {
  if (bet.character && bet.position) {
    spawnCharacter({
      name: bet.character.name,
      x: bet.position.x,
      y: bet.position.y,
      betAmount: bet.amount,
    });
  }
});
```

## Database Schema

### bets table
```typescript
{
  roundId: Id<"gameRoundStates">,
  walletAddress: string,
  amount: number, // SOL
  betIndex: number, // 0, 1, 2, ...

  // Character sync fields:
  characterId: Id<"characters">, // Orc, Mage, Archer, etc.
  spawnIndex: number, // 0, 1, 2, ... (spawn slot)
  position: { x: number, y: number }, // Calculated from spawnIndex
}
```

## Spawn Position Configuration

Current spawn positions (in `betsMutations.ts`):
```typescript
const spawnPositions = [
  { x: 200, y: 300 }, // Spawn 0
  { x: 600, y: 300 }, // Spawn 1
  { x: 200, y: 500 }, // Spawn 2
  { x: 600, y: 500 }, // Spawn 3
  { x: 400, y: 200 }, // Spawn 4
  { x: 400, y: 600 }, // Spawn 5
];
```

**To customize:**
- Edit `spawnPositions` array in `convex/betsMutations.ts`
- Or import from `src/config/spawnConfig.ts` for consistency

## Do You Need spawnIndex?

**YES**, here's why:

### Without spawnIndex:
❌ Two players bet at the same time
❌ Both get position `{ x: 200, y: 300 }`
❌ Characters overlap on screen

### With spawnIndex:
✅ Player 1 gets spawnIndex 0 → position (200, 300)
✅ Player 2 gets spawnIndex 1 → position (600, 300)
✅ No overlaps, deterministic positions

**spawnIndex vs betIndex:**
- `betIndex`: Order on blockchain (immutable, from smart contract)
- `spawnIndex`: Visual spawn slot (same as betIndex for simplicity)

You could decouple them for randomized spawn positions:
```typescript
// Random spawn assignment
const availableSpawns = [0, 1, 2, 3, 4, 5];
const randomSpawn = availableSpawns[Math.floor(Math.random() * availableSpawns.length)];
```

## Timing Considerations

### Current Implementation:
```typescript
await placeBet(amount); // ~1-2 seconds (blockchain)
await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for event listener
await assignCharacterToBet(...); // Instant (Convex mutation)
```

**Why the 2-second delay?**
- Event listener polls every 3 seconds
- Need to ensure bet is captured before assigning character
- Alternative: Poll until bet appears in database

### Better Approach (Future Optimization):
```typescript
// Instead of fixed 2s delay, poll for bet:
const waitForBet = async (roundId, betIndex, maxWait = 5000) => {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const bet = await getBetByIndex({ roundId, betIndex });
    if (bet) return bet;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Bet not captured in time");
};
```

## Integration with Game Scene

### Example: src/game/scenes/Game.ts

```typescript
import { api } from "../../../convex/_generated/api";
import { useQuery } from "convex/react";

export class GameScene extends Phaser.Scene {
  convexBets: any[] = [];

  create() {
    // Subscribe to bet updates (via React hook in wrapper)
    this.subscribeToConvexBets();
  }

  subscribeToConvexBets() {
    // This would be called from a React component that wraps Phaser
    // Example: GameWrapper.tsx
    const bets = useQuery(api.betsQueries.getCurrentRoundBets);

    bets.forEach(bet => {
      this.spawnParticipant({
        betIndex: bet.betIndex,
        wallet: bet.walletAddress,
        character: bet.character?.name,
        position: bet.position,
        betAmount: bet.amount,
      });
    });
  }
}
```

## Testing Synchronization

1. **Open two browser windows**
2. **Window 1**: Select Orc, bet 0.5 SOL
3. **Window 2**: Select Mage, bet 0.3 SOL
4. **Both windows should show:**
   - Orc at position (200, 300) with 0.5 SOL size
   - Mage at position (600, 300) with 0.3 SOL size

## Troubleshooting

### Characters not appearing?
```bash
# Check if bets are captured
curl https://your-convex-url/api/betsQueries/getCurrentRoundBets

# Check if character assignment succeeded
console.log("[CharacterSelection] Character assigned:", result);
```

### Position conflicts?
- Verify `getNextSpawnIndex()` is working
- Check if `spawnIndex` is being stored
- Ensure spawn positions don't overlap

### Timing issues?
- Increase the 2-second delay to 3-4 seconds
- Implement polling approach (see "Better Approach" above)
- Check event listener cron interval (should be 3 seconds)

## Summary

✅ **What you have now:**
- Character selection before betting
- Spawn position assignment
- Database sync across all players
- deterministic rendering

🎯 **Next steps:**
- Integrate queries into game scene
- Test with multiple players
- Add character animations based on character type
- Handle character-specific abilities (if needed)
