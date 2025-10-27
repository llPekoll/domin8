# Localnet Testing Guide with Mock VRF

This guide explains how to test the Domin8 program on localnet using mock VRF instead of ORAO VRF.

## Overview

Since ORAO VRF is not available on localnet, we've implemented a mock VRF system that simulates the randomness fulfillment process. This allows you to test the complete game flow locally before deploying to devnet/mainnet.

## Key Differences: Localnet vs Production

| Feature | Production (devnet/mainnet) | Localnet (with `localnet` feature) |
|---------|---------------------------|-------------------------------------|
| VRF Provider | ORAO VRF (external oracle) | Mock VRF (manual fulfillment) |
| VRF Account | Created by ORAO program | Created as MockVrfAccount PDA |
| Randomness Fulfillment | Automatic (ORAO fulfills) | Manual (call `fulfill_mock_vrf`) |
| VRF Fee | Charged by ORAO (~0.0001 SOL) | No VRF fee |
| Accounts in create_game | vrf_program, network_state, treasury, vrf_request | mock_vrf |

## Building for Localnet

### 1. Build with the `localnet` feature flag

```bash
# From workspace root
anchor build -- --features localnet
```

This compiles the program with conditional compilation flags that:
- Skip ORAO VRF CPI calls
- Create MockVrfAccount instead of ORAO VRF request
- Use mock randomness reader in select_winner_and_payout

### 2. Update Anchor.toml (if needed)

Make sure your `Anchor.toml` points to localnet:

```toml
[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"
```

### 3. Deploy to localnet

```bash
# Start local validator (in separate terminal)
solana-test-validator

# Deploy program
anchor deploy
```

## Testing Game Flow on Localnet

### Step 1: Initialize the Program

```bash
anchor run initialize
```

### Step 2: Create a Game (First Player Bets)

When calling `create_game` on localnet, pass the `mock_vrf` account instead of ORAO VRF accounts:

```typescript
// Example: Create game with first bet
const seed = gameConfig.force; // Current force from config
const [mockVrfPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("mock_vrf"), Buffer.from(seed)],
  program.programId
);

await program.methods
  .createGame(new BN(0.1 * LAMPORTS_PER_SOL))
  .accounts({
    config: configPDA,
    counter: counterPDA,
    gameRound: gameRoundPDA,
    betEntry: betEntryPDA,
    vault: vaultPDA,
    player: player.publicKey,
    mockVrf: mockVrfPDA, // Use mock_vrf instead of ORAO accounts
    systemProgram: SystemProgram.programId,
  })
  .signers([player])
  .rpc();
```

✓ This creates the game and initializes a MockVrfAccount with `fulfilled = false`

### Step 3: Additional Players Place Bets

```bash
# Place more bets using place_bet instruction
anchor run place-bet
```

### Step 4: Close Betting Window

```bash
# After betting window expires (30 seconds)
anchor run close-betting
```

✓ Game status changes to `AwaitingWinnerRandomness`

### Step 5: **Fulfill Mock VRF (MANUAL STEP - LOCALNET ONLY)**

This is the key difference from production! You must manually fulfill randomness:

```typescript
// Get the mock VRF account
const [mockVrfPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("mock_vrf"), Buffer.from(gameRound.vrfSeed)],
  program.programId
);

// Fulfill with a random u64 value
const randomValue = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

await program.methods
  .fulfillMockVrf(new BN(randomValue))
  .accounts({
    counter: counterPDA,
    gameRound: gameRoundPDA,
    mockVrf: mockVrfPDA,
    config: configPDA,
    fulfiller: anyWallet.publicKey, // Any wallet can fulfill on localnet
  })
  .signers([anyWallet])
  .rpc();

console.log("✓ Mock VRF fulfilled with randomness:", randomValue);
```

**Note:** In production, ORAO fulfills this automatically during the 30-second waiting period.

### Step 6: Select Winner and Payout

Now that randomness is fulfilled, call select_winner_and_payout:

```typescript
await program.methods
  .selectWinnerAndPayout()
  .accounts({
    counter: counterPDA,
    gameRound: gameRoundPDA,
    config: configPDA,
    vault: vaultPDA,
    crank: crankAuthority.publicKey,
    mockVrf: mockVrfPDA, // Use mock_vrf instead of vrf_request
    treasury: treasuryPubkey,
    systemProgram: SystemProgram.programId,
  })
  .remainingAccounts(playerWallets) // Pass all player wallet accounts
  .signers([crankAuthority])
  .rpc();
```

✓ Winner selected using mock randomness
✓ Payouts distributed
✓ Game finished

## Mock VRF Account Structure

```rust
pub struct MockVrfAccount {
    pub seed: [u8; 32],           // VRF seed from game
    pub randomness: [u8; 64],     // Fulfilled randomness (matches ORAO format)
    pub fulfilled: bool,           // Whether fulfilled
    pub fulfilled_at: i64,         // Timestamp of fulfillment
}
```

