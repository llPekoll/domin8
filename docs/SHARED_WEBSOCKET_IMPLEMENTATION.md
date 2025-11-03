# Shared WebSocket Implementation Plan

## Problem Statement

**Current Issue**: Each user creates their own WebSocket connection to the Solana RPC endpoint via `useActiveGame.ts`, causing:
- 429 "Too Many Requests" errors (rate limiting)
- N users = N WebSocket connections
- Unsustainable for mainnet scaling
- High RPC costs

**Example**: With 2 users in devnet, we're already hitting rate limits. With 100+ users on mainnet, this would be catastrophic.

## Solution Architecture

Implement a **Shared WebSocket Manager** using the Singleton pattern:
- **Single WebSocket connection** regardless of user count
- All users subscribe to the same connection
- Sub-second updates (~200-500ms) maintained
- Auto-connect when first user subscribes
- Auto-disconnect when last user leaves

### Benefits
- ✅ **Scalability**: 1000 users = 1 WebSocket connection
- ✅ **Performance**: Sub-second updates preserved
- ✅ **Cost**: Minimal RPC usage
- ✅ **Reliability**: No rate limiting issues

---

## Implementation Steps

### Step 1: Create Shared Subscription Manager

**File**: `src/lib/sharedGameSubscription.ts`

**Purpose**: Singleton class that manages a single WebSocket connection to the `active_game` PDA.

