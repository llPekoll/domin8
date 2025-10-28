# Event-Driven Architecture Migration

## Overview

This document explains the shift from **PDA polling** to **event-driven** bet capture using Solana program events.

## Architecture Comparison

### Old Approach: PDA Polling ❌

```typescript
// fetchRoundPDAs.ts - Every 5s
1. Fetch GameRound PDA (getProgramAccounts)
2. Check if state already captured
3. If WAITING, fetch all BetEntry PDAs
4. Store bets in database
```

**Problems:**
- ❌ High RPC costs (repeated `getProgramAccounts` calls)
- ❌ Delayed bet capture (5s polling interval)
- ❌ Inefficient (fetches all PDAs even if nothing changed)
- ❌ Can miss rapid bets between polls
- ❌ Scales poorly with bet count

### New Approach: Event-Driven ✅

```typescript
// blockchainEventListener.ts - Every 3s
1. Fetch recent program transactions (getSignaturesForAddress)
2. Parse BetPlaced events from logs
3. Deduplicate by signature
4. Store in blockchainEvents table
5. Process into bets table
```

**Benefits:**
- ✅ **Real-time**: Bets captured within 3 seconds
- ✅ **Cost-effective**: Only fetches new transactions
- ✅ **Reliable**: Events are atomic with blockchain state
- ✅ **Scalable**: Performance independent of bet count
- ✅ **Verifiable**: Events are permanent in blockchain logs

## Event Types

### Currently Implemented

#### BetPlaced
Emitted every time a user places a bet.

```rust
#[event]
pub struct BetPlaced {
    pub round_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub bet_count: u8,
    pub total_pot: u64,
    pub end_timestamp: i64,
    pub is_first_bet: bool,
    pub timestamp: i64,
    pub bet_index: u32,
}
```

**Frequency**: High (every bet placed)
**Processing**: Immediate (creates bet record)

### To Be Implemented

#### GameCreated
Emitted when the first bet creates a new round.

```rust
#[event]
pub struct GameCreated {
    pub round_id: u64,
    pub creator: Pubkey,
    pub initial_bet: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub vrf_seed_used: [u8; 32],
    pub next_vrf_seed: [u8; 32],
}
```

**Frequency**: Low (once per game round)
**Use Case**: Initialize game round state, schedule betting close

#### GameLocked
Emitted when betting window closes.

```rust
#[event]
pub struct GameLocked {
    pub round_id: u64,
    pub final_bet_count: u8,
    pub total_pot: u64,
    pub vrf_request_pubkey: Pubkey,
}
```

**Frequency**: Low (once per game round)
**Use Case**: Trigger VRF check scheduler

#### WinnerSelected
Emitted when winner is determined.

```rust
#[event]
pub struct WinnerSelected {
    pub round_id: u64,
    pub winner: Pubkey,
    pub winning_bet_index: u32,
    pub winning_bet_amount: u64,
    pub total_pot: u64,
    pub house_fee: u64,
    pub winner_payout: u64,
    pub win_probability_bps: u64,
    pub total_bets: u32,
    pub auto_transfer_success: bool,
    pub house_fee_transfer_success: bool,
    pub vrf_randomness: u64,
    pub vrf_seed_hex: String,
    pub timestamp: i64,
}
```

**Frequency**: Low (once per game round)
**Use Case**: Update bet statuses, display winner, update player stats

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN (Solana)                       │
│  User places bet → BetPlaced event emitted → Logs stored    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          EVENT LISTENER (blockchainEventListener.ts)         │
│  Every 3s: Fetch recent transactions → Parse events         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          EVENT STORAGE (eventProcessorMutations.ts)          │
│  storeBetPlacedEvent → blockchainEvents table                │
│  Deduplication by signature                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          EVENT PROCESSING (eventProcessorMutations.ts)       │
│  processBetPlacedEvent → bets table                          │
│  Create bet record with status, amount, player               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Phaser)                   │
│  Convex subscriptions → Real-time UI updates                 │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### blockchainEvents (Event Store)

```typescript
{
  eventName: "BetPlaced" | "GameCreated" | "WinnerSelected",
  signature: string,        // Transaction signature (unique)
  slot: number,            // Solana slot number
  blockTime: number,       // Unix timestamp
  eventData: any,          // Event-specific data
  roundId: number,         // Game round ID
  processed: boolean,      // Has this been converted to bet?
  processedAt: number,     // When was it processed
}
```

**Indexes:**
- `by_signature`: Deduplication
- `by_event_name`: Query by event type
- `by_round_id`: Query events for specific round
- `by_processed`: Find unprocessed events

### bets (Application Records)

```typescript
{
  roundId: Id<"gameRoundStates">,
  walletAddress: string,
  betType: "self" | "refund",
  amount: number,           // SOL (converted from lamports)
  status: "pending" | "won" | "lost" | "refunded",
  betIndex: number,         // Index from BetPlaced event
  txSignature: string,      // Link back to blockchain
  onChainConfirmed: true,   // Always true for event-based bets
}
```

