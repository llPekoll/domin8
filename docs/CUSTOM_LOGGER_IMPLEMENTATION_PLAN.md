# Custom Logger Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to replace all `console.log`, `console.error`, `console.warn`, and `console.debug` statements throughout the React/TypeScript project with a custom logger system that supports multiple debug modes configurable via environment variables.

## Current State Analysis

### Console Usage Statistics
- **Total console statements found**: 100+ across the codebase
- **Primary locations**:
  - `src/hooks/useGameContract.ts`: ~70 console statements (placeBet function heavily instrumented)
  - `src/lib/demoGenerator.ts`: ~10 statements
  - `src/hooks/useActiveGame.ts`: ~15 statements
  - `src/game/scenes/DemoScene.ts`: ~5 statements
  - `src/components/CharacterSelection.tsx`: ~5 statements
  - `src/components/DemoGameManager.tsx`: ~10 statements
  - Various other files: ~20 statements

### Categories of Logging Identified
1. **Solana/Blockchain Operations** (`solana_debug`)
   - Transaction signing
   - PDA derivations
   - Wallet operations
   - Smart contract interactions
   - VRF operations
   - Account fetching

2. **UI/React Component Debugging** (`ui_debug`)
   - Component lifecycle
   - State updates
   - User interactions
   - Demo mode UI updates
   - Phase transitions

3. **Game Logic & Phaser** (`game_debug`)
   - Scene initialization
   - Participant spawning
   - Animation events
   - Game phase transitions
   - Audio management

4. **General Information** (`info`)
   - Important events
   - User-facing messages
   - Configuration summaries
   - Warnings and errors (always shown)

5. **Development/Debugging** (`debug`)
   - Verbose technical details
   - Performance measurements
   - Intermediate values
   - Algorithm steps

## Proposed Architecture

### 1. Logger Core Module

**Location**: `src/lib/logger.ts`

```typescript
// Logger configuration types
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export enum LogCategory {
  GENERAL = 'GENERAL',
  SOLANA = 'SOLANA',
  UI = 'UI',
  GAME = 'GAME',
}

// Logger configuration interface
interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  categories: Set<LogCategory>;
  timestamp: boolean;
  stackTrace: boolean;
}

// Main Logger class (singleton pattern)
class Logger {
  private config: LoggerConfig;
  private static instance: Logger;
  
  // Category-specific loggers
  solana: CategoryLogger;
  ui: CategoryLogger;
  game: CategoryLogger;
  
  // Methods: info(), warn(), error(), debug()
}
```

### 2. Environment Variables

**Location**: `.env.local`

```bash
# Logger Configuration
# =====================

# Master logger switch (true/false)
VITE_LOGGER_ENABLED=true

# Log level: NONE, ERROR, WARN, INFO, DEBUG
VITE_LOG_LEVEL=DEBUG

# Active categories (comma-separated): SOLANA,UI,GAME,GENERAL
# Examples:
# - "SOLANA" = Only Solana/blockchain logs
# - "UI,GAME" = UI and game logs only
# - "SOLANA,UI,GAME" = All debug categories
# - "" (empty) = Only general logs (info/warn/error)
VITE_LOG_CATEGORIES=SOLANA,UI,GAME

# Show timestamps in logs (true/false)
VITE_LOG_TIMESTAMP=true

# Show stack traces for errors (true/false)
VITE_LOG_STACK_TRACE=true
```

### 3. TypeScript Environment Types

**Location**: `src/vite-env.d.ts`

```typescript
interface ImportMetaEnv {
  // Existing variables...
  
  // Logger configuration
  readonly VITE_LOGGER_ENABLED?: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_LOG_CATEGORIES?: string;
  readonly VITE_LOG_TIMESTAMP?: string;
  readonly VITE_LOG_STACK_TRACE?: string;
}
```

## Implementation Strategy

### Phase 1: Core Logger Development (Day 1)

#### Task 1.1: Create Logger Module
- Create `src/lib/logger.ts` with full implementation
- Implement singleton pattern for global access
- Add configuration parsing from environment variables
- Create category-specific logger instances
- Add colorization for different log levels (browser console)

#### Task 1.2: Create Logger Utilities
- Add prefix/namespace support for easier debugging
- Implement log grouping for related operations
- Add performance timing utilities
- Create structured logging helpers (for objects/arrays)

#### Task 1.3: Testing
- Create `src/lib/logger.test.ts` (optional but recommended)
- Test all log levels
- Test category filtering
- Test configuration options

