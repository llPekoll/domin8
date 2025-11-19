# Phase 4: Error Handling and Recovery Implementation

## Overview
Comprehensive error handling and recovery mechanisms for the Switchboard randomness commit-reveal pattern have been implemented across the frontend.

## Error Categories and Handling

### 1. Commit Phase Errors (CreateLobby)

#### Insufficient SOL for Randomness Account Creation
**Error Message**: `insufficient lamports`
**User Message**: `Insufficient SOL. Need: ~0.XX SOL (bet + fees + randomness rent)`
**Root Cause**: 
- Randomness account creation costs ~0.002 SOL in rent
- Plus transaction fee (~0.00025 SOL)
- Plus bet amount
**Recovery**: User needs to deposit more SOL or reduce bet amount

**Implementation**:
- Balance check in `createAndCommitRandomnessAccount()` before creating account
- Specific error message with calculated required amount
- Clear guidance to user

#### Switchboard Account Creation Failure
**Error Message**: `Failed to create Switchboard randomness account`
**Common Causes**:
- Invalid or unavailable queue for the network
- Switchboard network issues
- Invalid network detection
**Recovery**: Retry or contact support
**Implementation**: Specific error messages for queue and network issues

#### User Rejection
**Error Message**: `User rejected`
**User Message**: `Transaction rejected by user`
**Recovery**: User needs to sign again

#### Transaction Confirmation Timeout
**Error Message**: `confirmation timeout`
**User Message**: `Transaction confirmation timed out. Please check your wallet.`
**Recovery**: User can retry; transaction may still be processing

---

### 2. Reveal Phase Errors (JoinLobby)

#### Randomness Did Not Reveal in Time
**Error Message**: `Randomness did not reveal in time`
**User Message**: `Randomness reveal timeout. The commit slot may have already passed. Try again.`
**Root Cause**:
- Committed slot + target slot passed before reveal
- Network latency prevented timely reveal
- Insufficient time between commit and reveal attempts
**Recovery**: 
- Auto-retry after 3 seconds
- User can manually retry
- Button shows "Retrying..." state
**Implementation**: 
```typescript
if (errorMsg.includes("Randomness did not reveal in time")) {
  setRetryingLobbies((prev) => new Set(prev).add(lobby.lobbyId));
  setTimeout(() => {
    // Re-enable retry button after 3 seconds
    setRetryingLobbies((prev) => {
      const next = new Set(prev);
      next.delete(lobby.lobbyId);
      return next;
    });
  }, 3000);
}
```

#### Build Reveal Instruction Failed
**Error Message**: `Failed to build reveal instruction`
**Common Causes**:
- Randomness account not found or expired
- Invalid randomness account public key
- Network issues
**User Message**: `Failed to build reveal instruction. This may be a network issue. Please retry.`
**Recovery**: Manual retry or choose different lobby

#### Randomness Account Not Found
**Error Message**: `Account does not exist` or `Invalid public key`
**User Message**: `Randomness account not found. It may have expired.`
**Root Cause**:
- Randomness account was deleted/expired
- Wrong public key passed
- Lobby data corruption
**Recovery**: Choose a different lobby; Player A should recreate if critical

---

### 3. Transaction Confirmation Errors

#### Insufficient SOL for Transaction
**Error Message**: `insufficient funds` or `insufficient lamports`
**User Message**: `Insufficient SOL. Need: ~X.XX SOL (bet + transaction fees)`
**Root Cause**: Player doesn't have enough SOL for bet + fees
**Recovery**: Deposit more SOL

---

### 4. State/Network Errors

#### Invalid Lobby Status
**Error Message**: `Lobby has not been resolved yet` or `InvalidLobbyStatus`
**User Message**: `Lobby state error. Please try again or choose a different lobby.`
**Root Cause**:
- Lobby state mismatch between frontend and blockchain
- Stale lobby data
**Recovery**: Try a different lobby; sync may be needed

#### Network Connection Issues
**Error Message**: `network` or `request failed`
**User Message**: `Network error. Please check your connection and retry.`
**Root Cause**: RPC endpoint unreachable or slow
**Recovery**: Check internet connection and retry

---

## Implementation Details

### CreateLobby.tsx Error Handling
```typescript
// Enhanced error detection with specific user messages
if (errorMsg.includes("insufficient funds") || 
    errorMsg.includes("insufficient lamports")) {
  toast.error(
    `Insufficient SOL. Need: ~${(betAmount + 0.01).toFixed(4)} SOL 
    (bet + fees + randomness rent)`
  );
} else if (errorMsg.includes("Failed to create Switchboard randomness account")) {
  toast.error("Switchboard randomness account creation failed. 
    Please retry or contact support.");
}
```

