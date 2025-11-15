# Phase 3 Quick Reference

## What's Available Now

### Queries (Use in Frontend)
```typescript
// Get all lobbies waiting for a second player
const lobbies = await convex.query(api.lobbies.getOpenLobbies);

// Get a specific lobby by ID (for polling during fights)
const lobby = await convex.query(api.lobbies.getLobbyState, { lobbyId: 5 });

// Get all lobbies for a player (as Player A or B)
const myLobbies = await convex.query(api.lobbies.getPlayerLobbies, {
  playerWallet: "wallet_address_base58"
});
```

### Mutations (For DB Updates)
```typescript
// After frontend calls createLobby action and gets success
await convex.mutation(api.lobbies.createLobbyMutation, {
  lobbyId: 1,
  lobbyPda: "pda_address_base58",
  playerA: "player_a_wallet",
  amount: 1000000,
  characterA: 5,
  mapId: 0
});

// After frontend calls joinLobby action and gets winner
await convex.mutation(api.lobbies.joinLobbyMutation, {
  lobbyId: 1,
  playerB: "player_b_wallet",
  characterB: 3,
  winner: "winner_wallet"
});

// After frontend calls cancelLobby action
await convex.mutation(api.lobbies.cancelLobbyMutation, {
  lobbyId: 1
});
```

### Actions (For Blockchain Verification)
```typescript
// Verify create_lobby transaction on blockchain
const result = await convex.action(api.lobbies.createLobby, {
  playerAWallet: "wallet_base58",
  amount: 1000000,
  characterA: 5,
  mapId: 0,
  transactionHash: "tx_hash_base58"
});
// Returns: { success: true, lobbyId: 1, lobbyPda: "...", action: "create" }

// Verify join_lobby transaction on blockchain
const result = await convex.action(api.lobbies.joinLobby, {
  playerBWallet: "wallet_base58",
  lobbyId: 1,
  characterB: 3,
  transactionHash: "tx_hash_base58"
});
// Returns: { success: true, lobbyId: 1, winner: "...", action: "join" }

// Verify cancel_lobby transaction on blockchain
const result = await convex.action(api.lobbies.cancelLobby, {
  lobbyId: 1,
  transactionHash: "tx_hash_base58"
});
// Returns: { success: true, lobbyId: 1, action: "cancel" }
```

## Frontend Integration Pattern

### Creating a Lobby
```typescript
// 1. Build transaction (frontend does this)
const tx = buildCreateLobbyTx(playerWallet, amount, characterId, mapId);

// 2. Sign and send (frontend does this)
const txHash = await signAndSendTransaction(tx);

// 3. Call action to verify
const actionResult = await convex.action(api.lobbies.createLobby, {
  playerAWallet: playerWallet,
  amount,
  characterA: characterId,
  mapId,
  transactionHash: txHash
});

// 4. Update DB (only if action succeeded)
if (actionResult.success) {
  await convex.mutation(api.lobbies.createLobbyMutation, {
    lobbyId: actionResult.lobbyId,
    lobbyPda: actionResult.lobbyPda,
    playerA: playerWallet,
    amount,
    characterA: characterId,
    mapId
  });
}
```

### Joining a Lobby
```typescript
// 1. Build transaction
const tx = buildJoinLobbyTx(playerWallet, lobbyId, amount, characterId, mapId);

// 2. Sign and send
const txHash = await signAndSendTransaction(tx);

// 3. Call action to verify
const actionResult = await convex.action(api.lobbies.joinLobby, {
  playerBWallet: playerWallet,
  lobbyId,
  characterB: characterId,
  transactionHash: txHash
});

// 4. Update DB with winner
if (actionResult.success) {
  await convex.mutation(api.lobbies.joinLobbyMutation, {
    lobbyId: actionResult.lobbyId,
    playerB: playerWallet,
    characterB: characterId,
    winner: actionResult.winner
  });
  
  // Now start the fight animation!
}
```

### Canceling a Lobby
```typescript
// 1. Build transaction
const tx = buildCancelLobbyTx(playerWallet, lobbyId);

// 2. Sign and send
const txHash = await signAndSendTransaction(tx);

// 3. Call action to verify
const actionResult = await convex.action(api.lobbies.cancelLobby, {
  lobbyId,
  transactionHash: txHash
});

// 4. Update DB (delete the lobby)
if (actionResult.success) {
  await convex.mutation(api.lobbies.cancelLobbyMutation, {
    lobbyId
  });
}
```

### Polling Lobby State During Fight
```typescript
// Use useQuery to poll real-time updates
const lobby = useQuery(api.lobbies.getLobbyState, { lobbyId: currentFightLobbyId });

// When lobby updates, check if status changed to 1 (resolved)
if (lobby?.status === 1 && lobby?.winner) {
  // Start fight animation with winner data
  startFightAnimation(lobby.winner);
}
```

## Database Schema Quick Reference

```typescript
// Lobby document structure in Convex
{
  _id: Id,
  _creationTime: number,
  
  // IDs
  lobbyId: number,           // On-chain ID
  lobbyPda: string,          // On-chain PDA address
  
  // Players
  playerA: string,           // Wallet address
  playerB?: string,          // Wallet address (joins later)
  
  // Game State
  amount: number,            // Bet amount in lamports
  status: 0 | 1,            // 0: waiting, 1: resolved
  winner?: string,           // Wallet address of winner
  
  // Characters & Map
  characterA: number,        // Skin ID 0-255
  characterB?: number,       // Skin ID 0-255
  mapId: number,            // Map/background ID 0-255
  
  // Timestamps
  createdAt: number,         // MS since epoch
  resolvedAt?: number        // MS since epoch
}
```

## Error Handling

```typescript
try {
  const result = await convex.action(api.lobbies.createLobby, { ... });
  
  if (!result.success) {
    console.error("Action failed:", result);
    return;
  }
  
  // Safe to proceed with mutation
  await convex.mutation(api.lobbies.createLobbyMutation, { ... });
} catch (error) {
  if (error.message.includes("Transaction not found")) {
    // TX didn't make it to blockchain
    showError("Transaction failed. Please try again.");
  } else if (error.message.includes("Lobby not found")) {
    // TX succeeded but lobby wasn't created
    showError("Lobby creation failed on-chain.");
  } else {
    // Other error
    showError(error.message);
  }
}
```

## Status Values

```typescript
// Lobby status
const STATUS = {
  CREATED: 0,    // Waiting for Player B to join
  RESOLVED: 1    // Game resolved, winner determined
};
```

## File Locations

| File | Purpose |
|------|---------|
| `convex/lobbies.ts` | All lobby queries, mutations, actions |
| `convex/lib/solana_1v1.ts` | Blockchain query client |
| `convex/schema.ts` | Database schema with `oneVOneLobbies` table |
| `convex/crons.ts` | Cron job configuration (commented out until API regeneration) |

## Next: Phase 4

Phase 4 will implement:
- React components for the UI
- Route `/1v1` with lobby list and creation form
- Fight scene integration
- Real-time updates using Convex queries

---

**Ready to Start Phase 4?** ✅ Yes, all backend is complete and tested!
