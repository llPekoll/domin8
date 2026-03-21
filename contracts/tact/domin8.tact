import "@stdlib/deploy";
import "@stdlib/ownable";

// ============================================================
// DOMIN8 on TON - Battle Royale + 1v1 Betting Game
//
// 3 contracts:
//   Domin8       → master (config, factory, fee router) - permanent
//   Domin8Game   → battle royale round - ephemeral, self-destructs
//   Domin8Lobby  → 1v1 coinflip - ephemeral, self-destructs
//
// Randomness: commit-reveal
//   1. Backend commits sha256(secret) at game creation
//   2. Backend reveals secret after betting closes
//   3. Contract verifies hash, uses secret as seed
//
// Storage: all child contracts self-destruct after payout = zero rent
// ============================================================


// ============================================================
// Messages
// ============================================================

// --- Admin ---
message InitConfig {
    treasury: Address;
    houseFee: Int as uint16;       // bps, max 1000 (10%)
    minBet: Int as coins;
    maxBet: Int as coins;
    roundTime: Int as uint32;      // seconds
}

message Withdraw {
    amount: Int as coins;
}

// --- Battle Royale ---
message CreateGame {
    mapId: Int as uint8;
    commitHash: Int as uint256;
}

message SetGameConfig {
    houseFee: Int as uint16;
    minBet: Int as coins;
    maxBet: Int as coins;
    roundTime: Int as uint32;
    mapId: Int as uint8;
    commitHash: Int as uint256;
}

message PlaceBet {
    skin: Int as uint8;
    posX: Int as uint16;
    posY: Int as uint16;
}

message RevealAndEnd {
    secret: Int as uint256;
}

message ClaimPrize {}

// --- 1v1 ---
message CreateLobby {
    mapId: Int as uint8;
    skin: Int as uint8;
    commitHash: Int as uint256;
}

message SetLobbyConfig {
    playerA: Address;
    amount: Int as coins;
    houseFee: Int as uint16;
    mapId: Int as uint8;
    skinA: Int as uint8;
    commitHash: Int as uint256;
}

message JoinLobby {
    skin: Int as uint8;
}

message SettleLobby {
    lobbyId: Int as uint64;
    secret: Int as uint256;
}

message RescueLobby {
    lobbyId: Int as uint64;
}

// --- Internal (child → parent) ---
message InternalGameEnded {
    gameId: Int as uint64;
    winner: Address;
    prize: Int as coins;
    fee: Int as coins;
}

message InternalLobbySettled {
    lobbyId: Int as uint64;
    winner: Address;
    prize: Int as coins;
    fee: Int as coins;
}

message InternalUnlock {}


// ============================================================
// Structs
// ============================================================

struct BetInfo {
    player: Address;
    amount: Int as coins;
    skin: Int as uint8;
    posX: Int as uint16;
    posY: Int as uint16;
}

struct GameState {
    gameId: Int as uint64;
    status: Int as uint8;
    mapId: Int as uint8;
    startDate: Int as uint64;
    endDate: Int as uint64;
    totalPot: Int as coins;
    betCount: Int as uint32;
    userCount: Int as uint32;
    winner: Address?;
    winnerPrize: Int as coins;
    prizeSent: Bool;
}

struct LobbyState {
    lobbyId: Int as uint64;
    status: Int as uint8;
    playerA: Address;
    playerB: Address?;
    amount: Int as coins;
    mapId: Int as uint8;
    skinA: Int as uint8;
    skinB: Int as uint8;
    winner: Address?;
    createdAt: Int as uint64;
}

struct MasterConfig {
    admin: Address;
    treasury: Address;
    houseFee: Int as uint16;
    minBet: Int as coins;
    maxBet: Int as coins;
    roundTime: Int as uint32;
    currentRound: Int as uint64;
    lobbyCount: Int as uint64;
    locked: Bool;
}


// ============================================================
// DOMIN8 GAME — Battle Royale (ephemeral child)
// ============================================================