## Migration Path

### Phase 1: Dual Mode (Current) ✅
- Event listener runs every 3s (primary)
- PDA polling runs every 5s (fallback)
- Both write to same bets table
- Deduplication prevents conflicts

**Status**: IMPLEMENTED

### Phase 2: Event-Only (Recommended)
- Remove PDA polling cron
- Event listener is sole source of truth
- Monitor for missed events (none expected)

**Migration Command:**
```typescript
// convex/crons.ts
// Comment out or remove:
// crons.interval("blockchain-fetch-round-pdas", ...)
```

### Phase 3: Full Event Coverage (Future)
- Add GameCreated event listener
- Add GameLocked event listener
- Add WinnerSelected event listener
- Remove all PDA fetching

## Testing Strategy

### Local Testing

1. **Start local validator:**
   ```bash
   solana-test-validator
   ```

2. **Deploy program:**
   ```bash
   anchor deploy
   ```

3. **Run Convex dev:**
   ```bash
   bun run dev
   ```

4. **Place test bets:**
   ```bash
   anchor test
   ```

5. **Monitor event capture:**
   ```bash
   # Check Convex logs for:
   # "[Event Listener] Found X BetPlaced events"
   # "✓ [Event] Round X, Bet Y: ..."
   ```

### Verification Checklist

- [ ] BetPlaced events appear in blockchainEvents table
- [ ] Events processed into bets table within 3 seconds
- [ ] No duplicate bets (signature deduplication works)
- [ ] betIndex correctly captured from events
- [ ] Transaction signatures stored for verification
- [ ] Old PDA polling can be disabled without issues

### Monitoring

```typescript
// Query unprocessed events (should always be 0)
const unprocessed = await db
  .query("blockchainEvents")
  .withIndex("by_processed", q => q.eq("processed", false))
  .collect();

// Query recent events
const recentEvents = await db
  .query("blockchainEvents")
  .withIndex("by_event_name", q => q.eq("eventName", "BetPlaced"))
  .order("desc")
  .take(10);
```

## Cost Analysis

### PDA Polling (Old)
- **RPC Call**: `getProgramAccounts(GameRound)` every 5s
- **Cost**: ~1200 requests/hour × $0.0001 = $0.12/hour = $86/month
- **Scalability**: O(n) with bet count

### Event Listening (New)
- **RPC Call**: `getSignaturesForAddress(limit: 50)` every 3s
- **Cost**: ~1200 requests/hour × $0.00001 = $0.012/hour = $8.6/month
- **Scalability**: O(1) regardless of bet count

**Savings**: ~90% reduction in RPC costs

## Troubleshooting

### Events not appearing

**Check:**
1. Is the program emitting events? (Check Solana Explorer)
2. Is the event listener cron running? (Check Convex dashboard)
3. Are there RPC errors? (Check Convex logs)

**Fix:**
```typescript
// Increase transaction fetch limit
const betEvents = await solanaClient.getAllRecentBetEvents(100);
```

### Duplicate bets

**Should never happen** - signature deduplication prevents this.

**If it occurs:**
1. Check `isSignatureProcessed()` is working
2. Verify `by_signature` index exists
3. Check for race conditions in parallel processing

### Delayed processing

**Expected**: 3-6 seconds (event listener runs every 3s)
**If longer**: Check RPC endpoint latency

**Optimization:**
```typescript
// Reduce interval to 2s (higher RPC cost)
crons.interval("blockchain-event-listener", { seconds: 2 }, ...)
```

## Future Enhancements

### 1. WebSocket Event Streaming
Replace polling with real-time WebSocket subscriptions:

```typescript
// Solana supports logs subscription
const subscriptionId = connection.onLogs(
  DOMIN8_PROGRAM_ID,
  (logs) => {
    // Process events in real-time (<1s latency)
  }
);
```

**Benefits**: <1s latency, lower RPC costs
**Tradeoff**: Requires persistent connection

### 2. Event Replay System
Backfill historical events for analytics:

```typescript
async function replayEvents(startSlot: number, endSlot: number) {
  // Fetch all program transactions in range
  // Parse and store events
  // Process into database
}
```

**Use Case**: Data recovery, analytics, audits

### 3. Event Versioning
Handle event schema changes gracefully:

```typescript
{
  eventName: "BetPlaced",
  version: 2,  // Track schema version
  eventData: { ... }
}
```

## Conclusion

**Event-driven architecture is the correct approach** for Domin8 because:

1. ✅ **Reliable**: Events are atomic with blockchain state
2. ✅ **Cost-effective**: 90% reduction in RPC costs
3. ✅ **Scalable**: Performance independent of bet count
4. ✅ **Verifiable**: All events permanently stored on-chain
5. ✅ **Real-time**: 3s latency vs 5s+ with polling

**Recommendation**: Complete Phase 2 (disable PDA polling) after 24-48 hours of successful event-driven operation.
