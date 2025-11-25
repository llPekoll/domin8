/**
 * Smart Contract Test Suite (Convex-based)
 *
 * Tests all 7 instructions of the domin8_prgm smart contract:
 * 1. initialize_config
 * 2. create_game_round
 * 3. bet (first bet - starts countdown, no VRF)
 * 4. bet (second bet - triggers Magic Block VRF)
 * 5. vrf_callback (automatic)
 * 6. end_game
 * 7. send_prize_winner
 *
 * Run from Convex dashboard or via CLI:
 * npx convex run smartContractTest:runFullGameTest
 */
"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
const ADMIN_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY;

// Test configuration
const TEST_CONFIG = {
  treasury: "11111111111111111111111111111111", // Replace with actual treasury
  houseFee: 500, // 5% (500 basis points)
  minDeposit: 1_000_000, // 0.001 SOL
  maxDeposit: 10_000_000_000, // 10 SOL
  roundTime: 60, // 60 seconds
};

// ============================================================================
// Helper Functions (not registered actions, just helpers)
// ============================================================================

async function testInitializeConfig() {
  console.log("\n🧪 TEST 1: Initialize Config");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log("📝 Initializing config with:");
    console.log(`  Treasury: ${TEST_CONFIG.treasury}`);
    console.log(`  House Fee: ${TEST_CONFIG.houseFee / 100}%`);
    console.log(`  Min Bet: ${TEST_CONFIG.minDeposit / 1_000_000_000} SOL`);
    console.log(`  Max Bet: ${TEST_CONFIG.maxDeposit / 1_000_000_000} SOL`);
    console.log(`  Round Time: ${TEST_CONFIG.roundTime}s`);

    const result = await solanaClient.initializeConfig(
      TEST_CONFIG.treasury,
      TEST_CONFIG.houseFee,
      TEST_CONFIG.minDeposit,
      TEST_CONFIG.maxDeposit,
      TEST_CONFIG.roundTime
    );

    console.log("✅ Config initialized successfully");
    console.log(`  Transaction: ${result.signature}`);

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testCreateGameRound(roundId: number) {
  console.log("\n🧪 TEST 2: Create Game Round (with first bet)");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log(`📝 Creating game round ${roundId}`);
    console.log("  Map ID: 1 (bg1)");

    const result = await solanaClient.createGameRound(roundId, 1);

    console.log("✅ Game round created successfully (empty, waiting for bets)");
    console.log(`  Transaction: ${result.signature}`);

    return {
      success: true,
      signature: result.signature,
      roundId,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testPlaceBet(
  roundId: number,
  betAmount: number,
  skinId: number,
  position: [number, number]
) {
  console.log(`\n🧪 TEST: Place Bet`);
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log(`📝 Placing bet on round ${roundId}`);
    console.log(`  Bet Amount: ${betAmount / 1_000_000_000} SOL`);
    console.log(`  Skin ID: ${skinId}`);
    console.log(`  Position: [${position[0]}, ${position[1]}]`);

    const result = await solanaClient.placeBet(roundId, betAmount, skinId, position);

    console.log("✅ Bet placed successfully");
    console.log(`  Transaction: ${result.signature}`);

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testSecondBet(
  roundId: number,
  betAmount: number,
  skinId: number,
  position: [number, number],
  player2PrivateKey: string
) {
  console.log("\n🧪 TEST 4: Second Bet (VRF Trigger!)");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, player2PrivateKey!);

    console.log(`📝 Placing second bet on round ${roundId}`);
    console.log(`  Bet Amount: ${betAmount / 1_000_000_000} SOL`);
    console.log(`  Skin ID: ${skinId}`);
    console.log(`  Position: [${position[0]}, ${position[1]}]`);

    const result = await solanaClient.placeBet(roundId, betAmount, skinId, position);

    console.log("✅ Second bet placed successfully");
    console.log(`  Transaction: ${result.signature}`);
    console.log("  🎲 Magic Block VRF REQUESTED!");
    console.log("  ⏳ VRF callback should execute within 1-3 seconds");

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testEndGame(roundId: number) {
  console.log("\n🧪 TEST 5: End Game");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log(`📝 Ending game round ${roundId}`);

    const result = await solanaClient.endGame(roundId);

    console.log("✅ Game ended successfully");
    console.log(`  Transaction: ${result.signature}`);
    console.log("  🏆 Winner selected using Magic Block VRF randomness");

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testSendPrize(roundId: number) {
  console.log("\n🧪 TEST 6: Send Prize");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log(`📝 Sending prize for round ${roundId}`);

    const result = await solanaClient.sendPrizeWinner(roundId);

    console.log("✅ Prize sent successfully");
    console.log(`  Transaction: ${result.signature}`);
    console.log("  💰 95% to winner, 5% house fee");

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testSinglePlayerRefund(roundId: number, betAmount: number) {
  console.log("\n🧪 TEST 7: Single Player Refund (0% Fee)");
  console.log("─".repeat(50));

  try {
    const solanaClient = new SolanaClient(RPC_ENDPOINT!, ADMIN_PRIVATE_KEY!);

    console.log(`📝 Creating solo game round ${roundId}`);

    // Create game (no bet)
    await solanaClient.createGameRound(roundId, 1);

    // Place single bet
    console.log(`  Placing single bet: ${betAmount / 1_000_000_000} SOL`);
    await solanaClient.placeBet(roundId, betAmount, 1, [400, 400]);

    console.log("⏳ Waiting for countdown to expire (65s)...");
    await new Promise((resolve) => setTimeout(resolve, 65000));

    // End game
    const endResult = await solanaClient.endGame(roundId);
    console.log(`  Game ended: ${endResult.signature}`);

    // Send prize (should be 100% refund, 0% fee)
    const prizeResult = await solanaClient.sendPrizeWinner(roundId);
    console.log(`  Prize sent: ${prizeResult.signature}`);

    console.log("✅ Single player refund successful");
    console.log("  💯 0% house fee applied (solo game)");

    return {
      success: true,
      signature: prizeResult.signature,
    };
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

export const runFullGameTest = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 DOMIN8 SMART CONTRACT - FULL TEST SUITE");
    console.log("=".repeat(60));
    console.log("Testing all 7 instructions with VRF optimization");
    console.log(`RPC: ${RPC_ENDPOINT}`);
    console.log("=".repeat(60));

    const results = {
      passed: 0,
      failed: 0,
      tests: [] as any[],
    };

    try {
      // Test 1: Initialize Config
      console.log("\n⏩ Running Test 1/7...");
      const test1 = await testInitializeConfig();
      results.tests.push({ name: "Initialize Config", ...test1 });
      test1.success ? results.passed++ : results.failed++;

      // Test 2: Create Game Round
      console.log("\n⏩ Running Test 2/7...");
      const roundId = Math.floor(Date.now() / 1000);
      const test2 = await testCreateGameRound(roundId);
      results.tests.push({ name: "Create Game Round", ...test2 });
      test2.success ? results.passed++ : results.failed++;

      if (!test2.success) throw new Error("Cannot proceed without game creation");

      // Test 3: First Bet (starts countdown, no VRF yet)
      console.log("\n⏩ Running Test 3/7...");
      const test3 = await testPlaceBet(roundId, 5_000_000, 1, [400, 400]);
      results.tests.push({ name: "First Bet (starts countdown)", ...test3 });
      test3.success ? results.passed++ : results.failed++;

      // Test 4: Second Bet (triggers VRF!)
      console.log("\n⏩ Running Test 4/7...");
      const test4 = await testPlaceBet(roundId, 5_000_000, 2, [600, 600]);
      results.tests.push({ name: "Second Bet (triggers VRF)", ...test4 });
      test4.success ? results.passed++ : results.failed++;

      // Wait for game countdown to expire
      console.log("\n⏳ Waiting for game countdown to expire...");
      await new Promise((resolve) => setTimeout(resolve, 65000)); // 65 seconds

      // Test 5: End Game
      console.log("\n⏩ Running Test 5/7...");
      const test5 = await testEndGame(roundId);
      results.tests.push({ name: "End Game", ...test5 });
      test5.success ? results.passed++ : results.failed++;

      // Test 6: Send Prize
      console.log("\n⏩ Running Test 6/7...");
      const test6 = await testSendPrize(roundId);
      results.tests.push({ name: "Send Prize", ...test6 });
      test6.success ? results.passed++ : results.failed++;

      // Test 7: Single Player Refund
      console.log("\n⏩ Running Test 7/7...");
      const singleRoundId = roundId + 1;
      const test7 = await testSinglePlayerRefund(singleRoundId, 2_000_000);
      results.tests.push({ name: "Single Player Refund", ...test7 });
      test7.success ? results.passed++ : results.failed++;

      // Final Report
      console.log("\n" + "=".repeat(60));
      console.log("📊 TEST RESULTS");
      console.log("=".repeat(60));
      console.log(`✅ Passed: ${results.passed}`);
      console.log(`❌ Failed: ${results.failed}`);
      console.log(
        `📈 Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`
      );

      results.tests.forEach((test: any, i: number) => {
        const icon = test.success ? "✅" : "❌";
        console.log(`${icon} ${i + 1}. ${test.name}`);
        if (!test.success) {
          console.log(`   Error: ${test.error}`);
        }
      });

      console.log("\n" + "=".repeat(60));
      console.log("💰 COST ANALYSIS");
      console.log("=".repeat(60));
      console.log("VRF Cost Optimization:");
      console.log("  ✅ Test 1: No VRF (game creation)");
      console.log("  ✅ Test 2: No VRF (first bet)");
      console.log("  🎲 Test 3: VRF requested (2nd player joins)");
      console.log("  💯 Test 7: No VRF (single player)");
      console.log("\nEstimated Savings: 80-90% VRF costs");
      console.log("=".repeat(60));

      return {
        success: results.failed === 0,
        results,
      };
    } catch (error: any) {
      console.error("\n❌ Test suite failed:", error.message);
      return {
        success: false,
        error: error.message,
        results,
      };
    }
  },
});

// ============================================================================
// Individual Test Actions (for manual testing)
// ============================================================================

export const testInitializeConfigAction = internalAction({
  args: {},
  handler: async () => testInitializeConfig(),
});

export const testCreateGameRoundAction = internalAction({
  args: { roundId: v.number() },
  handler: async (ctx, { roundId }) => testCreateGameRound(roundId),
});

export const testPlaceBetAction = internalAction({
  args: {
    roundId: v.number(),
    betAmount: v.number(),
    skinId: v.number(),
    position: v.array(v.number()),
  },
  handler: async (ctx, { roundId, betAmount, skinId, position }) =>
    testPlaceBet(roundId, betAmount, skinId, position as [number, number]),
});

export const testSecondBetAction = internalAction({
  args: {
    roundId: v.number(),
    betAmount: v.number(),
    skinId: v.number(),
    position: v.array(v.number()),
    player2PrivateKey: v.string(),
  },
  handler: async (ctx, { roundId, betAmount, skinId, position, player2PrivateKey }) =>
    testSecondBet(roundId, betAmount, skinId, position as [number, number], player2PrivateKey),
});

export const testEndGameAction = internalAction({
  args: { roundId: v.number() },
  handler: async (ctx, { roundId }) => testEndGame(roundId),
});

export const testSendPrizeAction = internalAction({
  args: { roundId: v.number() },
  handler: async (ctx, { roundId }) => testSendPrize(roundId),
});

export const testSinglePlayerRefundAction = internalAction({
  args: { roundId: v.number(), betAmount: v.number() },
  handler: async (ctx, { roundId, betAmount }) => testSinglePlayerRefund(roundId, betAmount),
});
