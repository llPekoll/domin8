# **Domin8 1v1 Update Plan: ORAO Integration & Double Down**

This document outlines the migration from Switchboard to ORAO VRF, the implementation of the "Double Down" mechanic, and UI/UX improvements for the 1v1 Coinflip game mode.

## **1\. Smart Contract Updates (ORAO VRF)**

The ORAO VRF model differs from Switchboard. It typically follows a **Request \-\> Fullfillment** pattern. To ensure fairness and prevent the creator from predicting the outcome before the second player joins, the randomness request must occur **when the second player joins**.

### **Architecture Change**

* **Current (Switchboard):** Create (Commit) \-\> Join (Reveal & Resolve).  
* **New (ORAO):**  
  1. **Create:** Player A funds lobby. Status: CREATED (0).  
  2. **Join:** Player B funds lobby. Program triggers ORAO RequestV2. Status: AWAITING\_VRF (2).  
  3. **Settle:** (Separate Instruction) Verification that ORAO has fulfilled the request. Calculates winner. Distributes funds. Status: RESOLVED (1).

### **File-by-File Changes**

#### **programs/domin8\_1v1\_prgm/Cargo.toml**

* Remove switchboard-on-demand.  
* Add orao-solana-vrf \= { version \= "0.6.1", features \= \["cpi"\] } (matching main program).

#### **programs/domin8\_1v1\_prgm/src/state.rs**

* Update Domin81v1Lobby struct:  
  * Remove randomness\_account (Pubkey).  
  * Add force: \[u8; 32\] (To store the seed used for the ORAO request).  
  * Add status constant: LOBBY\_STATUS\_AWAITING\_VRF \= 2\.

#### **programs/domin8\_1v1\_prgm/src/instructions/create\_lobby.rs**

* Remove Switchboard account validation.  
* Initialize force seed (can be derived from lobby\_id \+ player\_a to be unique).  
* Do **not** request randomness here (wait for Player B).

#### **programs/domin8\_1v1\_prgm/src/instructions/join\_lobby.rs**

* **Action:** Accept Player B's funds.  
* **VRF Logic:** Construct the CpiContext for orao\_solana\_vrf::cpi::request\_v2.  
* **State Update:** Set status to LOBBY\_STATUS\_AWAITING\_VRF (2).  
* **Note:** The game is *locked* but not *settled*.

#### **programs/domin8\_1v1\_prgm/src/instructions/settle\_lobby.rs (New File)**

* **Action:** Callable by anyone (Player A, Player B, or Crank).  
* **Validation:** Check if orao\_solana\_vrf account has fulfilled randomness for the lobby's force seed.  
* **Logic:**  
  1. Read randomness.  
  2. Determine winner (randomness\[0\] % 2).  
  3. Payout (House Fee \-\> Treasury, Remainder \-\> Winner).  
  4. Set status to RESOLVED (1).  
  5. Close account (or keep for history/double down reference, likely close and refund rent to reclaim storage).

## **2\. Frontend Logic & "Double Down"**

### **Double Down Workflow**

"Double Down" is essentially a shortcut to create a new lobby using the winnings from the previous match.

1. **Trigger:** Game ends, Player A wins.  
2. **UI:** "Double Down" button appears in OneVOneFightScene.  
3. **Action:**  
   * Calculates newBetAmount \= totalPrizeReceived.  
   * Calls createLobby(newBetAmount, ...) immediately.  
   * **UI Transition:**  
     * If the user wants to "stay in arena", the UI enters the "Waiting" state *inside* the Fight Scene view (instead of kicking them back to the list).  
     * A "Minimize" button allows them to browse other lobbies while waiting.

### **UI/UX Improvements**

#### **Lobby Details Modal**

* **Component:** src/components/onevone/LobbyDetailsDialog.tsx (New).  
* **Trigger:** Clicking a lobby row in LobbyList.  
* **Content:** Full character preview, player stats (if available), map preview.

#### **Minimize/Toggle Arena**

* **State:** isArenaMinimized (boolean) in OneVOnePage.tsx.  
* **Behavior:**  
  * When minimized, the OneVOneFightScene is hidden or rendered in a small "Picture-in-Picture" style box at the bottom right.  
  * Main view shows LobbyList.  
  * **Auto-Restore:** If the lobby status changes (e.g., Player B joins), the Arena automatically expands/maximizes.

## **3\. Step-by-Step Implementation Guide**

### **Step 1: Smart Contract Update (ORAO)**

1. Modify Cargo.toml.  
2. Implement settle\_lobby.rs.  
3. Refactor join\_lobby.rs to request randomness instead of resolving.  
4. Update lib.rs to expose new instructions.

### **Step 2: Backend (Convex) Sync**

1. Update oneVOneLobbies schema in convex/schema.ts to track the new status (2 \= Awaiting VRF).  
2. Update convex/lobbies.ts:  
   * joinLobby action: Update to handle the new "Joined but not settled" state.  
   * settleLobby action: New action to call the on-chain settle\_lobby instruction.  
   * **Crank:** Update syncLobbyFromBlockchain to detect lobbies in state 2 (Awaiting VRF) and try to call settleLobby if randomness is ready.

### **Step 3: Frontend Integration**

1. **Transaction Builders:** Update src/lib/solana-1v1-transactions.ts to include settleLobby builder.  
2. **Fight Scene:** Update OneVOneFightScene.tsx to handle the 3-step state:  
   * status 0: Waiting for Player.  
   * status 2: "Spinning..." (Waiting for ORAO).  
   * status 1: Resolved (Show winner).  
3. **Double Down:** Implement the button handler in OneVOneFightScene.  
4. **Minimization:** Add the state logic in OneVOnePage.tsx and the toggle UI.

## **4\. Data Structures & Constants**

### **Lobby Status Enum**

enum LobbyStatus {  
  CREATED \= 0,  
  RESOLVED \= 1, // Kept as 1 for backward compat if needed, or remapped  
  AWAITING\_VRF \= 2  
}

*Recommendation:* To keep it clean, we might want to stick to:

* 0: Open  
* 1: Active/Resolving (VRF Requested)  
* 2: Closed/Settled

### **Winner Determination (ORAO)**

// In settle\_lobby.rs  
let randomness \= vrf.get\_randomness();  
let winner\_is\_player\_a \= randomness\[0\] % 2 \== 0;

## **5\. Task List**

* \[ \] **Contract:** Swap Switchboard for ORAO in domin8\_1v1\_prgm.  
* \[ \] **Contract:** Split join into join (request) and settle (resolve).  
* \[ \] **Convex:** Update schema and actions for 3-state lifecycle.  
* \[ \] **Frontend:** Update OneVOneFightScene to poll for status changes (2 \-\> 1).  
* \[ \] **Frontend:** Add "Double Down" button logic.  
* \[ \] **Frontend:** Create LobbyDetailsDialog.  
* \[ \] **Frontend:** Implement Arena minimize/maximize logic.