### Phase 2: Environment Configuration (Day 1-2)

#### Task 2.1: Update Environment Files
- Add logger configuration to `.env.local`
- Document all options with clear comments
- Create `.env.example` with default logger settings

#### Task 2.2: Update TypeScript Definitions
- Extend `vite-env.d.ts` with logger environment types
- Ensure type safety for all logger configurations

### Phase 3: Migration to Custom Logger (Day 2-4)

#### Priority Order (by file complexity and usage frequency):

**HIGH PRIORITY** (Most console.log statements):
1. `src/hooks/useGameContract.ts` (~70 statements)
2. `src/hooks/useActiveGame.ts` (~15 statements)
3. `src/components/DemoGameManager.tsx` (~10 statements)
4. `src/lib/demoGenerator.ts` (~10 statements)

**MEDIUM PRIORITY**:
5. `src/game/scenes/DemoScene.ts` (~5 statements)
6. `src/game/scenes/Game.ts` (~5 statements)
7. `src/components/CharacterSelection.tsx` (~5 statements)
8. `src/hooks/usePrivyWallet.ts` (~3 statements)
9. `src/hooks/useGameState.ts` (~2 statements)

**LOW PRIORITY** (Remaining files):
10. All other files with console statements

#### Task 3.1: Migration Pattern

For each file, follow this pattern:

```typescript
// 1. Import the logger
import { logger } from '~/lib/logger';

// 2. For Solana/blockchain operations
// OLD: console.log("[placeBet] Transaction successful:", signature);
// NEW: logger.solana.info("[placeBet] Transaction successful:", signature);

// 3. For UI/React operations
// OLD: console.log("[DemoScene] Initializing background with:", data);
// NEW: logger.ui.debug("[DemoScene] Initializing background with:", data);

// 4. For game logic operations
// OLD: console.log("[DemoGenerator] Bot spawned:", botInfo);
// NEW: logger.game.debug("[DemoGenerator] Bot spawned:", botInfo);

// 5. For errors (always shown regardless of category)
// OLD: console.error("Error fetching balance:", error);
// NEW: logger.error("Error fetching balance:", error);

// 6. For warnings (always shown)
// OLD: console.warn("Warning: Game state invalid");
// NEW: logger.warn("Warning: Game state invalid");

// 7. For general info (not category-specific)
// OLD: console.log("Network:", network);
// NEW: logger.info("Network:", network);
```

#### Task 3.2: Special Cases

**Commented-out console.logs**:
- Remove completely during migration
- Example: `// console.log("[PrivyWalletAdapter] Initialized...")`

