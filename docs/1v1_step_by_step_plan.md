# Domin8 1v1 (Coinflip) Feature: Step-by-Step Implementation Plan

This document breaks down the full 1v1 Coinflip feature into clear, reviewable phases. After each phase, you can review and approve before proceeding to the next.

---

## Phase 1: On-Chain Program Foundation ✅ COMPLETE

- ✅ Create new directory: `programs/domin8_1v1_prgm/`
- ✅ Scaffold Anchor program with:
  - ✅ `Cargo.toml` (anchor-lang, orao-solana-vrf, dependencies matching domin8_prgm)
  - ✅ `src/lib.rs` (program ID, 4 instruction stubs)
  - ✅ `src/state.rs` (Config & Lobby account structs with status: 0/1)
  - ✅ `src/error.rs` (basic error types)
- **Key Implementation Details:**
  - **Lobby Status:** Only 2 statuses (0 = waiting, 1 = resolved)
  - **VRF Force Derivation:** Each lobby's vrf_force = `hash(b"1v1_lobby_vrf" || lobby_id.to_le_bytes())` for unique randomness accounts
- ✅ Implement `initialize_config` and `create_lobby` instructions
- ✅ Add basic tests for account creation

---

## Phase 2: On-Chain Program - Join & Resolution ✅ COMPLETE

- ✅ Implement `join_lobby` instruction:
  - ✅ Accept Player B's bet
  - ✅ Read ORAO VRF randomness (via existing vrf_force PDA)
  - ✅ Determine winner immediately (randomness % 2)
  - ✅ Distribute funds: house fee → treasury, prize → winner
  - ✅ Close Lobby PDA, refund rent to payer
  - ✅ Set status = 1 (resolved)
- ✅ Implement `cancel_lobby` instruction (Player A refunds if status = 0)
- ✅ Add tests for join, cancel, and resolution flows

---

## Phase 3: Convex Backend Schema & Actions ✅ COMPLETE

- ✅ Update `convex/schema.ts` to add `oneVOneLobbies` table (fields: lobbyId, lobbyPda, playerA, playerB, amount, status [0 or 1], winner, characterA, characterB, mapId, createdAt)
- ✅ Create `convex/lib/solana_1v1.ts`:
  - ✅ `Solana1v1QueryClient` for read-only blockchain queries
  - ✅ Loads `domin8_1v1_prgm` IDL automatically
  - ✅ Helper methods: `getLobbyAccount()`, `getConfigAccount()`, `getNextLobbyId()`, `getLobbyPdaForId()`
- ✅ Create `convex/lobbies.ts`:
  - ✅ Queries: `getOpenLobbies`, `getLobbyState`, `getPlayerLobbies`
  - ✅ Mutations: `createLobbyMutation`, `joinLobbyMutation`, `cancelLobbyMutation`, `updateLobbyStatusMutation`
  - ✅ Actions: `createLobby`, `joinLobby`, `cancelLobby` (verify tx on-chain, return data)
  - ✅ Internal queries: `getStuckLobbies`
  - ✅ Internal mutations: `syncLobbyFromBlockchain`
- ✅ Add cron job to `convex/crons.ts`: runs `syncLobbyFromBlockchain` every 30 seconds (ready to uncomment after API regeneration)
- **Key Detail:** Frontend Convex actions verify transactions on-chain, return data, then frontend calls mutations to update DB (immediate sync). Cron (every 30s) is a backup safety net.
- ✅ Create `docs/PHASE_3_IMPLEMENTATION.md` with comprehensive documentation

---

## Phase 4: Frontend - React UI & Integration ✅ COMPLETE

- ✅ Add `/1v1` route in `Root.tsx`
- ✅ Add link in `Header.tsx` (Jackpot / 1v1 navigation)
- ✅ Create `pages/OneVOnePage.tsx` (manages lobby list, create, and fight state)
- ✅ Create `components/onevone/CreateLobby.tsx` (bet amount form, character display)
- ✅ Create `components/onevone/LobbyList.tsx` (display open lobbies with join buttons)
- ✅ Create `components/onevone/OneVOneFightScene.tsx` (React wrapper for Phaser scene)
- ✅ Integrate with CharacterSelection2 (fixed position at bottom)
- ✅ Create `game/scenes/OneVOneScene.ts` (Phaser scene with fight animation logic)
- ✅ Add OneVOneScene to Phaser game config in `src/game/main.ts`

