# **Domin8 1v1 (Coinflip) Feature: Full Implementation Plan**

This document outlines the complete, full-stack plan to integrate a 1v1 "Coinflip" lobby feature into the existing Domin8 project.

## **1\. Core Architecture**
## Lobby Statuses & Convex Sync

**Lobby Statuses:**
- Only two statuses:
  - `0`: Lobby is created and waiting for a second player.
  - `1`: Player B joins and immediately triggers the lobby resolution on-chain; status is set to 1 (resolved).

**Convex Sync Logic:**
- After a create lobby or join lobby transaction is confirmed by the frontend, the Convex database is updated immediately to reflect the new state.
- The 30-second cron job remains, but only as a backup to catch any missed updates (e.g., if the frontend fails to update Convex).

We will build a new, parallel system that co-exists with the current jackpot game. The architecture is a hybrid model that uses the on-chain program as the source of truth for funds and game state, while using Convex as a high-speed data cache and trusted "crank" operator.

* **On-Chain (Source of Truth):** A new Solana Anchor program (domin8\_1v1\_prgm) will be created. It will manage:  
  * A global Config account to store fees and a lobby\_count (sequential ID).  
  * Multiple Lobby PDA accounts. Each Lobby is a distinct 1v1 game, seeded by \[b"lobby", lobby\_id\]. It holds the funds for both players and the game's state.  
* **Backend (Cache & Crank):** Convex will be updated:
  * **Cache:** A new oneVOneLobbies table will be added to convex/schema.ts. This table will mirror the on-chain Lobby PDAs. The frontend will query this table to get an *instant* list of open lobbies.
  * **Immediate Updates:** After a create lobby or join lobby transaction is confirmed by the frontend, the Convex database is updated immediately to reflect the new state. This ensures near real-time sync between frontend actions and backend state.
  * **Crank (Backup):** The existing 30-second cron job will remain, but only as a backup to catch any missed updates (e.g., if the frontend fails to update Convex). The cron will periodically poll the blockchain and update Convex if needed.
* **Frontend (UI & Visuals):**  
  * A new React page (/1v1) will be added, accessible from the Header.  
  * This page will allow users to create new lobbies or join existing ones.  
  * A new Phaser scene (OneVOneScene.ts) will be created to display the 1v1 fight animation, reusing existing assets and managers (PlayerManager, AnimationManager).

## **2\. User Workflows**

### **Workflow A: Player A Creates a Lobby**

1. **Frontend (React):** Player A navigates to the /1v1 page. They select their character using the CharacterSelection2 component, enter a fixed amount (e.g., 0.01 SOL), and click "Create Lobby".  
2. **Frontend (React):** The click handler calls the createLobby Convex action, passing the amountSol and characterId.  
3. Backend (Convex): The createLobby action:  
   a. Gets Player A's wallet from ctx.auth.  
   b. Creates a new SolanaClient1v1 helper.  
   c. Calls solanaClient.createLobby(playerA\_wallet, amountSol). This function builds and sends the create\_lobby transaction.  
4. On-Chain (Solana): The create\_lobby instruction:  
   a. Increments the global Config's lobby\_count.  
   b. Creates a new Lobby PDA seeded by \[b"lobby", lobby\_count\].  
   c. Generates a unique vrf\_force seed derived from lobby\_id: `hash(b"1v1_lobby_vrf" || lobby\_id.to\_le\_bytes())` to ensure each lobby has its own VRF randomness account.  
   d. Requests ORAO VRF using this unique vrf\_force seed.  
   e. Saves all data to the Lobby account (player\_a, amount, vrf\_force, status \= **0**).  
   f. Transfers amount SOL from Player A into the new Lobby PDA.  
5. Backend (Convex):  
   a. The createLobby action confirms the transaction.  
   b. It then calls ctx.runMutation(internal.lobbies.internalCreateLobby, ...).  
   c. This mutation adds a new document to the oneVOneLobbies table in Convex, mirroring the on-chain state (lobbyId, playerA, amount, characterA, status \= **0**).  
6. **Frontend (React):** The LobbyList component, which is running useQuery(api.lobbies.getOpenLobbies), instantly updates and shows Player A's new lobby to all other players.

### **Workflow B: Player B Joins a Lobby & Game Settles**