contract Domin8Game with Deployable {

    parent: Address;
    gameId: Int as uint64;
    configured: Bool;

    // Config (set via SetGameConfig from parent)
    houseFee: Int as uint16;
    minBet: Int as coins;
    maxBet: Int as coins;
    roundTime: Int as uint32;
    mapId: Int as uint8;
    commitHash: Int as uint256;

    // State
    status: Int as uint8;          // 0=waiting, 1=open, 2=closed
    startDate: Int as uint64;
    endDate: Int as uint64;
    totalPot: Int as coins;
    betCount: Int as uint32;
    userCount: Int as uint32;

    // Winner
    winner: Address?;
    winnerPrize: Int as coins;
    prizeSent: Bool;

    // Storage
    bets: map<Int as uint32, BetInfo>;
    playerBetCounts: map<Address, Int as uint32>;

    init(parent: Address, gameId: Int) {
        self.parent = parent;
        self.gameId = gameId;
        self.configured = false;
        self.houseFee = 0;
        self.minBet = 0;
        self.maxBet = 0;
        self.roundTime = 0;
        self.mapId = 0;
        self.commitHash = 0;
        self.status = 0;
        self.startDate = 0;
        self.endDate = 0;
        self.totalPot = 0;
        self.betCount = 0;
        self.userCount = 0;
        self.winner = null;
        self.winnerPrize = 0;
        self.prizeSent = false;
    }

    // ---- CONFIG (from parent on deploy) ----
    receive(msg: SetGameConfig) {
        require(sender() == self.parent, "Only parent");
        require(!self.configured, "Already configured");
        self.houseFee = msg.houseFee;
        self.minBet = msg.minBet;
        self.maxBet = msg.maxBet;
        self.roundTime = msg.roundTime;
        self.mapId = msg.mapId;
        self.commitHash = msg.commitHash;
        self.configured = true;
    }

    // ---- PLACE BET ----
    receive(msg: PlaceBet) {
        require(self.configured, "Not configured");
        let ctx: Context = context();
        let gasReserve: Int = ton("0.05");
        let betAmount: Int = ctx.value - gasReserve;

        require(self.status != 2, "Game closed");
        require(betAmount >= self.minBet, "Below min bet");
        require(betAmount <= self.maxBet, "Above max bet");
        require(self.betCount < 1000, "Max bets reached");

        // Per-user limits
        let userBets: Int = 0;
        let existing: Int? = self.playerBetCounts.get(ctx.sender);
        if (existing != null) {
            userBets = existing!!;
        }
        let maxPerUser: Int = 30;
        if (betAmount < ton("0.01")) {
            maxPerUser = 20;
        }
        require(userBets < maxPerUser, "User bet limit");

        // First bet starts countdown
        if (self.status == 0) {
            self.status = 1;
            self.startDate = now();
            self.endDate = now() + self.roundTime;
        }

        require(now() <= self.endDate, "Betting ended");

        if (existing == null) {
            self.userCount = self.userCount + 1;
        }

        self.bets.set(self.betCount, BetInfo{
            player: ctx.sender,
            amount: betAmount,
            skin: msg.skin,
            posX: msg.posX,
            posY: msg.posY
        });
        self.betCount = self.betCount + 1;
        self.totalPot = self.totalPot + betAmount;
        self.playerBetCounts.set(ctx.sender, userBets + 1);
    }

    // ---- REVEAL & END ----
    receive(msg: RevealAndEnd) {
        require(sender() == self.parent, "Only parent");
        require(self.status == 1, "Not open");
        require(now() >= self.endDate, "Not ended yet");
        require(self.betCount > 0, "No bets");

        // Verify commit-reveal
        let hash: Int = self.computeHash(msg.secret);
        require(hash == self.commitHash, "Bad reveal");

        self.status = 2;

        if (self.userCount == 1) {
            // Solo: full refund
            let bet: BetInfo = self.bets.get(0)!!;
            self.winner = bet.player;
            self.winnerPrize = bet.amount;

            send(SendParameters{
                to: self.parent,
                value: ton("0.01"),
                mode: SendPayGasSeparately,
                body: InternalUnlock{}.toCell()
            });
        } else {
            // Multi: weighted random
            let randomPoint: Int = msg.secret % self.totalPot;
            let cumulative: Int = 0;
            let i: Int = 0;
            while (i < self.betCount) {
                let bet: BetInfo = self.bets.get(i)!!;
                cumulative = cumulative + bet.amount;
                if (cumulative > randomPoint) {
                    self.winner = bet.player;
                    let fee: Int = (self.totalPot * self.houseFee) / 10000;
                    self.winnerPrize = self.totalPot - fee;

                    send(SendParameters{
                        to: self.parent,
                        value: fee + ton("0.01"),
                        mode: SendPayGasSeparately,
                        body: InternalGameEnded{
                            gameId: self.gameId,
                            winner: self.winner!!,
                            prize: self.winnerPrize,
                            fee: fee
                        }.toCell()
                    });
                    return;
                }
                i = i + 1;
            }
        }
    }

    // ---- CLAIM PRIZE ----
    receive(msg: ClaimPrize) {
        require(self.status == 2, "Not closed");
        require(!self.prizeSent, "Already sent");
        require(self.winner != null, "No winner");

        let s: Address = sender();
        require(s == self.winner!! || s == self.parent, "Not authorized");

        self.prizeSent = true;

        // Pay winner
        send(SendParameters{
            to: self.winner!!,
            value: self.winnerPrize,
            mode: SendPayGasSeparately,
            body: "Domin8 Prize".asComment()
        });

        // Self-destruct: remaining balance back to parent
        send(SendParameters{
            to: self.parent,
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: "Game Done".asComment()
        });
    }

    // ---- HASH ----
    fun computeHash(value: Int): Int {
        return sha256(beginCell().storeUint(value, 256).endCell().beginParse());
    }

    // ---- GETTERS ----

    get fun state(): GameState {
        return GameState{
            gameId: self.gameId,
            status: self.status,
            mapId: self.mapId,
            startDate: self.startDate,
            endDate: self.endDate,
            totalPot: self.totalPot,
            betCount: self.betCount,
            userCount: self.userCount,
            winner: self.winner,
            winnerPrize: self.winnerPrize,
            prizeSent: self.prizeSent
        };
    }

    get fun bet(index: Int): BetInfo? {
        return self.bets.get(index);
    }

    get fun playerBets(player: Address): Int {
        let c: Int? = self.playerBetCounts.get(player);
        if (c == null) { return 0; }
        return c!!;
    }
}


