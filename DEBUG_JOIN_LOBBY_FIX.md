# Join Lobby Transaction Simulation Fix

## Problem
When attempting to join a lobby, the transaction simulation was failing with:
```
SolanaError: Transaction simulation failed
```

## Root Cause
The `buildJoinLobbyTransaction` function was missing several required accounts that are added by the `#[vrf]` macro in the Rust instruction context. The IDL for the `join_lobby` instruction shows it requires:

1. `config` - Writable config PDA ✓ (was provided)
2. `lobby` - Writable lobby PDA ✓ (was provided)
3. `player_b` - Writable signer ✓ (was provided)
4. `player_a` - Writable player A account ✓ (was provided)
5. `oracle_queue` - Writable oracle queue ✓ (was provided, but wrong address)
6. `system_program` - System program ✓ (was provided)
7. `program_identity` - PDA derived from VRF program ✗ (MISSING)
8. `vrf_program` - MagicBlock VRF program ✗ (MISSING)
9. `slot_hashes` - Sysvar account ✗ (MISSING)

Additionally, the oracle queue address was incorrect.

## Changes Made

### File: `src/lib/solana-1v1-transactions.ts`

#### 1. Corrected Oracle Queue Address
```typescript
// OLD (incorrect address):
const ORACLE_QUEUE = new PublicKey("uPeRMDfPmrPqgRWSrjAnAkH78ZG3ktNQ8M6yDUhpACp");

// NEW (from IDL):
const ORACLE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
```

#### 2. Added Missing VRF Accounts
```typescript
// MagicBlock VRF program and related accounts (added by #[vrf] macro)
const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");

// Derive program_identity PDA for the VRF program
const [programIdentity] = PublicKey.findProgramAddressSync(
  [Buffer.from("identity")],
  VRF_PROGRAM
);
```

#### 3. Updated Instruction Accounts
```typescript
const joinLobbyIx = await program.methods
  .joinLobby(new BN(lobbyAmount), characterB, positionB)
  .accounts({
    config: configPda,
    lobby: lobbyPda,
    playerB,
    playerA,
    oracleQueue: ORACLE_QUEUE,
    systemProgram: SystemProgram.programId,
    programIdentity,      // NEW
    vrfProgram: VRF_PROGRAM, // NEW
    slotHashes: SLOT_HASHES,  // NEW
  } as any)
  .instruction();
```

## Account References

| Account | Address | Purpose |
|---------|---------|---------|
| Oracle Queue | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` | MagicBlock VRF oracle queue on Devnet |
| VRF Program | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` | MagicBlock Ephemeral VRF program |
| Program Identity | Derived PDA with seed `["identity"]` | VRF program's identity account |
| Slot Hashes | `SysvarS1otHashes111111111111111111111111111` | Solana system account for recent slot hashes |

## Testing
After this fix, the `join_lobby` transaction should:
1. ✓ Pass transaction simulation
2. ✓ Successfully sign with Privy wallet
3. ✓ Execute on-chain, invoking the MagicBlock VRF callback mechanism
4. ✓ Update the lobby status to `1` (AWAITING_VRF)
5. ✓ Automatically transition to `2` (RESOLVED) when MagicBlock fulfills the randomness request

## Related Files Modified
- `src/lib/solana-1v1-transactions.ts` - Updated `buildJoinLobbyTransaction()`