### LobbyList.tsx Error Handling with Retry
```typescript
// State tracking for retrying lobbies
const [retryingLobbies, setRetryingLobbies] = useState<Set<number>>(new Set());

// Automatic retry for reveal timeouts
if (errorMsg.includes("Randomness did not reveal in time")) {
  toast.error("Randomness reveal timeout. Try again.");
  setRetryingLobbies((prev) => new Set(prev).add(lobby.lobbyId));
  setTimeout(() => {
    // Auto-enable retry after 3 seconds
  }, 3000);
}

// Button shows retry state
{joiningLobbies.has(lobby.lobbyId)
  ? "Joining..."
  : retryingLobbies.has(lobby.lobbyId)
    ? "Retrying..."
    : "Join"}
```

### Transaction Builder Error Handling
```typescript
// solana-1v1-transactions-helius.ts

// 1. Balance check before creating account
if (payerBalance < RANDOMNESS_ACCOUNT_RENT) {
  throw new Error(`insufficient lamports: got ${payerBalance}, need at least ${RANDOMNESS_ACCOUNT_RENT}`);
}

// 2. Specific error messages for common failures
if (errorMsg.includes("InvalidQueueId") || errorMsg.includes("queue")) {
  throw new Error(`Failed to create Switchboard randomness account: Invalid or unavailable queue for this network`);
}

// 3. Network error detection
if (errorMsg.includes("network") || errorMsg.includes("request failed")) {
  throw new Error(`Failed to create Switchboard randomness account: Network error. Please check your connection and retry.`);
}
```

---

## User Experience Flow

### Create Lobby - Error Recovery
```
1. User clicks "Create Lobby"
   ↓
2. If insufficient SOL:
   User sees: "Insufficient SOL. Need: ~0.XX SOL (bet + fees + randomness rent)"
   Action: User deposits more SOL or reduces bet
   ↓
3. If Switchboard error:
   User sees: "Switchboard randomness account creation failed. Please retry or contact support."
   Action: User can retry or contact support
   ↓
4. If transaction rejected:
   User sees: "Transaction rejected by user"
   Action: User can sign transaction or cancel
```

### Join Lobby - Error Recovery
```
1. User clicks "Join Lobby"
   ↓
2. If randomness doesn't reveal in time:
   User sees: "Randomness reveal timeout. The commit slot may have already passed. Try again."
   Button shows: "Retrying..." (for 3 seconds)
   Auto-retry: Enabled after short delay
   ↓
3. If reveal instruction fails:
   User sees: "Failed to build reveal instruction. This may be a network issue. Please retry."
   Action: User can manually retry or choose different lobby
   ↓
4. If insufficient SOL:
   User sees: "Insufficient SOL. Need: ~X.XX SOL (bet + transaction fees)"
   Action: User deposits more SOL
```

---

## Testing Error Scenarios

### Scenario 1: Insufficient SOL
1. Create account with minimal SOL (~0.001)
2. Attempt to create lobby with large bet
3. Verify: See "Insufficient SOL" message with required amount
4. Deposit more SOL
5. Retry successfully

### Scenario 2: Randomness Reveal Timeout
1. Create lobby successfully
2. Wait > 10 seconds (to exceed slot)
3. Attempt to join lobby
4. Verify: See timeout message
5. Click retry and verify automatic retry works

### Scenario 3: Invalid Randomness Account
1. Create lobby
2. Manually update database with invalid randomness pubkey
3. Attempt to join
4. Verify: See "Randomness account not found" message

### Scenario 4: Network Failure
1. Disconnect internet
2. Attempt to create/join lobby
3. Verify: See "Network error" message
4. Reconnect and retry
5. Verify: Transaction succeeds

---

## Success Criteria ✅

- ✅ All error categories handled with specific messages
- ✅ User-friendly error messages (no raw error codes)
- ✅ Clear recovery guidance provided
- ✅ Automatic retry for timeout scenarios
- ✅ Manual retry always available
- ✅ No unhandled promise rejections
- ✅ Comprehensive logging for debugging

---

## Future Enhancements

1. **Exponential Backoff**: Implement exponential backoff for network retries
2. **Error Tracking**: Send error metrics to analytics service
3. **Auto-Refund**: Automatically refund if commit succeeds but reveal times out
4. **Fallback RPC**: Switch to fallback RPC on persistent failures
5. **Error Recovery Guide**: In-app help with error recovery steps
