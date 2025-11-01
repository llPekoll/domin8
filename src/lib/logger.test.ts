/**
 * Simple Logger Test
 * 
 * Run this to verify the logger works correctly.
 * You can test different configurations by changing environment variables.
 */

import { logger } from './logger';

export function testLogger() {
  console.log('\n=== Logger Test Suite ===\n');
  
  // Test general logging
  logger.info('ℹ️ Testing general INFO logging');
  logger.warn('⚠️ Testing general WARN logging');
  logger.error('❌ Testing general ERROR logging');
  logger.debug('🐛 Testing general DEBUG logging');
  
  console.log('\n--- Category-specific logging ---\n');
  
  // Test Solana category
  logger.solana.info('Transaction sent successfully');
  logger.solana.debug('PDA derived:', { address: '0x123...', seeds: ['example'] });
  logger.solana.error('Transaction failed:', new Error('Network timeout'));
  
  // Test UI category
  logger.ui.info('Component mounted: CharacterSelection');
  logger.ui.debug('State updated:', { prevState: 'idle', newState: 'loading' });
  
  // Test Game category
  logger.game.info('Player spawned at position:', { x: 100, y: 200 });
  logger.game.debug('Animation frame:', { frame: 42, timestamp: Date.now() });
  
  console.log('\n--- Grouping ---\n');
  
  // Test grouping
  logger.solana.group('Creating new game transaction');
  logger.solana.debug('Step 1: Deriving PDAs...');
  logger.solana.debug('Step 2: Creating transaction...');
  logger.solana.debug('Step 3: Signing transaction...');
  logger.solana.groupEnd();
  
  console.log('\n--- Timing ---\n');
  
  // Test timing
  logger.solana.time('mock-transaction');
  setTimeout(() => {
    logger.solana.timeEnd('mock-transaction');
  }, 100);
  
  console.log('\n--- Table Display ---\n');
  
  // Test table display
  const participants = [
    { name: 'Player1', balance: 1.5, status: 'active' },
    { name: 'Player2', balance: 2.3, status: 'waiting' },
    { name: 'Player3', balance: 0.8, status: 'active' },
  ];
  logger.solana.table(participants);
  
  console.log('\n--- Configuration Info ---\n');
  
  // Show configuration
  console.log('Logger enabled:', logger.isEnabled());
  console.log('Debug enabled:', logger.isDebugEnabled());
  console.log('Log level:', logger.getLogLevel());
  console.log('Active categories:', Array.from(logger.getCategories()).join(', '));
  
  console.log('\n=== Test Complete ===\n');
  console.log('💡 Try changing environment variables in .env.local:');
  console.log('   - VITE_LOG_LEVEL=INFO (to hide debug logs)');
  console.log('   - VITE_LOG_CATEGORIES=SOLANA (to show only Solana logs)');
  console.log('   - VITE_LOGGER_ENABLED=false (to disable all logging)');
  console.log('');
}

// Uncomment to run tests immediately when imported
// testLogger();