// ============================================================
// DOMIN8 LOBBY — 1v1 Coinflip (ephemeral child)
// ============================================================

contract Domin8Lobby with Deployable {

    parent: Address;
    lobbyId: Int as uint64;
    configured: Bool;

    // Players
    playerA: Address;
    playerB: Address?;
    amount: Int as coins;

    // Config
    houseFee: Int as uint16;
    mapId: Int as uint8;
    skinA: Int as uint8;
    skinB: Int as uint8;
    commitHash: Int as uint256;

    // State: 0=open, 1=joined, 2=settled
    status: Int as uint8;
    winner: Address?;
    createdAt: Int as uint64;

    init(parent: Address, lobbyId: Int) {
        self.parent = parent;
        self.lobbyId = lobbyId;
        self.configured = false;
        self.playerA = parent;  // placeholder
        self.playerB = null;
        self.amount = 0;
        self.houseFee = 0;
        self.mapId = 0;
        self.skinA = 0;
        self.skinB = 0;
        self.commitHash = 0;
        self.status = 0;
        self.winner = null;
        self.createdAt = 0;
    }

    // ---- CONFIG (from parent on deploy) ----
    receive(msg: SetLobbyConfig) {
        require(sender() == self.parent, "Only parent");
        require(!self.configured, "Already configured");
        self.playerA = msg.playerA;
        self.amount = msg.amount;
        self.houseFee = msg.houseFee;
        self.mapId = msg.mapId;
        self.skinA = msg.skinA;
        self.commitHash = msg.commitHash;
        self.createdAt = now();
        self.configured = true;
    }

    // ---- JOIN ----
    receive(msg: JoinLobby) {
        require(self.configured, "Not configured");
        let ctx: Context = context();
        require(self.status == 0, "Not open");
        require(ctx.sender != self.playerA, "Can't self-play");

        let gasReserve: Int = ton("0.05");
        let betAmount: Int = ctx.value - gasReserve;
        require(betAmount >= self.amount, "Must match bet");

        self.playerB = ctx.sender;
        self.skinB = msg.skin;
        self.status = 1;

        // Refund excess
        let excess: Int = betAmount - self.amount;
        if (excess > ton("0.001")) {
            send(SendParameters{
                to: ctx.sender,
                value: excess,
                mode: SendPayGasSeparately,
                body: "Excess refund".asComment()
            });
        }
    }

    // ---- SETTLE (reveal) ----
    receive(msg: SettleLobby) {
        require(sender() == self.parent, "Only parent");
        require(self.status == 1, "Not ready");
        require(self.playerB != null, "No player B");

        // Verify commit-reveal
        let hash: Int = self.computeHash(msg.secret);
        require(hash == self.commitHash, "Bad reveal");

        self.status = 2;

        // Coinflip
        if (msg.secret % 2 == 0) {
            self.winner = self.playerA;
        } else {
            self.winner = self.playerB;
        }

        // Payout
        let totalPot: Int = self.amount * 2;
        let fee: Int = (totalPot * self.houseFee) / 10000;
        let prize: Int = totalPot - fee;

        // Pay winner
        send(SendParameters{
            to: self.winner!!,
            value: prize,
            mode: SendPayGasSeparately,
            body: "1v1 Win!".asComment()
        });

        // Fee + self-destruct
        send(SendParameters{
            to: self.parent,
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: InternalLobbySettled{
                lobbyId: self.lobbyId,
                winner: self.winner!!,
                prize: prize,
                fee: fee
            }.toCell()
        });
    }

    // ---- RESCUE ----
    receive(msg: RescueLobby) {
        require(sender() == self.parent, "Only parent");

        if (self.status == 1) {
            require(now() - self.createdAt > 3600, "Not expired");
        }

        // Refund A
        send(SendParameters{
            to: self.playerA,
            value: self.amount,
            mode: SendPayGasSeparately,
            body: "Refund".asComment()
        });

        // Refund B if joined
        if (self.playerB != null) {
            send(SendParameters{
                to: self.playerB!!,
                value: self.amount,
                mode: SendPayGasSeparately,
                body: "Refund".asComment()
            });
        }

        // Self-destruct
        send(SendParameters{
            to: self.parent,
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: InternalUnlock{}.toCell()
        });
    }

    // ---- HASH ----
    fun computeHash(value: Int): Int {
        return sha256(beginCell().storeUint(value, 256).endCell().beginParse());
    }

    // ---- GETTERS ----

    get fun state(): LobbyState {
        return LobbyState{
            lobbyId: self.lobbyId,
            status: self.status,
            playerA: self.playerA,
            playerB: self.playerB,
            amount: self.amount,
            mapId: self.mapId,
            skinA: self.skinA,
            skinB: self.skinB,
            winner: self.winner,
            createdAt: self.createdAt
        };
    }
}


