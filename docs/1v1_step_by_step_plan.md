# Domin8 1v1 (Coinflip) Feature: Step-by-Step Implementation Plan

This document breaks down the full 1v1 Coinflip feature into clear, reviewable phases. After each phase, you can review and approve before proceeding to the next.

---

## Phase 1: On-Chain Program Foundation

- Create new directory: `programs/domin8_1v1_prgm/`
- Scaffold Anchor program with:
  - `Cargo.toml` (anchor-lang, orao-solana-vrf, dependencies matching domin8_prgm)
  - `src/lib.rs` (program ID, 4 instruction stubs)
  - `src/state.rs` (Config & Lobby account structs with status: 0/1)
  - `src/error.rs` (basic error types)
- **Key Implementation Details:**
  - **Lobby Status:** Only 2 statuses (0 = waiting, 1 = resolved)
  - **VRF Force Derivation:** Each lobby's vrf_force = `hash(b"1v1_lobby_vrf" || lobby_id.to_le_bytes())` for unique randomness accounts
- Implement `initialize_config` and `create_lobby` instructions
- Add basic tests for account creation

---

## Phase 2: On-Chain Program - Join & Resolution

- Implement `join_lobby` instruction:
  - Accept Player B's bet
  - Read ORAO VRF randomness (via existing vrf_force PDA)
  - Determine winner immediately (randomness % 2)
  - Distribute funds: house fee → treasury, prize → winner
  - Close Lobby PDA, refund rent to payer
  - Set status = 1 (resolved)
- Implement `cancel_lobby` instruction (Player A refunds if status = 0)
- Add tests for join, cancel, and resolution flows

---

## Phase 3: Convex Backend Schema & Actions

- Update `convex/schema.ts` to add `oneVOneLobbies` table (fields: lobbyId, lobbyPda, playerA, playerB, amount, status [0 or 1], winner, characterA, characterB)
- Create `convex/lobbies.ts`:
  - `createLobby` action (calls on-chain, then updates Convex **immediately** after tx confirmation)
  - `joinLobby` action (calls on-chain, then updates Convex **immediately** after tx confirmation)
  - `cancelLobby` action
  - `getOpenLobbies` query (filters status == 0)
  - `getLobbyState` query (single lobby polling)
  - `settleStuckLobbies` internalAction (cron job, reconciles status 0 & 1 lobbies)
  - `getStuckLobbies` internalQuery (finds lobbies with status 0 or 1 that may need sync)
  - Helper mutations: `internalCreateLobby`, `internalJoinLobby`, `internalDeleteLobby`
- **Key Detail:** Frontend Convex calls update DB immediately after transaction confirmation. Cron (every 30s) is a backup safety net
- Add cron job to `convex/crons.ts`: runs `settleStuckLobbies` every 30 seconds

---

## Phase 4: Frontend - React UI & Integration

- Add `/1v1` route in `Root.tsx`
- Add link in `Header.tsx`
- Create `pages/OneVOnePage.tsx` (manages state, renders LobbyList/CreateLobby/OneVOneFightScene)
- Create `components/onevone/CreateLobby.tsx` and `LobbyList.tsx`
- Integrate Convex actions/queries

---

## Phase 5: Frontend - Fight Scene & Animation

- Create `components/onevone/OneVOneFightScene.tsx` (Phaser wrapper)
- Add `game/scenes/OneVOneScene.ts` (Phaser scene)
- Integrate fight animation, winner/loser logic
- Connect to Convex lobby state for real-time updates

---

## Phase 6: Final Testing & Polish

- End-to-end tests for full 1v1 flow
- UI/UX polish and bug fixes
- Documentation updates
- Final review and deployment

---

**Review each phase before proceeding to the next.**