Seeds: `[b"mock_vrf", vrf_seed]`

## Testing Scripts

### Example: Complete Test Script

```typescript
// tests/localnet-mock-vrf.test.ts
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Localnet Mock VRF Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Domin8Prgm as Program<any>;

  it("Complete game flow with mock VRF", async () => {
    // 1. Initialize
    await program.methods.initialize(treasury).rpc();

    // 2. Create game (first bet)
    const config = await program.account.gameConfig.fetch(configPDA);
    const [mockVrfPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("mock_vrf"), Buffer.from(config.force)],
      program.programId
    );

    await program.methods
      .createGame(new BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({ mockVrf: mockVrfPDA /* ... */ })
      .rpc();

    // 3. Place more bets
    // ... (use place_bet instruction)

    // 4. Close betting
    await program.methods.closeBettingWindow().rpc();

    // 5. FULFILL MOCK VRF (localnet only!)
    const randomness = new BN(Math.floor(Math.random() * 1000000));
    await program.methods
      .fulfillMockVrf(randomness)
      .accounts({ mockVrf: mockVrfPDA /* ... */ })
      .rpc();

    console.log("✓ Mock VRF fulfilled");

    // 6. Select winner
    await program.methods
      .selectWinnerAndPayout()
      .accounts({ mockVrf: mockVrfPDA /* ... */ })
      .rpc();

    console.log("✓ Winner selected!");
  });
});
```

## Switching to Production

When ready to deploy to devnet/mainnet:

### 1. Build WITHOUT the localnet feature

```bash
anchor build
```

This compiles the production version with ORAO VRF integration.

### 2. Update Anchor.toml

```toml
[provider]
cluster = "Devnet"  # or "Mainnet"
```

### 3. Update client code

Remove mock VRF references and use ORAO VRF accounts:

```typescript
// Production: Pass ORAO VRF accounts
await program.methods
  .createGame(amount)
  .accounts({
    vrfProgram: ORAO_VRF_PROGRAM_ID,
    networkState: oraoNetworkStatePDA,
    treasury: oraoTreasuryPDA,
    vrfRequest: vrfRequestPDA,
    // ... no mockVrf
  })
  .rpc();

// No need to call fulfill_mock_vrf - ORAO does this automatically!

// Use vrf_request in select_winner_and_payout
await program.methods
  .selectWinnerAndPayout()
  .accounts({
    vrfRequest: vrfRequestPDA, // Not mockVrf
    // ...
  })
  .rpc();
```

## Common Issues

### Issue: "Unknown instruction: fulfill_mock_vrf"

**Cause:** Program was built without `--features localnet`

**Fix:** 
```bash
anchor build -- --features localnet
anchor deploy
```

### Issue: Mock VRF account not found

**Cause:** Incorrect seed derivation

**Fix:** Make sure you're using the game's `vrf_seed` (stored in GameRound):
```typescript
const gameRound = await program.account.gameRound.fetch(gameRoundPDA);
const [mockVrfPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("mock_vrf"), Buffer.from(gameRound.vrfSeed)],
  program.programId
);
```

### Issue: "Randomness not yet fulfilled"

**Cause:** Forgot to call `fulfill_mock_vrf` before `select_winner_and_payout`

**Fix:** Always fulfill mock VRF after closing betting window and before selecting winner

## Benefits of This Approach

1. **Fast Iteration**: Test complete game flow locally without waiting for ORAO
2. **No External Dependencies**: No need for ORAO VRF on localnet
3. **Cost-Free Testing**: No VRF fees during development
4. **Same Code Path**: Winner selection logic is identical to production
5. **Easy Debugging**: Full control over randomness values for testing edge cases

## Production Deployment Checklist

Before deploying to devnet/mainnet:

- [ ] Build without `localnet` feature: `anchor build`
- [ ] Remove all `fulfill_mock_vrf` calls from client code
- [ ] Replace `mockVrf` accounts with ORAO VRF accounts
- [ ] Test on devnet first with real ORAO VRF
- [ ] Verify force rotation is working correctly
- [ ] Confirm ORAO VRF fee is being charged

## Summary

**Localnet Flow:**
1. create_game → Creates MockVrfAccount (fulfilled=false)
2. place_bet → Add more players
3. close_betting_window → Status = AwaitingWinnerRandomness
4. **fulfill_mock_vrf** → Manual fulfillment (localnet only!)
5. select_winner_and_payout → Read mock randomness, select winner

**Production Flow:**
1. create_game → ORAO VRF request (auto-fulfills in ~30 sec)
2. place_bet → Add more players
3. close_betting_window → Status = AwaitingWinnerRandomness
4. ~~fulfill_mock_vrf~~ → (Skip - ORAO handles this!)
5. select_winner_and_payout → Read ORAO randomness, select winner

---

**Happy Testing! 🎲**
