# Switchboard Randomness Integration Plan

## Current State Analysis

### What's Working
- ✅ `join_lobby.rs` instruction correctly calls `get_value(&clock)` 
- ✅ Randomness account is stored in lobby state
- ✅ Winner determination logic is correct (randomness % 2)

### What's Missing (Critical Issues)

The frontend currently **does not implement the Switchboard commit-reveal pattern**. According to Switchboard documentation, there are 3 required phases:

1. **Commit Phase**: Request randomness and commit to a future slot
2. **Wait Phase**: Wait for the committed slot to pass
3. **Reveal Phase**: Reveal the randomness before using it

Currently, the frontend just derives an address without actually interacting with Switchboard.

---

## Program Changes Required

### ❌ NO PROGRAM CHANGES NEEDED

According to Switchboard documentation, the **on-chain program does NOT make CPI calls** to Switchboard for randomness. Instead:

1. **Switchboard Instructions are executed OFF-CHAIN or by the frontend**:
   - `Randomness.create()` - Creates randomness account
   - `commitIx()` - Commits to the oracle (frontend builds this)
   - `revealIx()` - Reveals the randomness (frontend builds this)

2. **The on-chain program only**:
   - **Reads** from the randomness account data using `RandomnessAccountData::parse()`
   - **Validates** that the randomness has been revealed (`seed_slot != clock.slot - 1`)
   - **Uses** the revealed value with `get_value(&clock)`

3. **Your program is already correctly implemented**:
   - ✅ `create_lobby.rs` - Stores randomness account reference
   - ✅ `join_lobby.rs` - Reads and validates randomness data
   - ✅ Uses `get_value(&clock)` correctly (just fixed this)

### Current Program Flow

```
Frontend: Create randomness account + commitIx
           ↓
Frontend: Send transaction with [commitIx, createLobbyIx]
           ↓
On-Chain: create_lobby stores randomness_account reference
           ↓
Frontend: Wait for slot to pass
           ↓
Frontend: Build revealIx
           ↓
Frontend: Send transaction with [revealIx, joinLobbyIx]
           ↓
On-Chain: join_lobby reads randomness, validates it's revealed, uses it
```

**Therefore: ALL changes are frontend-only. The Rust program needs NO modifications.**

---

### Phase 1: Frontend Setup (solana-1v1-transactions-helius.ts)

#### Step 1.1: Add Switchboard Dependencies
- Import `@switchboard-xyz/on-demand` SDK
- Import `RandomnessAccountData` type
- Create utility to initialize Switchboard program instance

#### Step 1.2: Create Randomness Management Functions

**Function: `createAndCommitRandomnessAccount()`**
- Creates a new Keypair for randomness account
- Calls Switchboard to create the account
- Commits to the oracle with `commitIx`
- Returns randomness account and its public key
- **Used by**: `buildCreateLobbyTransactionOptimized()`

**Function: `revealRandomness()`**
- Fetches the randomness account
- Calls Switchboard `revealIx` 
- Executes the reveal instruction
- Waits for confirmation
- **Used by**: Before calling `buildJoinLobbyTransactionOptimized()`

**Function: `waitForRandomnessRevealed()`**
- Polls the randomness account
- Checks if `seed_slot != clock.slot` (revealed condition)
- Has configurable timeout
- **Used by**: Between commit and reveal phases

#### Step 1.3: Update Transaction Builders

**`buildCreateLobbyTransactionOptimized()`**
- Generate randomness account keypair
- Create randomness account via Switchboard
- Add `commitIx` to instructions before create_lobby
- Returns transaction with: `[commitIx, createLobbyIx]`
- Store randomness account keypair for later reveal

**`buildJoinLobbyTransactionOptimized()`**
- Accept optional `revealIx` parameter
- If provided, prepend reveal instruction: `[revealIx, joinLobbyIx]`
- Ensures randomness is revealed before join_lobby executes

---

### Phase 2: Frontend Components (CreateLobby.tsx)

#### Step 2.1: Modify Create Lobby Flow

**Current flow:**
```
User clicks Create → Build transaction → Sign & Send → Done
```

**New flow:**
```
User clicks Create 
  → Generate randomness account 
  → Build transaction with commit instruction
  → Sign & Send 
  → Wait for confirmation
  → Store randomness account pubkey in database
  → Tell user "Waiting for Player B to join"
```

#### Step 2.2: Update State Management
- Add state: `randomnessAccountPubkey`
- Add state: `randomnessAccountKeypair` (local only, serialized for storage)
- Store these in Convex database when lobby is created