**Console statements in comments/documentation**:
- Keep as-is (they're examples for users)
- Example: `* console.log('Transaction successful:', signature);`

**Performance-critical sections**:
- Use conditional compilation or inline checks
- Example: `if (logger.isDebugEnabled()) { logger.debug(...) }`

### Phase 4: Documentation & Testing (Day 4-5)

#### Task 4.1: Developer Documentation
- Create usage guide for team members
- Document how to enable specific debug modes
- Provide common debugging scenarios
- Add examples for each log category

#### Task 4.2: README Updates
- Add logger configuration section to README.md
- Document environment variables
- Provide troubleshooting tips

#### Task 4.3: Testing
- Test with all categories enabled
- Test with individual categories
- Test with logger disabled
- Verify no console.log remains in production builds

### Phase 5: Production Optimization (Day 5)

#### Task 5.1: Build Optimization
- Add Vite plugin to strip debug logs in production
- Ensure `VITE_LOGGER_ENABLED=false` is respected
- Test production bundle size reduction

#### Task 5.2: Performance Validation
- Measure performance impact in development
- Ensure no performance degradation in production
- Benchmark before/after migration

## Detailed Logger API Design

### Basic Usage

```typescript
import { logger } from '~/lib/logger';

// General logging (always visible when level allows)
logger.info('Application started');
logger.warn('Configuration missing, using defaults');
logger.error('Failed to connect to network', error);
logger.debug('Intermediate calculation result:', value);

// Category-specific logging (respects VITE_LOG_CATEGORIES)
logger.solana.info('Transaction sent:', txSignature);
logger.solana.debug('PDA derived:', { pda: pdaAddress, seeds });
logger.solana.error('Transaction failed:', error);

logger.ui.info('Component mounted:', componentName);
logger.ui.debug('State updated:', { prevState, newState });

logger.game.info('Player spawned:', playerId);
logger.game.debug('Animation frame:', frameData);
```

### Advanced Features

```typescript
// Grouping related logs
logger.solana.group('Creating new game');
logger.solana.debug('Deriving PDAs...');
logger.solana.debug('Creating transaction...');
logger.solana.debug('Signing transaction...');
logger.solana.groupEnd();

// Performance timing
logger.solana.time('transaction');
await sendTransaction();
logger.solana.timeEnd('transaction'); // Logs: "transaction: 234ms"

// Structured data logging
logger.solana.table(betAmounts); // Displays array/object as table

// Conditional logging with context
logger.solana.debugIf(condition, 'Only logged when condition is true', data);
```

### Configuration Examples

**Development (all logs):**
```bash
VITE_LOGGER_ENABLED=true
VITE_LOG_LEVEL=DEBUG
VITE_LOG_CATEGORIES=SOLANA,UI,GAME
```

**Debugging Solana issues only:**
```bash
VITE_LOGGER_ENABLED=true
VITE_LOG_LEVEL=DEBUG
VITE_LOG_CATEGORIES=SOLANA
```

**Production (errors only):**
```bash
VITE_LOGGER_ENABLED=true
VITE_LOG_LEVEL=ERROR
VITE_LOG_CATEGORIES=
```

**Completely silent:**
```bash
VITE_LOGGER_ENABLED=false
```

## Migration Checklist

### Pre-Migration
- [ ] Create logger module (`src/lib/logger.ts`)
- [ ] Add environment variables to `.env.local`
- [ ] Update TypeScript definitions
- [ ] Test logger in isolation
- [ ] Document logger API

### Migration (Per File)
- [ ] Import logger at top of file
- [ ] Replace `console.log` with appropriate logger method
- [ ] Replace `console.error` with `logger.error` or `logger.solana.error`
- [ ] Replace `console.warn` with `logger.warn`
- [ ] Replace `console.debug` with appropriate category debug
- [ ] Remove commented-out console statements
- [ ] Test file functionality
- [ ] Verify logs appear correctly in console

### Post-Migration
- [ ] Run full application test
- [ ] Test each log category independently
- [ ] Verify logger can be disabled
- [ ] Update team documentation
- [ ] Create migration PR
- [ ] Code review with team

## File-by-File Migration Plan

### File 1: `src/lib/logger.ts` (NEW)
**Action**: Create new file
**Lines**: ~300-400 lines
**Effort**: 4-6 hours

### File 2: `src/hooks/useGameContract.ts`
**Action**: Migrate ~70 console statements
**Categories**: Primarily `SOLANA`, some `GENERAL`
**Effort**: 2-3 hours
**Notes**: 
- Most statements in `placeBet` function
- Heavy PDA derivation logging
- Transaction signing logs
- VRF operations

**Example migrations**:
```typescript
// Line 69-71 (Wallet adapter signing)
console.log("[PrivyWalletAdapter] Signing transaction with chainId:", chainId);
console.log("[PrivyWalletAdapter] Network:", this.network);
console.log("[PrivyWalletAdapter] Privy wallet:", this.privyWallet);
// ↓
logger.solana.debug("[PrivyWalletAdapter] Signing transaction", {
  chainId,
  network: this.network,
  wallet: this.privyWallet?.address
});

// Line 360-364 (PlaceBet initialization)
console.log("[placeBet] Starting placeBet function");
console.log("[placeBet] Connected:", connected);
console.log("[placeBet] PublicKey:", publicKey?.toString());
// ↓
logger.solana.group("[placeBet] Starting placeBet function");
logger.solana.debug("Connection status", { connected, publicKey: publicKey?.toString() });
```

### File 3: `src/hooks/useActiveGame.ts`
**Action**: Migrate ~15 console statements
**Categories**: `SOLANA` (blockchain subscription logs)
**Effort**: 1 hour
**Notes**:
- Account subscription logs
- Account data decoding
- Error handling

### File 4: `src/components/DemoGameManager.tsx`
**Action**: Migrate ~10 console statements
**Categories**: `UI`, `GAME`
**Effort**: 1 hour
**Notes**:
- Demo phase transitions
- Participant spawning
- Position generation

### File 5: `src/lib/demoGenerator.ts`
**Action**: Migrate ~10 console statements
**Categories**: `GAME`
**Effort**: 30 minutes
**Notes**:
- Bot spawn scheduling
- Timing calculations

### File 6: `src/game/scenes/DemoScene.ts`
**Action**: Migrate ~5 console statements
**Categories**: `GAME`, `UI`
**Effort**: 30 minutes
**Notes**:
- Scene initialization
- Background setup

### File 7: `src/game/scenes/Game.ts`
**Action**: Migrate ~5 console statements
**Categories**: `GAME`
**Effort**: 30 minutes
**Notes**:
- Audio/intro sound errors

### File 8: `src/components/CharacterSelection.tsx`
**Action**: Migrate ~5 console statements
**Categories**: `UI`
**Effort**: 30 minutes
**Notes**:
- Betting window logic

### Files 9-15: Remaining files
**Action**: Migrate remaining ~20 console statements
**Categories**: Mixed
**Effort**: 2 hours total

## Best Practices & Guidelines

### 1. Log Levels
- **ERROR**: Exceptions, critical failures, data corruption
- **WARN**: Unexpected but handled situations, deprecated usage
- **INFO**: Important events, state changes, user actions
- **DEBUG**: Detailed debugging information, verbose data

### 2. Category Selection
- **SOLANA**: Anything touching web3.js, Anchor, transactions, PDAs
- **UI**: React components, hooks, state management, user interactions
- **GAME**: Phaser scenes, game logic, animations, physics
- **GENERAL**: Everything else (info/warn/error that's not category-specific)

### 3. Message Formatting
- Use consistent prefixes: `[ComponentName] Message`
- Group related operations: `logger.group()` / `logger.groupEnd()`
- Include context: Pass objects with relevant data
- Avoid excessive verbosity: Balance detail with readability

### 4. Performance Considerations
- Use `logger.isDebugEnabled()` for expensive operations
- Avoid string concatenation in hot paths
- Defer expensive computations until log is confirmed needed

### 5. Security
- Never log sensitive data (private keys, passwords, tokens)
- Redact or truncate wallet addresses in production
- Use `NODE_ENV` checks for sensitive debug info

## Risks & Mitigation

### Risk 1: Breaking Existing Debugging Workflows
**Impact**: High
**Mitigation**: 
- Preserve console output format
- Provide quick environment variable guide
- Default to "all logs enabled" in development

### Risk 2: Performance Degradation
**Impact**: Medium
**Mitigation**:
- Benchmark before/after
- Add conditional compilation for production
- Use lazy evaluation for expensive log operations

### Risk 3: Incomplete Migration
**Impact**: Medium
**Mitigation**:
- Use ESLint rule to prevent new console.log
- Add pre-commit hook to check for console statements
- Comprehensive grep/search before completion

### Risk 4: Team Adoption
**Impact**: Medium
**Mitigation**:
- Clear documentation
- Migration examples
- Team training session
- PR review guidelines

## Success Criteria

### Functional
- [ ] Zero `console.log` statements remain in codebase (except in comments)
- [ ] All log categories work independently
- [ ] Logger can be completely disabled
- [ ] Environment variables control logging behavior

### Technical
- [ ] No performance regression in development
- [ ] Production builds have minimal logging overhead
- [ ] TypeScript types are complete and accurate
- [ ] All tests pass after migration

### User Experience
- [ ] Logs are readable and well-formatted
- [ ] Easy to enable/disable specific debug categories
- [ ] Quick setup for new developers
- [ ] Clear documentation available

## Timeline Estimate

- **Day 1**: Core logger development + environment setup (6-8 hours)
- **Day 2**: Migrate high-priority files (6-8 hours)
- **Day 3**: Migrate medium-priority files (6-8 hours)
- **Day 4**: Migrate remaining files + testing (6-8 hours)
- **Day 5**: Documentation, optimization, final review (4-6 hours)

**Total Estimate**: 5 days (28-38 hours)

## Maintenance Plan

### Ongoing
- Update logger when adding new categories
- Review log levels periodically
- Optimize performance as needed
- Update documentation with new patterns

### Quarterly
- Review and clean up verbose logs
- Analyze production error patterns
- Update logger utilities based on usage

## References & Resources

### Similar Implementations
- Winston (Node.js logging)
- Pino (Node.js logging)
- Log4js
- Debug (npm package pattern)

### Internal References
- Current console usage: 100+ statements
- Primary files: `useGameContract.ts`, `useActiveGame.ts`, `DemoGameManager.tsx`
- Categories identified: SOLANA, UI, GAME, GENERAL

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Author**: Development Team  
**Status**: Ready for Implementation