1. **Frontend (React):** Player B sees Player A's lobby in the LobbyList. They select their *own* character and click "Join".  
2. **Frontend (React):** The click handler calls the joinLobby Convex action, passing the lobbyId, lobbyPda, and their own characterId.  
3. Backend (Convex): The joinLobby action:  
   a. Gets Player B's wallet from ctx.auth.  
   b. Calls solanaClient.joinLobby(playerB\_wallet, lobbyPda). This sends the join\_lobby transaction.  
4. On-Chain (Solana): The join\_lobby instruction:  
   a. Transfers amount SOL from Player B into the Lobby PDA (which now holds 2x the amount).  
   b. Sets lobby.player\_b to Player B's wallet.  
   c. **Reads ORAO VRF randomness and determines winner immediately (randomness % 2).**  
   d. **Pays house fee to treasury, transfers full prize to winner.**  
   e. **Closes Lobby PDA and sets lobby.status = 1 (resolved).**  
5. Backend (Convex):  
   a. The joinLobby action confirms the transaction.  
   b. It calls ctx.runMutation(internal.lobbies.internalJoinLobby, ...), which updates the Convex lobby document with playerB, characterB, winner, and status = **1** (resolved).  
   c. The update is performed immediately after transaction confirmation, ensuring fast sync.  
6. Frontend (React):  
   a. Player B's onLobbyJoined() callback is triggered, setting the fightingLobbyId in the OneVOnePage.  
   b. The page re-renders, hiding the LobbyList and showing the OneVOneFightScene component.  
   c. OneVOneFightScene polls useQuery(api.lobbies.getLobbyState, { lobbyId }). It sees status = **1** and the winner, then immediately calls scene.startFight(data).  
7. Frontend (Phaser):  
   a. The OneVOneScene.ts spawns both characters (Player A left, Player B right).  
   b. It runs the fight animation (startBattlePhaseSequence).  
   c. It runs the result animation (startResultsPhaseSequence), exploding the loser and celebrating the winner.  
   d. After \~9 seconds, it emits EventBus.emit("1v1-complete").  
8. **Frontend (React):** The OneVOneFightScene wrapper hears the event, calls onFightComplete(), which sets fightingLobbyId to null. The page re-renders, showing the LobbyList again.

## **3\. Implementation Details**

### **Part 1: On-Chain Program (programs/domin8\_1v1\_prgm/)**

We will create a new directory programs/domin8\_1v1\_prgm.

* **Cargo.toml:**  
  * Will be similar to domin8\_prgm, including anchor-lang and orao-solana-vrf.  
* **src/lib.rs:**  
  * Will define the new program ID.  
  * Will contain 4 new instructions:  
    1. initialize\_config(ctx, house\_fee): Admin-only. Creates the Config PDA.  
    2. create\_lobby(ctx, amount): Player A. Creates Lobby PDA, funds it, and requests VRF.  
    3. join\_lobby(ctx): Player B. Funds Lobby PDA, sets player\_b, reads VRF, determines winner, distributes funds, closes account, and sets status = 1.  
    4. cancel\_lobby(ctx): Player A-only. Closes Lobby PDA and refunds Player A if status is still 0.  
* **src/state.rs:**  
  * Config account struct (admin, treasury, house\_fee, lobby\_count).  
  * Lobby account struct (lobby\_id, player\_a, player\_b, amount, vrf\_force, status, winner).  
  * **Status field is an integer:**
    * 0 = Created, waiting for second player
    * 1 = Resolved (both players joined, winner determined, funds distributed)
  * **VRF Force Derivation:** Each lobby's vrf\_force is derived from lobby\_id: `hash(b"1v1_lobby_vrf" || lobby\_id.to\_le\_bytes())` to ensure unique randomness accounts.
* **src/error.rs:**  
  * LobbyError::AlreadyJoined, LobbyError::NotReadyToSettle, LobbyError::RandomnessNotReady.

### **Part 2: Convex Backend (convex/)**

* **schema.ts (Modify):**  
  * Add the new oneVOneLobbies table as detailed in the workflow. It must include lobbyId, lobbyPda, playerA, playerB, amount, status, winner, characterA, characterB.  
