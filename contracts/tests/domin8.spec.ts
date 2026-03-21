import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { toNano, beginCell, Address } from "@ton/core";
import { sha256_sync } from "@ton/crypto";
import "@ton/test-utils";

// These imports will work after `bun run build` generates the wrappers
import { Domin8 } from "../build/domin8_Domin8";
import { Domin8Game } from "../build/domin8_Domin8Game";
import { Domin8Lobby } from "../build/domin8_Domin8Lobby";

// Helper: compute commit hash the same way the contract does
// Contract does: sha256(uint256 as 32 bytes) → returns uint256
function commitHash(secret: bigint): bigint {
  const buf = Buffer.alloc(32);
  // Store as big-endian uint256
  for (let i = 31; i >= 0; i--) {
    buf[31 - i] = Number((secret >> BigInt(i * 8)) & 0xffn);
  }
  const hash = sha256_sync(buf);
  return BigInt("0x" + Buffer.from(hash).toString("hex"));
}

describe("Domin8 Master", () => {
  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let treasury: SandboxContract<TreasuryContract>;
  let master: SandboxContract<Domin8>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    admin = await blockchain.treasury("admin");
    treasury = await blockchain.treasury("treasury");

    master = blockchain.openContract(
      await Domin8.fromInit(admin.address)
    );

    // Deploy master
    const deployResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "Deploy", queryId: 0n }
    );
    expect(deployResult.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      deploy: true,
      success: true,
    });

    // Init config
    await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "InitConfig",
        treasury: treasury.address,
        houseFee: 500n,
        minBet: toNano("0.01"),
        maxBet: toNano("10"),
        roundTime: 60n,
      }
    );
  });

  it("should deploy and configure", async () => {
    const config = await master.getConfig();
    expect(config.admin.equals(admin.address)).toBe(true);
    expect(config.treasury.equals(treasury.address)).toBe(true);
    expect(config.houseFee).toBe(500n);
    expect(config.minBet).toBe(toNano("0.01"));
    expect(config.roundTime).toBe(60n);
    expect(config.locked).toBe(false);
  });

  it("should reject config from non-owner", async () => {
    const rando = await blockchain.treasury("rando");
    const result = await master.send(
      rando.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "InitConfig",
        treasury: treasury.address,
        houseFee: 500n,
        minBet: toNano("0.01"),
        maxBet: toNano("10"),
        roundTime: 60n,
      }
    );
    expect(result.transactions).toHaveTransaction({
      from: rando.address,
      to: master.address,
      success: false,
    });
  });

  it("should reject house fee > 10%", async () => {
    const result = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "InitConfig",
        treasury: treasury.address,
        houseFee: 1500n, // 15% — too high
        minBet: toNano("0.01"),
        maxBet: toNano("10"),
        roundTime: 60n,
      }
    );
    expect(result.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: false,
    });
  });
});