// ============================================================
// DOMIN8 MASTER — Config + Factory + Fee Router (permanent)
// ============================================================

contract Domin8 with Deployable, Ownable {

    owner: Address;
    treasury: Address;
    houseFee: Int as uint16;
    minBet: Int as coins;
    maxBet: Int as coins;
    roundTime: Int as uint32;
    currentRound: Int as uint64;
    lobbyCount: Int as uint64;
    locked: Bool;

    init(owner: Address) {
        self.owner = owner;
        self.treasury = owner;
        self.houseFee = 500;
        self.minBet = ton("0.001");
        self.maxBet = ton("10");
        self.roundTime = 60;
        self.currentRound = 0;
        self.lobbyCount = 0;
        self.locked = false;
    }

    // ---- CONFIG ----

    receive(msg: InitConfig) {
        self.requireOwner();
        require(msg.houseFee <= 1000, "Fee > 10%");
        require(msg.minBet > 0, "Min = 0");
        require(msg.maxBet > msg.minBet, "Max <= min");
        require(msg.roundTime >= 10 && msg.roundTime <= 86400, "Bad round time");
        self.treasury = msg.treasury;
        self.houseFee = msg.houseFee;
        self.minBet = msg.minBet;
        self.maxBet = msg.maxBet;
        self.roundTime = msg.roundTime;
    }

    // ==============================
    // BATTLE ROYALE
    // ==============================

    receive(msg: CreateGame) {
        self.requireOwner();
        require(!self.locked, "Locked");

        self.currentRound = self.currentRound + 1;
        self.locked = true;

        // Deploy child + send config
        let init: StateInit = initOf Domin8Game(myAddress(), self.currentRound);
        let addr: Address = contractAddress(init);

        // Deploy
        send(SendParameters{
            to: addr,
            value: ton("0.03"),
            mode: SendPayGasSeparately,
            code: init.code,
            data: init.data,
            body: Deploy{queryId: 0}.toCell()
        });

        // Configure
        send(SendParameters{
            to: addr,
            value: ton("0.02"),
            mode: SendPayGasSeparately,
            body: SetGameConfig{
                houseFee: self.houseFee,
                minBet: self.minBet,
                maxBet: self.maxBet,
                roundTime: self.roundTime,
                mapId: msg.mapId,
                commitHash: msg.commitHash
            }.toCell()
        });
    }

    receive(msg: RevealAndEnd) {
        self.requireOwner();
        let addr: Address = self.gameAddr(self.currentRound);
        send(SendParameters{
            to: addr,
            value: ton("0.05"),
            mode: SendPayGasSeparately,
            body: RevealAndEnd{secret: msg.secret}.toCell()
        });
    }

    receive(msg: ClaimPrize) {
        let addr: Address = self.gameAddr(self.currentRound);
        send(SendParameters{
            to: addr,
            value: ton("0.05"),
            mode: SendPayGasSeparately,
            body: msg.toCell()
        });
    }

    // ==============================
    // 1V1 LOBBIES
    // ==============================

    receive(msg: CreateLobby) {
        let ctx: Context = context();
        let gasReserve: Int = ton("0.15"); // deploy + config + overhead
        let betAmount: Int = ctx.value - gasReserve;
        require(betAmount >= self.minBet, "Below min");
        require(betAmount <= self.maxBet, "Above max");

        self.lobbyCount = self.lobbyCount + 1;

        let init: StateInit = initOf Domin8Lobby(myAddress(), self.lobbyCount);
        let addr: Address = contractAddress(init);

        // Deploy
        send(SendParameters{
            to: addr,
            value: ton("0.03"),
            mode: SendPayGasSeparately,
            code: init.code,
            data: init.data,
            body: Deploy{queryId: 0}.toCell()
        });

        // Configure with player A's bet forwarded
        send(SendParameters{
            to: addr,
            value: betAmount + ton("0.02"),
            mode: SendPayGasSeparately,
            body: SetLobbyConfig{
                playerA: ctx.sender,
                amount: betAmount,
                houseFee: self.houseFee,
                mapId: msg.mapId,
                skinA: msg.skin,
                commitHash: msg.commitHash
            }.toCell()
        });
    }

    receive(msg: SettleLobby) {
        self.requireOwner();
        let addr: Address = self.lobbyAddr(msg.lobbyId);
        send(SendParameters{
            to: addr,
            value: ton("0.05"),
            mode: SendPayGasSeparately,
            body: msg.toCell()
        });
    }

    receive(msg: RescueLobby) {
        self.requireOwner();
        let addr: Address = self.lobbyAddr(msg.lobbyId);
        send(SendParameters{
            to: addr,
            value: ton("0.05"),
            mode: SendPayGasSeparately,
            body: msg.toCell()
        });
    }

    // ==============================
    // INTERNAL (from children)
    // ==============================

    receive(msg: InternalGameEnded) {
        self.locked = false;
        if (msg.fee > 0) {
            send(SendParameters{
                to: self.treasury,
                value: msg.fee,
                mode: SendPayGasSeparately,
                body: "Domin8 Fee".asComment()
            });
        }
    }

    receive(msg: InternalLobbySettled) {
        let remaining: Int = context().value;
        if (remaining > ton("0.01")) {
            send(SendParameters{
                to: self.treasury,
                value: 0,
                mode: SendRemainingValue,
                body: "1v1 Fee".asComment()
            });
        }
    }

    receive(msg: InternalUnlock) {
        self.locked = false;
    }

    // Catch text messages from children
    receive("Game Done") {}

    // ---- ADMIN ----

    receive(msg: Withdraw) {
        self.requireOwner();
        send(SendParameters{
            to: self.treasury,
            value: msg.amount,
            mode: SendPayGasSeparately,
            body: "Admin withdraw".asComment()
        });
    }

    // ---- HELPERS ----

    fun gameAddr(gameId: Int): Address {
        return contractAddress(initOf Domin8Game(myAddress(), gameId));
    }

    fun lobbyAddr(lobbyId: Int): Address {
        return contractAddress(initOf Domin8Lobby(myAddress(), lobbyId));
    }

    // ---- GETTERS ----

    get fun config(): MasterConfig {
        return MasterConfig{
            admin: self.owner,
            treasury: self.treasury,
            houseFee: self.houseFee,
            minBet: self.minBet,
            maxBet: self.maxBet,
            roundTime: self.roundTime,
            currentRound: self.currentRound,
            lobbyCount: self.lobbyCount,
            locked: self.locked
        };
    }

    get fun gameAddress(gameId: Int): Address {
        return self.gameAddr(gameId);
    }

    get fun lobbyAddress(lobbyId: Int): Address {
        return self.lobbyAddr(lobbyId);
    }

    get fun currentGameAddress(): Address {
        return self.gameAddr(self.currentRound);
    }
}
