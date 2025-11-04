# Prize Distribution System

## Overview

The prize distribution system has been redesigned to focus on finished games that need prize payouts, rather than trying to end games that are still open. This is because **a new game round cannot be created until the previous one is ended**, so there's no need to check for unended games.

## How It Works

### Automatic Prize Distribution (Cron Job)

The sync service (`syncService.ts`) runs every 5 seconds and performs three main tasks:

1. **syncActiveGame()** - Syncs the current active game from blockchain to database
2. **processEndedGames()** - Checks if the active game has ended and schedules `endGame` action
3. **processPastEndedGames()** - Checks the last 10 finished games for unclaimed prizes

#### processPastEndedGames() Details

This function:
- Queries the database for the last 10 games in "finished" status
- For each game, fetches the blockchain state to check `winner_prize` field
- If `winner_prize > 0`, schedules a `sendPrizeWinner` action
- Uses 500ms delay between blockchain checks to respect RPC rate limits

**Rate Limiting:**
- Only checks 10 most recent finished games per run (every 5 seconds)
- 500ms delay between each blockchain RPC call
- This prevents overwhelming the RPC endpoint

### Manual Bulk Prize Distribution

For historical games or recovery after downtime, use the `bulkSendPrizes` action:

```typescript
// Example: Send prizes for rounds 100-199
await ctx.runAction(internal.syncService.bulkSendPrizes, {
  startRound: 100,
  count: 100
});
```

#### How to Use

1. **Via Convex Dashboard:**
   - Navigate to Functions → syncService → bulkSendPrizes
   - Set parameters:
     - `startRound`: Starting round ID (e.g., 10)
     - `count`: Number of rounds to check (e.g., 100)
   - Click "Run"

2. **Via Script:**
   Create a script file `scripts/bulk-send-prizes.ts`:
   ```typescript
   import { internal } from "../convex/_generated/api";
   
   const startRound = 100; // Starting round
   const count = 100;      // Number of rounds to process
   
   await ctx.run(internal.syncService.bulkSendPrizes, {
     startRound,
     count
   });
   ```

   Run with:
   ```bash
   npm run convex run scripts/bulk-send-prizes.ts
   ```

#### Parameters

- **startRound** (number): The first round ID to check (inclusive)
- **count** (number): How many consecutive rounds to process

#### Return Value

The function returns a summary object:
```typescript
{
  processed: number;      // Total rounds checked
  scheduled: number;      // Prizes scheduled for distribution
  alreadySent: number;    // Prizes already distributed
  notFinished: number;    // Games not finished yet
  notFound: number;       // Round IDs not found on blockchain
  errors: string[];       // Array of error messages
}
```

#### Rate Limiting

The bulk send function respects RPC rate limits:
- 500ms delay between each blockchain call
- Continues processing even if individual rounds fail
- Provides detailed error reporting

#### Example Output

```
[Bulk Prize Distribution] Starting bulk prize send from round 100, count: 100

[Bulk Prize] Checking round 100...
[Bulk Prize] Round 100: Prize already sent

[Bulk Prize] Checking round 101...
[Bulk Prize] Round 101: Found unclaimed prize: 50000000 lamports to 7xKX...
[Bulk Prize] Round 101: ✅ Scheduled prize distribution (jobId: abc123)

[Bulk Prize] Checking round 102...
[Bulk Prize] Round 102: Not finished yet (status: 0)

[Bulk Prize Distribution] SUMMARY:
  Total processed: 100
  Scheduled: 15
  Already sent: 80
  Not finished: 3
  Not found: 2
  Errors: 0
```

## Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sync Service (Cron - 5s)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. syncActiveGame()                                             │
│     └─> Fetch active game PDA → Update DB                       │
│                                                                   │
│  2. processEndedGames()                                          │
│     └─> Check if active game ended → Schedule endGame           │
│                                                                   │
│  3. processPastEndedGames()  (UPDATED)                          │
│     └─> Query DB for last 10 finished games                     │
│         └─> For each: Check winner_prize > 0                    │
│             └─> Schedule sendPrizeWinner                         │
│                 └─> 500ms delay (rate limit)                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Manual Bulk Distribution                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  bulkSendPrizes(startRound, count)                              │
│     └─> For rounds [startRound, startRound+count)               │
│         └─> Fetch blockchain game state                         │
│             └─> If status=finished && winner_prize>0            │
│                 └─> Schedule sendPrizeWinner                    │
│                     └─> 500ms delay (rate limit)                │
│                                                                   │
│     └─> Return summary: processed, scheduled, errors            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Changes from Previous Implementation

### Before
- Checked for games in "waiting" status that passed their end time
- Tried to schedule `endGame` for historical games
- Problem: Games can't be left unended because new rounds require previous to be closed

### After
- Checks games in "finished" status
- Verifies if `winner_prize > 0` on blockchain
- Only schedules prize distribution (not game ending)
- Focuses on the actual problem: prizes not being sent

## Database Queries

### getFinishedGames
```typescript
// Returns last N finished games, ordered by most recent first
export const getFinishedGames = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .order("desc")
      .take(limit);
  }
});
```

## Monitoring

### Check Prize Distribution Status

To see if prizes are being distributed correctly:

1. **View scheduled jobs:**
   ```typescript
   // Query all pending send_prize jobs
   await ctx.db
     .query("scheduledJobs")
     .withIndex("by_status", (q) => q.eq("status", "pending"))
     .filter((q) => q.eq(q.field("action"), "send_prize"))
     .collect();
   ```

2. **Check blockchain state:**
   ```typescript
   // Check if a specific game's prize was sent
   const game = await solanaClient.getGameRound(roundId);
   console.log("Winner prize:", game.winnerPrize); // Should be 0 if sent
   ```

## Troubleshooting

### Prizes Not Being Distributed

1. **Check if game is in database:**
   - Verify game exists in `gameRoundStates` table with status "finished"

2. **Check blockchain state:**
   - Verify `winner_prize > 0` on blockchain
   - Verify game status is 1 (finished)

3. **Check scheduled jobs:**
   - Look for pending or failed `send_prize` jobs
   - Check error messages in failed jobs

4. **Manual intervention:**
   - Use `bulkSendPrizes` to manually schedule the prize distribution

### RPC Rate Limiting

If you see rate limit errors:
- Reduce the `count` parameter in `bulkSendPrizes`
- Increase the delay in the code (currently 500ms)
- Use multiple smaller batches instead of one large batch

### Example Rate Limit Strategy

For 1000 games:
```typescript
// Instead of: bulkSendPrizes(1, 1000)
// Do:
for (let start = 1; start <= 1000; start += 100) {
  await ctx.run(internal.syncService.bulkSendPrizes, {
    startRound: start,
    count: 100
  });
  // Wait 1 minute between batches
  await new Promise(resolve => setTimeout(resolve, 60000));
}
```

## Best Practices

1. **Let automatic system handle recent games** (last 10 games every 5 seconds)
2. **Use bulk send for historical backfill** (older than ~50 games)
3. **Monitor scheduled jobs** to catch failures early
4. **Respect RPC rate limits** - don't process too many games at once
5. **Always check return summary** from bulk operations

## Security Considerations

- Only the crank authority can execute prize distributions
- The smart contract validates that prizes are only sent once
- If `winner_prize = 0`, the transaction will fail (already sent)
- Admin or winner can claim prizes (see `send_prize_winner.rs`)