**Key Features Implemented:**
- Two-player character selection with preview
- Lobby creation with customizable bet amounts (0.01-100 SOL)
- Real-time lobby list with join buttons
- Fight scene with player positioning (left/right)
- Battle and results phase animations
- Prize pool calculation and display (2% house fee)
- EventBus integration for scene communication

**Status:** Frontend UI complete. Ready for Convex API regeneration and blockchain integration.

---

## Next Steps

**Immediate (Phase 6):**
1. Enhance fight scene with character animations and visual effects
2. Add sound effects for battle and results
3. Polish UI and error handling

## Phase 5: Convex API Regeneration & Blockchain Integration ✅ COMPLETE

- ✅ Regenerate Convex API (`npx convex dev`)
  - ✅ Exposed `api.lobbies.*` methods
  - ✅ Uncommented Convex imports in frontend components
- ✅ Implement `CreateLobby.tsx` blockchain flow:
  - ✅ Build `create_lobby` transaction via `buildCreateLobbyTransaction`
  - ✅ Sign transaction with Privy wallet (`signAndSendAllTransactions`)
  - ✅ Send transaction to blockchain
  - ✅ Wait for confirmation (45s polling timeout)
  - ✅ Call Convex action `api.lobbies.createLobby`
  - ✅ Call `onLobbyCreated` callback with lobby ID
- ✅ Implement `LobbyList.tsx` join flow:
  - ✅ Build `join_lobby` transaction via `buildJoinLobbyTransaction`
  - ✅ Sign transaction with Privy wallet
  - ✅ Send transaction to blockchain
  - ✅ Wait for confirmation (45s polling timeout)
  - ✅ Call Convex action `api.lobbies.joinLobby`
  - ✅ Call `onLobbyJoined` callback to transition to fight
- ✅ Wire up real-time Convex queries:
  - ✅ Uncommented `useQuery(api.lobbies.getOpenLobbies)` in OneVOnePage
  - ✅ Uncommented `useQuery(api.lobbies.getLobbyState)` for fight polling
- ✅ Created transaction building library (`src/lib/solana-1v1-transactions.ts`)
- ✅ Implemented error handling and user-friendly messages
- ✅ Created comprehensive testing guide (`PHASE_5_TESTING_GUIDE.md`)

**Key Implementation Details:**
- Transaction builder handles all three operations: create, join, cancel
- Uses VersionedTransaction with v0 message format
- Compute budget optimized (300,000 CU)
- Privy wallet integration for both signing and sending
- Polling-based confirmation with 45-second timeout
- Real-time Convex queries auto-update lobby list
- Comprehensive error handling for common failures

**Files Modified:**
- `src/pages/OneVOnePage.tsx` - Enabled Convex queries
- `src/components/onevone/CreateLobby.tsx` - Full transaction flow
- `src/components/onevone/LobbyList.tsx` - Full join transaction flow
- `src/lib/solana-1v1-transactions.ts` - New transaction builder (created)
- `PHASE_5_TESTING_GUIDE.md` - Testing documentation (created)

---

## Phase 6: Frontend - Fight Scene & Animation

- [ ] Enhance `OneVOneScene.ts` with:
  - [ ] Character spawning at proper positions
  - [ ] Battle phase animation sequence (using existing AnimationManager)
  - [ ] Results phase with winner/loser celebration
  - [ ] Sound effects (battle theme, victory, defeat)
- [ ] Polish `OneVOneFightScene.tsx` wrapper:
  - [ ] Display real-time lobby state
  - [ ] Show player names and character info
  - [ ] Display pot and winner announcement
- [ ] Reuse existing managers:
  - [ ] PlayerManager for character management
  - [ ] AnimationManager for battle sequences
  - [ ] BackgroundManager for arena selection
  - [ ] SoundManager for audio

---

## Phase 7: Final Testing & Polish

- [ ] End-to-end tests for full 1v1 flow
  - [ ] Test create lobby locally
  - [ ] Test joining lobby
  - [ ] Verify VRF randomness determines winner
  - [ ] Verify funds transfer to winner
  - [ ] Verify house fee deduction
- [ ] UI/UX polish:
  - [ ] Error handling and user feedback
  - [ ] Loading states and spinners
  - [ ] Mobile responsiveness
  - [ ] Accessibility improvements
- [ ] Documentation updates
  - [ ] Update PHASE_3_IMPLEMENTATION.md with frontend flow
  - [ ] Add integration testing guide
- [ ] Security review
  - [ ] Wallet signature verification
  - [ ] Transaction validation
  - [ ] Account verification (ensure correct PDAs)
- [ ] Final review and deployment prep