describe("Battle Royale", () => {
  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let treasury: SandboxContract<TreasuryContract>;
  let player1: SandboxContract<TreasuryContract>;
  let player2: SandboxContract<TreasuryContract>;
  let player3: SandboxContract<TreasuryContract>;
  let master: SandboxContract<Domin8>;

  const secret = 123456789n;
  const hash = commitHash(secret);

  const BASE_TIME = 2000000000;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    blockchain.now = BASE_TIME;

    admin = await blockchain.treasury("admin");
    treasury = await blockchain.treasury("treasury");
    player1 = await blockchain.treasury("player1");
    player2 = await blockchain.treasury("player2");
    player3 = await blockchain.treasury("player3");

    master = blockchain.openContract(
      await Domin8.fromInit(admin.address)
    );

    await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "Deploy", queryId: 0n }
    );

    blockchain.now = BASE_TIME + 1;
    await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "InitConfig",
        treasury: treasury.address,
        houseFee: 500n,
        minBet: toNano("0.01"),
        maxBet: toNano("10"),
        roundTime: 10n, // 10 seconds for fast tests
      }
    );
  });

  it("should create a game round", async () => {
    blockchain.now = BASE_TIME + 2;
    const result = await master.send(
      admin.getSender(),
      { value: toNano("0.5") },
      {
        $$type: "CreateGame",
        mapId: 1n,
        commitHash: hash,
      }
    );

    expect(result.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: true,
    });

    const config = await master.getConfig();
    expect(config.currentRound).toBe(1n);
    expect(config.locked).toBe(true);
  });

  it("should reject double game creation while locked", async () => {
    blockchain.now = BASE_TIME + 2;
    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 1n, commitHash: hash }
    );

    blockchain.now = BASE_TIME + 3;
    const result = await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 2n, commitHash: hash }
    );

    expect(result.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: false,
    });
  });

  it("should handle full game flow: create → bet → reveal → claim", async () => {
    // 1. Create game
    blockchain.now = BASE_TIME + 10;
    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 1n, commitHash: hash }
    );

    const gameAddr = await master.getGameAddress(1n);
    const game = blockchain.openContract(Domin8Game.fromAddress(gameAddr));

    // 2. Players bet (send directly to game child)
    blockchain.now = BASE_TIME + 11;
    await game.send(
      player1.getSender(),
      { value: toNano("1.05") }, // 1 TON bet + 0.05 gas
      { $$type: "PlaceBet", skin: 1n, posX: 100n, posY: 200n }
    );

    blockchain.now = BASE_TIME + 12;
    await game.send(
      player2.getSender(),
      { value: toNano("2.05") }, // 2 TON bet + 0.05 gas
      { $$type: "PlaceBet", skin: 3n, posX: 300n, posY: 400n }
    );

    let state = await game.getState();
    expect(state.status).toBe(1n); // open
    expect(state.betCount).toBe(2n);
    expect(state.userCount).toBe(2n);
    expect(state.totalPot).toBe(toNano("3")); // 1 + 2

    // Verify bets
    const bet1 = await game.getBet(0n);
    expect(bet1!.amount).toBe(toNano("1"));
    expect(bet1!.skin).toBe(1n);

    const bet2 = await game.getBet(1n);
    expect(bet2!.amount).toBe(toNano("2"));

    // 3. Fast-forward past end time (roundTime = 10s, started at BASE_TIME+11)
    blockchain.now = BASE_TIME + 25;

    // 4. Reveal & end (via master → game)
    const revealResult = await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "RevealAndEnd", secret: secret }
    );

    expect(revealResult.transactions).toHaveTransaction({
      from: master.address,
      to: gameAddr,
      success: true,
    });

    state = await game.getState();
    expect(state.status).toBe(2n); // closed
    expect(state.winner).not.toBeNull();
    expect(state.winnerPrize).toBeGreaterThan(0n);

    // 5. Claim prize
    blockchain.now = BASE_TIME + 26;
    const claimResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "ClaimPrize" }
    );

    // Master should be unlocked
    const config = await master.getConfig();
    expect(config.locked).toBe(false);
  });

  it("should refund single player (0% fee)", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 1n, commitHash: hash }
    );

    const gameAddr = await master.getGameAddress(1n);
    const game = blockchain.openContract(Domin8Game.fromAddress(gameAddr));

    // Only 1 player bets
    blockchain.now = BASE_TIME + 11;
    await game.send(
      player1.getSender(),
      { value: toNano("1.05") },
      { $$type: "PlaceBet", skin: 1n, posX: 100n, posY: 200n }
    );

    // Fast-forward past roundTime (started at +11, roundTime=10)
    blockchain.now = BASE_TIME + 25;

    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "RevealAndEnd", secret: secret }
    );

    const state = await game.getState();
    expect(state.winner).not.toBeNull();
    expect(state.winner!.equals(player1.address)).toBe(true);
    expect(state.winnerPrize).toBe(toNano("1")); // full refund
  });

  it("should reject bet below minimum", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 1n, commitHash: hash }
    );

    const gameAddr = await master.getGameAddress(1n);
    const game = blockchain.openContract(Domin8Game.fromAddress(gameAddr));

    blockchain.now = BASE_TIME + 11;
    const result = await game.send(
      player1.getSender(),
      { value: toNano("0.06") }, // 0.01 min but only 0.06 - 0.05 gas = 0.01... borderline
      { $$type: "PlaceBet", skin: 1n, posX: 0n, posY: 0n }
    );

    // Try with clearly too small bet
    blockchain.now = BASE_TIME + 12;
    const result2 = await game.send(
      player1.getSender(),
      { value: toNano("0.055") }, // 0.005 TON bet < 0.01 min
      { $$type: "PlaceBet", skin: 1n, posX: 0n, posY: 0n }
    );

    expect(result2.transactions).toHaveTransaction({
      from: player1.address,
      to: gameAddr,
      success: false,
    });
  });

  it("should reject bad reveal secret", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "CreateGame", mapId: 1n, commitHash: hash }
    );

    const gameAddr = await master.getGameAddress(1n);
    const game = blockchain.openContract(Domin8Game.fromAddress(gameAddr));

    blockchain.now = BASE_TIME + 11;
    await game.send(
      player1.getSender(),
      { value: toNano("1.05") },
      { $$type: "PlaceBet", skin: 1n, posX: 100n, posY: 200n }
    );

    blockchain.now = BASE_TIME + 25;

    // Wrong secret
    const result = await master.send(
      admin.getSender(),
      { value: toNano("0.2") },
      { $$type: "RevealAndEnd", secret: 999999n }
    );

    expect(result.transactions).toHaveTransaction({
      from: master.address,
      to: gameAddr,
      success: false,
    });
  });
});