* **lobbies.ts (New File):**  
  * getOpenLobbies: query that returns oneVOneLobbies where status == **0** (waiting for second player).  
  * getLobbyState: query that takes lobbyId and returns the specific lobby document. Used for polling by the fight scene.  
  * createLobby: action (see workflow; updates Convex immediately after transaction confirmation).  
  * joinLobby: action (see workflow; updates Convex immediately after transaction confirmation).  
  * cancelLobby: action (see workflow).  
  * settleStuckLobbies: internalAction (cron job, see below; runs every 30 seconds as a safety net).  
  * internalCreateLobby: internalMutation to insert a new lobby.  
  * internalJoinLobby: internalMutation to update a lobby with Player B and winner.  
  * internalDeleteLobby: internalMutation to delete a lobby (on cancel).  
  * getStuckLobbies: internalQuery that finds lobbies with status == 0 or 1 to be reconciled by the cron.  
* **lib/solana\_1v1.ts (New File):**  
  * This will be a helper class, similar to lib/solana.ts.  
  * It will load the new domin8\_1v1\_prgm.json IDL and use the new Program ID.  
  * It will contain wrapper functions for each on-chain instruction: createLobby, joinLobby, settleLobby, cancelLobby.  
* **crons.ts (Modify):**  
  * Add a new cron job to run the settleStuckLobbies recovery action every 2-5 minutes.  
    crons.interval(  
      "settle-1v1-stuck-lobbies",  
      { minutes: 2 },  
      internal.lobbies.settleStuckLobbies  
    );

### **Part 3: React Frontend (src/)**

* **Root.tsx (Modify):**  
  * Add the new route: \<Route path="/1v1" element={\<OneVOnePage /\>} /\>.  
* **components/Header.tsx (Modify):**  
  * Add a react-router-dom \<Link to="/1v1"\> in the header nav.  
* **pages/OneVOnePage.tsx (New File):**  
  * Main page component.  
  * Manages the fightingLobbyId state.  
  * Conditionally renders LobbyList / CreateLobby OR OneVOneFightScene based on this state.  
  * Polls api.lobbies.getLobbyState when a fight is active.  
* **components/onevone/CreateLobby.tsx (New File):**  
  * A form component with an \<Input /\> for the amount.  
  * **Crucially, it will *not* render its own CharacterSelection2.** The OneVOnePage will render CharacterSelection2 *once*, and this component will receive the selectedCharacter via props or context. (Correction: CharacterSelection2 is position:fixed, so it can be rendered by LobbyList and CreateLobby will just read the state from the parent OneVOnePage).  
  * "Create Lobby" button calls useAction(api.lobbies.createLobby).  
* **components/onevone/LobbyList.tsx (New File):**  
  * Uses useQuery(api.lobbies.getOpenLobbies) to get data.  
  * Maps over the lobbies and renders a row for each.  
  * Each row will be styled in the 8-bit theme, reusing CharacterPreviewScene to show Player A's character.  
  * "Join" button calls useAction(api.lobbies.joinLobby) and passes onLobbyJoined(lobby.lobbyId) to the parent.  
* **components/onevone/OneVOneFightScene.tsx (New File):**  
  * React wrapper for the Phaser scene.  
  * Renders the \<div id="phaser-1v1-container" /\>.  
  * useEffect to initialize the Phaser game.  
  * useEffect that watches the lobby prop:  
    * If lobby.status \=== "waiting\_for\_randomness", it shows a "Waiting for VRF..." UI overlay.  
    * If lobby.status \=== "settled", it calls scene.startFight(data) on the Phaser scene.  
  * Listens for EventBus.emit("1v1-complete") to call onFightComplete().

### **Part 4: Phaser Frontend (src/game/)**

* **game/main.ts (Modify):**  
  * Add OneVOneScene to the scene list in the Phaser GameConfig.  
* **game/scenes/OneVOneScene.ts (New File):**  
  * A new Phaser.Scene.  
  * create(): Initializes PlayerManager, AnimationManager, BackgroundManager. Sets a fixed background (e.g., bg1) and plays battle music.  
  * startFight(data: FightData): A public method.  
    * Uses PlayerManager to addParticipant for Player A at (width \* 0.25, y).  
    * Uses PlayerManager to addParticipant for Player B at (width \* 0.75, y) and flips their sprite.  
    * Calls AnimationManager.startBattlePhaseSequence(this.playerManager).  
    * Uses this.time.delayedCall(...) to wait \~3-4 seconds.  
    * Determines the winnerParticipant from data.winnerWallet.  
    * Calls AnimationManager.startResultsPhaseSequence(this.playerManager, winnerParticipant).  
    * Uses this.time.delayedCall(...) to wait for the celebration to finish.  
    * Emits EventBus.emit("1v1-complete").