**Key Features**:
- Subscriber management with callback pattern
- Automatic connection lifecycle (connect on first subscriber, disconnect on last)
- Data caching for instant delivery to new subscribers
- Error handling per subscriber (one callback error doesn't break others)
- Debug logging for monitoring

**Exports**:
```typescript
class SharedGameSubscription {
  subscribe(callback: AccountUpdateCallback): () => void;
  getCurrentData(): AccountInfo<Buffer> | null;
  getSubscriberCount(): number;
}

export function getSharedGameSubscription(
  connection: Connection,
  activeGamePDA: PublicKey,
  program: Program
): SharedGameSubscription;

export function resetSharedGameSubscription(): void;
```

### Step 2: Update useActiveGame Hook

**File**: `src/hooks/useActiveGame.ts`

**Changes**:
1. Import `getSharedGameSubscription` from `../lib/sharedGameSubscription`
2. Remove direct `connection.onAccountChange()` call
3. Use shared subscription manager instead
4. Subscribe in `useEffect` with cleanup
5. Check for cached data on mount for instant display

**Before vs After**:
```typescript
// BEFORE: Each hook creates its own WebSocket
const subscriptionId = connection.onAccountChange(activeGamePDA, callback);

// AFTER: All hooks share one WebSocket
const sharedSub = getSharedGameSubscription(connection, activeGamePDA, program);
const unsubscribe = sharedSub.subscribe(callback);
```

### Step 3: Add Debug Component (Optional)

**File**: `src/components/DebugSharedSubscription.tsx`

**Purpose**: Monitor WebSocket health and subscriber count in development/production.

**Features**:
- Display current subscriber count
- Show WebSocket connection status
- Log stats every 3 seconds
- Can be toggled on/off via environment variable

---

## Detailed Implementation

### 1. Shared Subscription Manager

```typescript
// src/lib/sharedGameSubscription.ts

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { logger } from "./logger";

type AccountUpdateCallback = (accountInfo: AccountInfo<Buffer>) => void;

class SharedGameSubscription {
  private connection: Connection;
  private activeGamePDA: PublicKey;
  private program: Program;
  private subscriptionId: number | null = null;
  private subscribers: Set<AccountUpdateCallback> = new Set();
  private currentData: AccountInfo<Buffer> | null = null;
  private isConnecting: boolean = false;

  constructor(connection: Connection, activeGamePDA: PublicKey, program: Program) {
    this.connection = connection;
    this.activeGamePDA = activeGamePDA;
    this.program = program;
  }

  subscribe(callback: AccountUpdateCallback): () => void {
    this.subscribers.add(callback);

    // Send cached data immediately if available
    if (this.currentData) {
      try {
        callback(this.currentData);
      } catch (err) {
        logger.solana.error("[SharedSub] Callback error:", err);
      }
    }

    // Connect if first subscriber
    if (this.subscribers.size === 1 && !this.subscriptionId && !this.isConnecting) {
      void this.connect();
    }

    logger.solana.debug("[SharedSub] 📈 Subscriber added", {
      totalSubscribers: this.subscribers.size,
      hasWebSocket: !!this.subscriptionId,
    });

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);

      logger.solana.debug("[SharedSub] 📉 Subscriber removed", {
        totalSubscribers: this.subscribers.size,
      });

      // Disconnect if no more subscribers
      if (this.subscribers.size === 0) {
        this.disconnect();
      }
    };
  }

  getCurrentData(): AccountInfo<Buffer> | null {
    return this.currentData;
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  private async connect() {
    if (this.subscriptionId || this.isConnecting) return;

    this.isConnecting = true;

    try {
      logger.solana.debug("[SharedSub] 🔌 Connecting WebSocket...", {
        activeGamePDA: this.activeGamePDA.toBase58(),
        endpoint: this.connection.rpcEndpoint,
      });

      // Fetch current state first
      const accountInfo = await this.connection.getAccountInfo(this.activeGamePDA);
      if (accountInfo) {
        this.currentData = accountInfo;
        this.notifySubscribers(accountInfo);
      }

      // Setup WebSocket subscription
      this.subscriptionId = this.connection.onAccountChange(
        this.activeGamePDA,
        (accountInfo) => {
          this.currentData = accountInfo;
          this.notifySubscribers(accountInfo);
          
          logger.solana.debug("[SharedSub] 🔄 Game state updated", {
            dataLength: accountInfo.data.length,
            subscriberCount: this.subscribers.size,
          });
        },
        "confirmed"
      );

      logger.solana.debug("[SharedSub] ✅ WebSocket connected", {
        subscriptionId: this.subscriptionId,
        subscriberCount: this.subscribers.size,
      });
    } catch (error) {
      logger.solana.error("[SharedSub] ❌ Failed to connect:", error);
      this.subscriptionId = null;
    } finally {
      this.isConnecting = false;
    }
  }

  private disconnect() {
    if (this.subscriptionId === null) return;

    logger.solana.debug("[SharedSub] 🔌 Disconnecting WebSocket...", {
      subscriptionId: this.subscriptionId,
    });

    void this.connection.removeAccountChangeListener(this.subscriptionId);
    this.subscriptionId = null;

    logger.solana.debug("[SharedSub] ✅ WebSocket disconnected");
  }

  private notifySubscribers(accountInfo: AccountInfo<Buffer>) {
    for (const callback of this.subscribers) {
      try {
        callback(accountInfo);
      } catch (err) {
        logger.solana.error("[SharedSub] ❌ Subscriber callback error:", err);
      }
    }
  }
}

// Singleton instance
let sharedSubscriptionInstance: SharedGameSubscription | null = null;

export function getSharedGameSubscription(
  connection: Connection,
  activeGamePDA: PublicKey,
  program: Program
): SharedGameSubscription {
  if (!sharedSubscriptionInstance) {
    sharedSubscriptionInstance = new SharedGameSubscription(connection, activeGamePDA, program);
    logger.solana.debug("[SharedSub] 🆕 Created singleton instance");
  }
  return sharedSubscriptionInstance;
}

export function resetSharedGameSubscription() {
  sharedSubscriptionInstance = null;
  logger.solana.debug("[SharedSub] 🔄 Singleton reset");
}
```

### 2. Updated useActiveGame Hook

**Key Changes**:

```typescript
// Import shared subscription manager
import { getSharedGameSubscription } from "../lib/sharedGameSubscription";

// In useEffect (replace the entire subscription logic):
useEffect(() => {
  if (!program || !activeGamePDA || !connection) {
    // ... early return logic ...
    return;
  }

  // Get shared subscription manager
  const sharedSubscription = getSharedGameSubscription(connection, activeGamePDA, program);

  // Check for cached data
  const cachedData = sharedSubscription.getCurrentData();
  if (cachedData) {
    try {
      const decodedGameData = (program.coder.accounts as any).decode(
        "domin8Game",
        cachedData.data
      );
      setRawGameData(decodedGameData);
      setIsLoading(false);
    } catch (err) {
      logger.solana.error("[DOMIN8] Failed to decode cached data:", err);
    }
  }

  // Subscribe to updates
  const unsubscribe = sharedSubscription.subscribe((accountInfo) => {
    try {
      if (accountInfo.data.length > 0) {
        const decodedGameData = (program.coder.accounts as any).decode(
          "domin8Game",
          accountInfo.data
        );
        setRawGameData(decodedGameData);
        setIsLoading(false);
      } else {
        setRawGameData(null);
        setActiveGame(null);
        setIsLoading(false);
      }
    } catch (decodeError) {
      logger.solana.error("[DOMIN8] Failed to decode game data:", decodeError);
      setRawGameData(null);
      setActiveGame(null);
      setIsLoading(false);
    }
  });

  // Cleanup on unmount
  return () => {
    unsubscribe();
  };
}, [program?.programId.toString(), activeGamePDA?.toString(), connection]);
```

### 3. Debug Component (Optional)

```typescript
// src/components/DebugSharedSubscription.tsx

import { useEffect, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { getSharedGameSubscription } from "../lib/sharedGameSubscription";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import idl from "../../target/idl/domin8_prgm.json";

export function DebugSharedSubscription() {
  const { walletAddress, wallet } = usePrivyWallet();

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    return new Connection(rpcUrl, "confirmed");
  }, []);

  const program = useMemo(() => {
    if (!walletAddress || !wallet) return null;
    
    const walletAdapter = {
      publicKey: new PublicKey(walletAddress),
      signTransaction: async (tx: any) => wallet.signTransaction!(tx),
      signAllTransactions: async (txs: any[]) => {
        const signed = [];
        for (const tx of txs) signed.push(await wallet.signTransaction!(tx));
        return signed;
      },
    };

    return new Program(idl as any, { connection, wallet: walletAdapter } as any);
  }, [walletAddress, connection, wallet]);

  const activeGamePDA = useMemo(() => {
    if (!program) return null;
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("active_game")], program.programId);
    return pda;
  }, [program]);

  useEffect(() => {
    if (!program || !activeGamePDA) return;

    const shared = getSharedGameSubscription(connection, activeGamePDA, program);
    
    const interval = setInterval(() => {
      console.log("[Debug] Shared WebSocket Stats:", {
        subscriberCount: shared.getSubscriberCount(),
        hasCachedData: !!shared.getCurrentData(),
        timestamp: new Date().toISOString(),
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [program, activeGamePDA, connection]);

  return null; // No UI, just debugging
}
```

---

## Testing Plan

### Phase 1: Local Testing (Devnet)

1. **Single User Test**
   - [ ] User connects → WebSocket opens
   - [ ] User disconnects → WebSocket closes
   - [ ] Verify logs show 1 subscriber

2. **Multi-User Test (2 users)**
   - [ ] User 1 connects → WebSocket opens
   - [ ] User 2 connects → Same WebSocket used
   - [ ] Verify logs show 2 subscribers
   - [ ] User 1 disconnects → WebSocket stays open
   - [ ] User 2 disconnects → WebSocket closes
   - [ ] No 429 errors in network tab

3. **Hot Reload Test**
   - [ ] Connect user
   - [ ] Trigger hot reload (save file)
   - [ ] Verify old subscription cleaned up
   - [ ] Verify new subscription works

4. **Cached Data Test**
   - [ ] User 1 connects and receives data
   - [ ] User 2 connects
   - [ ] Verify User 2 gets instant data (cached)
   - [ ] Check logs for "Using cached data"

### Phase 2: Performance Testing

1. **Update Latency**
   - [ ] Place bet in game
   - [ ] Measure time until UI updates
   - [ ] Should be <1 second

2. **Connection Monitoring**
   - [ ] Add DebugSharedSubscription component
   - [ ] Monitor for 10 minutes
   - [ ] Verify subscriber count accuracy
   - [ ] Check for any connection drops

3. **Error Handling**
   - [ ] Disconnect internet
   - [ ] Reconnect internet
   - [ ] Verify graceful reconnection
   - [ ] Check error logs

### Phase 3: Load Testing (Pre-Mainnet)

1. **Simulate 10+ Users**
   - [ ] Open 10 browser tabs
   - [ ] Each tab = different wallet
   - [ ] Verify only 1 WebSocket connection
   - [ ] Monitor RPC metrics

2. **Stress Test**
   - [ ] Rapid connect/disconnect cycles
   - [ ] Verify no memory leaks
   - [ ] Check for subscription cleanup

---

## Rollout Strategy

### Step 1: Implementation (Dev Branch)
- Create `sharedGameSubscription.ts`
- Update `useActiveGame.ts`
- Add debug component
- Test locally with 2 users

### Step 2: Testing (Dev Branch)
- Run all Phase 1 tests
- Verify no regressions
- Test with existing gameplay

### Step 3: Devnet Deployment
- Deploy to devnet
- Monitor with 2-5 real users
- Check RPC usage metrics
- Verify no 429 errors

### Step 4: Performance Validation
- Run Phase 2 tests
- Measure update latency
- Compare vs. old implementation

### Step 5: Pre-Mainnet Load Testing
- Simulate 20+ users
- Run stress tests
- Monitor for 24 hours

### Step 6: Mainnet Deployment
- Merge to main
- Deploy to production
- Monitor RPC metrics
- Keep debug component enabled initially

---

## Success Metrics

### Must Have
- ✅ Zero 429 errors with multiple users
- ✅ Sub-second update latency maintained
- ✅ Single WebSocket connection regardless of user count
- ✅ No memory leaks over 24 hours

### Nice to Have
- ✅ <500ms average update latency
- ✅ Zero connection drops in 24 hours
- ✅ Cached data delivered <50ms to new subscribers

---

## Rollback Plan

If issues arise:

1. **Quick Rollback**
   - Revert `useActiveGame.ts` to previous version
   - Remove `sharedGameSubscription.ts` import
   - Falls back to per-user WebSocket (with rate limits)

2. **Gradual Rollback**
   - Add feature flag: `VITE_USE_SHARED_WEBSOCKET`
   - Toggle between implementations
   - Test in production with subset of users

---

## Monitoring & Maintenance

### Key Metrics to Watch

1. **RPC Metrics**
   - WebSocket connection count (should be 1)
   - Request rate (should be dramatically lower)
   - 429 error rate (should be 0)

2. **Application Metrics**
   - Subscriber count (via debug component)
   - Update latency (time from blockchain event to UI update)
   - Connection uptime

3. **Error Tracking**
   - Failed subscriptions
   - Decode errors
   - Callback errors

### Log Messages to Monitor

```
[SharedSub] 🆕 Created singleton instance  → First user connected
[SharedSub] 📈 Subscriber added            → User subscribed
[SharedSub] 📉 Subscriber removed          → User unsubscribed
[SharedSub] 🔌 Connecting WebSocket...     → Opening connection
[SharedSub] ✅ WebSocket connected         → Connection established
[SharedSub] 🔌 Disconnecting WebSocket...  → Closing connection
[SharedSub] 🔄 Game state updated          → Real-time update received
```

---

## Future Enhancements

1. **Reconnection Strategy**
   - Auto-reconnect on connection loss
   - Exponential backoff
   - Max retry attempts

2. **Multi-Account Support**
   - Share WebSocket across multiple game accounts
   - Separate subscriptions for different PDAs

3. **Health Checks**
   - Periodic ping to verify connection
   - Alert on stale data

4. **Performance Optimization**
   - Batch updates if multiple changes in <100ms
   - Debounce UI updates

---

## References

- Original issue: 429 "Too Many Requests" errors
- Architecture inspiration: risk.fun's `useJackpot.ts` (lines 108-273)
- Current implementation: `src/hooks/useActiveGame.ts`
- Solana WebSocket docs: https://docs.solana.com/api/websocket

---

## Contact & Support

For questions or issues during implementation:
- Check console logs with `[SharedSub]` prefix
- Review subscriber count in DebugSharedSubscription
- Monitor RPC endpoint metrics
- Check Solana RPC status page for provider issues