describe("1v1 Lobby", () => {
  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let treasury: SandboxContract<TreasuryContract>;
  let playerA: SandboxContract<TreasuryContract>;
  let playerB: SandboxContract<TreasuryContract>;
  let master: SandboxContract<Domin8>;

  const secret = 987654321n;
  const hash = commitHash(secret);
  const BASE_TIME = 2000000000;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    blockchain.now = BASE_TIME;

    admin = await blockchain.treasury("admin");
    treasury = await blockchain.treasury("treasury");
    playerA = await blockchain.treasury("playerA");
    playerB = await blockchain.treasury("playerB");

    master = blockchain.openContract(
      await Domin8.fromInit(admin.address)
    );

    await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "Deploy", queryId: 0n }
    );

    blockchain.now = BASE_TIME + 1;
    await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "InitConfig",
        treasury: treasury.address,
        houseFee: 500n,
        minBet: toNano("0.01"),
        maxBet: toNano("10"),
        roundTime: 60n,
      }
    );
  });

  it("should create lobby, join, settle", async () => {
    blockchain.now = BASE_TIME + 10;
    const betAmount = toNano("1");

    // 1. Player A creates lobby (bet + gas sent via master)
    await master.send(
      playerA.getSender(),
      { value: betAmount + toNano("0.15") },
      {
        $$type: "CreateLobby",
        mapId: 1n,
        skin: 5n,
        commitHash: hash,
      }
    );

    const config = await master.getConfig();
    expect(config.lobbyCount).toBe(1n);

    const lobbyAddr = await master.getLobbyAddress(1n);
    const lobby = blockchain.openContract(
      Domin8Lobby.fromAddress(lobbyAddr)
    );

    let state = await lobby.getState();
    expect(state.status).toBe(0n); // open
    expect(state.playerA.equals(playerA.address)).toBe(true);
    expect(state.amount).toBe(betAmount);
    expect(state.skinA).toBe(5n);

    // 2. Player B joins
    blockchain.now = BASE_TIME + 11;
    await lobby.send(
      playerB.getSender(),
      { value: betAmount + toNano("0.05") },
      { $$type: "JoinLobby", skin: 3n }
    );

    state = await lobby.getState();
    expect(state.status).toBe(1n); // joined
    expect(state.playerB!.equals(playerB.address)).toBe(true);
    expect(state.skinB).toBe(3n);

    // 3. Settle (admin reveals secret)
    blockchain.now = BASE_TIME + 12;
    const settleResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      {
        $$type: "SettleLobby",
        lobbyId: 1n,
        secret: secret,
      }
    );

    // Lobby should be destroyed (self-destruct)
    // Winner gets prize, treasury gets fee
  });

  it("should prevent self-play", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      playerA.getSender(),
      { value: toNano("1.15") },
      { $$type: "CreateLobby", mapId: 1n, skin: 1n, commitHash: hash }
    );

    const lobbyAddr = await master.getLobbyAddress(1n);
    const lobby = blockchain.openContract(
      Domin8Lobby.fromAddress(lobbyAddr)
    );

    // Player A tries to join own lobby
    blockchain.now = BASE_TIME + 11;
    const result = await lobby.send(
      playerA.getSender(),
      { value: toNano("1.05") },
      { $$type: "JoinLobby", skin: 2n }
    );

    expect(result.transactions).toHaveTransaction({
      from: playerA.address,
      to: lobbyAddr,
      success: false,
    });
  });

  it("should rescue stuck lobby after timeout", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      playerA.getSender(),
      { value: toNano("1.15") },
      { $$type: "CreateLobby", mapId: 1n, skin: 1n, commitHash: hash }
    );

    const lobbyAddr = await master.getLobbyAddress(1n);
    const lobby = blockchain.openContract(
      Domin8Lobby.fromAddress(lobbyAddr)
    );

    // Player B joins
    blockchain.now = BASE_TIME + 11;
    await lobby.send(
      playerB.getSender(),
      { value: toNano("1.05") },
      { $$type: "JoinLobby", skin: 2n }
    );

    // Try rescue too early — should fail
    blockchain.now = BASE_TIME + 12;
    const earlyResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "RescueLobby", lobbyId: 1n }
    );

    expect(earlyResult.transactions).toHaveTransaction({
      from: master.address,
      to: lobbyAddr,
      success: false,
    });

    // Fast-forward 2 hours
    blockchain.now = BASE_TIME + 7200;

    // Now rescue should work
    const rescueResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "RescueLobby", lobbyId: 1n }
    );

    expect(rescueResult.transactions).toHaveTransaction({
      from: master.address,
      to: lobbyAddr,
      success: true,
    });
  });

  it("should reject bad reveal in settle", async () => {
    blockchain.now = BASE_TIME + 10;
    await master.send(
      playerA.getSender(),
      { value: toNano("1.15") },
      { $$type: "CreateLobby", mapId: 1n, skin: 1n, commitHash: hash }
    );

    const lobbyAddr = await master.getLobbyAddress(1n);
    const lobby = blockchain.openContract(
      Domin8Lobby.fromAddress(lobbyAddr)
    );

    blockchain.now = BASE_TIME + 11;
    await lobby.send(
      playerB.getSender(),
      { value: toNano("1.05") },
      { $$type: "JoinLobby", skin: 2n }
    );

    // Wrong secret
    blockchain.now = BASE_TIME + 12;
    const result = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "SettleLobby", lobbyId: 1n, secret: 111n }
    );

    expect(result.transactions).toHaveTransaction({
      from: master.address,
      to: lobbyAddr,
      success: false,
    });
  });

  it("should handle coinflip fairness (even=A, odd=B)", async () => {
    // Secret is 987654321 → odd → Player B wins
    const isOdd = secret % 2n === 1n;

    blockchain.now = BASE_TIME + 10;
    await master.send(
      playerA.getSender(),
      { value: toNano("1.15") },
      { $$type: "CreateLobby", mapId: 1n, skin: 1n, commitHash: hash }
    );

    const lobbyAddr = await master.getLobbyAddress(1n);
    const lobby = blockchain.openContract(
      Domin8Lobby.fromAddress(lobbyAddr)
    );

    blockchain.now = BASE_TIME + 11;
    await lobby.send(
      playerB.getSender(),
      { value: toNano("1.05") },
      { $$type: "JoinLobby", skin: 2n }
    );

    blockchain.now = BASE_TIME + 12;
    const settleResult = await master.send(
      admin.getSender(),
      { value: toNano("0.1") },
      { $$type: "SettleLobby", lobbyId: 1n, secret: secret }
    );

    // Verify the settle succeeded on the lobby
    expect(settleResult.transactions).toHaveTransaction({
      from: master.address,
      to: lobbyAddr,
      success: true,
    });

    // Verify prize was sent to the correct winner
    const expectedWinner = isOdd ? playerB.address : playerA.address;
    expect(settleResult.transactions).toHaveTransaction({
      from: lobbyAddr,
      to: expectedWinner,
      success: true,
    });
  });
});