#### Step 2.3: Update Convex Action
**`lobbies.createLobby` mutation:**
- Accept `randomnessAccountPubkey` parameter
- Store in lobby record for later retrieval

---

### Phase 3: Backend Coordination (JoinLobby Component)

#### Step 3.1: Retrieve Randomness Info
When joining a lobby:
1. Fetch lobby data (includes `randomnessAccountPubkey`)
2. Fetch randomness account from chain
3. Check if it's revealed (poll if necessary)

#### Step 3.2: Create Join Transaction
- Build `revealIx` from stored randomness pubkey
- Wait for randomness to be revealed
- Build join_lobby transaction with reveal instruction

#### Step 3.3: Handle Timing Issues
- If randomness not yet revealed: 
  - Show "Waiting for randomness..." message
  - Auto-retry every 2 seconds
  - 60-second timeout
- If already revealed:
  - Proceed to join immediately

---

### Phase 4: Error Handling & Recovery

#### Step 4.1: Commit Phase Failures
- If commit fails: User can retry (transaction not confirmed yet)
- If commit succeeds but Player B joins too fast: Reveal will catch the error

#### Step 4.2: Reveal Phase Failures
- If reveal fails: Attempt retry
- If randomness never reveals: Show error after timeout
- Provide user option to cancel lobby and get refund

#### Step 4.3: Switchboard Account Issues
- Invalid/expired randomness account: Clear and show error
- Insufficient SOL for randomness account creation: Show "Insufficient funds"
- Network issues: Retry with exponential backoff

---

### Phase 5: Testing Strategy

#### Test 1: Happy Path
1. Create lobby with randomness
2. Wait for commit confirmation
3. Join lobby with reveal instruction
4. Verify winner is determined correctly

#### Test 2: Edge Cases
- Join before randomness revealed (should fail gracefully)
- Multiple concurrent lobbies
- Network timeout during reveal
- Cancel lobby after commitment

#### Test 3: Stress Testing
- Rapid lobby creation
- Rapid joins
- Multiple randomness accounts simultaneously

---

## Technical Details

### Switchboard Queue ID
- **Mainnet**: `A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w`
- **Devnet**: `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7`
- **Network**: `import.meta.env.VITE_SOLANA_NETWORK`

### Switchboard Program IDs
- **Mainnet**: `SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv`
- **Devnet**: `Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`

### Account Creation Cost
- Randomness account creation: ~0.002 SOL (rent) + network fee
- Should be covered by player's bet or separate fund

---

## Files to Modify

### Frontend Only (No Program Changes)

1. **src/lib/solana-1v1-transactions-helius.ts** ⭐ MAIN FILE
   - Add Switchboard SDK imports
   - Create `createAndCommitRandomnessAccount()`
   - Create `revealRandomness()`
   - Create `waitForRandomnessRevealed()`
   - Update `buildCreateLobbyTransactionOptimized()` to include commit
   - Update `buildJoinLobbyTransactionOptimized()` to accept revealIx

2. **src/components/onevone/CreateLobby.tsx**
   - Add randomness state management
   - Update create lobby handler to store randomness pubkey
   - Pass randomness pubkey to Convex action

3. **convex/lobbies.ts**
   - Update `createLobby` mutation to accept and store randomness pubkey

4. **src/components/onevone/JoinLobby.tsx** (new or existing)
   - Fetch randomness account before building join transaction
   - Handle reveal instruction
   - Implement retry logic for unrevealed randomness

### ✅ NO CHANGES NEEDED
- `programs/domin8_1v1_prgm/src/instructions/create_lobby.rs` - Already correct
- `programs/domin8_1v1_prgm/src/instructions/join_lobby.rs` - Already correct (just fixed `get_value(&clock)`)
- `programs/domin8_1v1_prgm/src/` - No CPI calls needed to Switchboard

---

## Success Criteria

✅ Randomness account is created and committed when lobby is created
✅ Reveal instruction is executed before join_lobby
✅ Winner is correctly determined using revealed randomness
✅ Error handling for all edge cases
✅ User receives clear feedback at each step
✅ Transaction simulation no longer fails with AccountNotFound

---

## Implementation Order

1. **First**: Core Switchboard functions in helius.ts
2. **Second**: Update CreateLobby.tsx to use new functions
3. **Third**: Update Convex backend to store randomness pubkey
4. **Fourth**: Implement JoinLobby randomness reveal flow
5. **Fifth**: Add comprehensive error handling
6. **Sixth**: Test all scenarios
