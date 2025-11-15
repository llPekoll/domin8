# Phase 6: Frontend - Fight Scene & Animation Implementation

## Overview

Phase 6 implements comprehensive fight scene animations for 1v1 Coinflip battles. The implementation leverages existing game managers (PlayerManager, AnimationManager, BackgroundManager, SoundManager) to create an engaging, polished battle experience.

## Architecture

### Core Components

1. **OneVOneScene.ts** - Main Phaser scene handling 1v1 fight logic
2. **OneVOneFightScene.tsx** - React wrapper displaying fight UI and real-time updates
3. **Existing Managers** - Reused for consistent animation and state management

### Flow Diagram

```
OneVOneFightScene.tsx (React)
    ↓
[Blockchain Confirmation]
    ↓
OneVOneScene.ts (Phaser)
    ↓
┌─────────────────────────────────────────────┐
│ Phase 1: Entrance & Spawn                   │
│ - Characters fall from top                  │
│ - Land with dust effects                    │
│ - Play landing animations (250ms)           │
│ - Play challenger sound                     │
└─────────────────────────────────────────────┘
           ↓ (600ms delay)
┌─────────────────────────────────────────────┐
│ Phase 2: Dramatic Entrance                  │
│ - Both players run towards center           │
│ - Shake screen on start (200ms)             │
│ - Play insert-coin sound                    │
└─────────────────────────────────────────────┘
           ↓ (1500ms total)
┌─────────────────────────────────────────────┐
│ Phase 3: Battle Sequence (via AnimationManager) │
│ - Full-screen explosion animation           │
│ - Participants move to center               │
│ - 5 sequential explosions with effects      │
│ - Screen shake (400ms)                      │
│ - Blood splatters and debris                │
│ - Duration: ~4.5 seconds                    │
└─────────────────────────────────────────────┘
           ↓ (4500ms)
┌─────────────────────────────────────────────┐
│ Phase 4: Results & Celebration              │
│ - Mark losers as eliminated                 │
│ - Physics-based explosion for losers        │
│ - Winner celebration (3-5s)                 │
│ - Confetti effect                           │
│ - Victory sound                             │
│ - Throne animation                          │
│ - Winner scaling up 2x                      │
└─────────────────────────────────────────────┘
           ↓ (5000ms total)
Emit "1v1-complete" event
React component handles UI updates
```

## Implementation Details

### 1. OneVOneScene.ts Enhancements

#### Character Spawning (`startFight` method)

```typescript
// Creates 1v1 map configuration with centered spawn ellipse
const oneVOneMapData = {
  spawnConfiguration: {
    centerX: this.centerX,
    centerY: this.centerY,
    radiusX: this.centerX * 0.4,  // Compact for 1v1
    radiusY: this.centerY * 0.3,
    minSpawnRadius: 0,
    maxSpawnRadius: 100,
    minSpacing: 50,
  },
};

// PlayerManager handles falling animation automatically
this.playerManager.setMapData(oneVOneMapData);
this.playerManager.addParticipant(participantA);  // Left position
this.playerManager.addParticipant(participantB);  // Right position
```

**Features:**
- Characters fall from top with "falling" animation
- Land with impact sounds and dust effects
- Transition to idle after landing (250ms tween)
- Names visible throughout

#### Entrance Animation (`playEntranceAnimation` method)

```typescript
// Transition from idle to run animation
// Screen shake creates drama
// Insert coin sound plays
// Both players charge towards center
```

**Sound Effects:**
- `challenger` - When fight starts (0.8 volume)
- `insert-coin` - During entrance (0.6 volume)

#### Battle Sequence (`runBattle` method)

Delegates to `AnimationManager.startBattlePhaseSequence()` which provides:

1. **Full-screen explosion** - Initial impact
2. **Participant movement** - Characters move towards center
3. **Continuous explosions** - 5 sequential impacts over ~2 seconds
4. **Screen shakes** - 400ms duration with 0.015 intensity
5. **Blood effects** - Local splatters during battle

**Key Parameters:**
- Battle duration: ~4.5 seconds total
- Fullscreen explosion at 200ms mark
- Continuous explosions start at 200ms
- Results phase queued at 4500ms

#### Results Phase (`showResults` method)

Uses `AnimationManager.startResultsPhaseSequence()` which:

1. **Marks losers** - Sets `eliminated = true` for non-winners
2. **Physics explosion** - Losers explode outward with realistic trajectory
3. **Winner celebration**:
   - Scale up 2x (1000ms tween)
   - Move to center
   - Golden tint (optional)
   - Victory animation plays
   - Throne appears with fade-in
   - Confetti animation
   - Victory sound (0.6 volume)

**Visual Effects:**
- Dark background overlay (0.7 alpha)
- Throne sprite at center
- Multiple blood splatters
- Debris particles
- Full-screen celebration

### 2. OneVOneFightScene.tsx Enhancements

#### Enhanced UI Layout

**Header Section:**
```tsx
// Shows battle title and lobby ID
// Displays real-time status (Pending/Fighting/Complete)
```

**Game Container:**
- Aspect ratio: 16:9
- Border: 2px indigo-500
- Loading spinner while fight initializes
- Overlay hidden once fight starts

**Player Stats Grid:**
- 2-column layout (left/right)
- Shows wallet address (truncated)
- Character ID display
- Bet amount in SOL
- Winner indicator (green border + checkmark)
- Dynamic coloring based on status

**Prize Pool Information:**
- 3-column grid layout
- **Total Pot**: Sum of both bets (e.g., 0.02 SOL)
- **House Fee**: 2% deduction (e.g., 0.0004 SOL)
- **Winner Prize**: 98% of pot (e.g., 0.0196 SOL)
- Gradient background (indigo → purple)

**Result Banner:**
- Animated on completion
- Shows "🏆 VICTORY! 🏆" text
- Displays winner wallet and prize
- Gradient background (yellow → orange)
- Pulse animation

#### Real-time Updates

The component listens to `useQuery(api.lobbies.getLobbyState)`:

```typescript
// Updates when:
// - Lobby status changes from 0 → 1
// - Winner is determined
// - Player details are confirmed
```

### 3. Manager Integration

#### PlayerManager Usage

**Methods Called:**
- `setMapData()` - Configure 1v1 arena spawn points
- `addParticipant()` - Spawn both players with falling animation
- `moveParticipantsToCenter()` - Move to battle positions
- `getParticipants()` - Get list of players for results
- `showResults()` - Position winner and fade losers
- `clearParticipants()` - Cleanup after fight

**Features Enabled:**
- Falling animation (automatic)
- Landing animation with sound (automatic)
- Scale based on bet amount (automatic)
- Idle/run/attack animations
- Name display with proper positioning
- Dust effects (back and front)

#### AnimationManager Usage

**Methods Called:**
- `startBattlePhaseSequence()` - Comprehensive battle animation
- `startResultsPhaseSequence()` - Results and celebration
- `createContinuousExplosions()` - Multiple explosions
- `explodeParticipantsOutward()` - Physics-based elimination
- `addWinnerCelebration()` - Confetti and effects

**Features Enabled:**
- Full-screen explosion animation
- Directional blood effects
- Physics-accurate particle trajectories
- Screen shake calculations
- Audio trigger callbacks
- Celebration object management

#### SoundManager Usage

**Sound Effects:**
- `battle-theme` - Loop during fight (0.2 volume)
- `challenger` - Fight start (0.8 volume)
- `insert-coin` - Entrance (0.6 volume)
- `explosion-dust` - Battle explosions (0.7 volume)
- `victory` - Winner celebration (0.6 volume)
- `impact-*` - Character landing (0.4 volume)
- `death-scream-*` - Elimination (0.5-0.6 volume)

**Features Enabled:**
- Global volume control
- Mute state persistence
- Battle music loop control
- Random sound variations
- Audio unlock on first interaction

#### BackgroundManager Usage

**Configuration:**
- Fixed arena background (bg1)
- Set during scene creation
- Provides consistent visual environment

### 4. Animation Timeline

**Total Duration: ~12 seconds**

| Time | Event | Duration | Sound |
|------|-------|----------|-------|
| 0ms | Fight starts | - | - |
| 0-250ms | Characters fall | 250ms | - |
| 250ms | Landing animation | - | impact-* |
| 600ms | Entrance animation starts | - | challenger |
| 600-900ms | Run towards center | 300ms | insert-coin |
| 1500-1700ms | Fullscreen explosion | 200ms | explosion-dust |
| 1700-4500ms | Battle phase | 2800ms | - |
| 2000-4500ms | Continuous explosions | - | - |
| 4500ms | Results phase starts | - | - |
| 4500-8000ms | Loser explosion physics | 3500ms | death-scream-* |
| 5500-8500ms | Winner celebration | 3000ms | victory |
| 8500-10000ms | Confetti falls | 1500ms | - |
| 10000ms | Fade-out celebration | - | - |
| ~12000ms | Completion event | - | - |

## Sound Effects Library

### Required Audio Files

All audio files should be preloaded in the Phaser scene. The game should have:

```
battle-theme.mp3           // Background music loop (0.2 volume)
challenger.mp3             // Fight start fanfare
insert-coin.mp3            // Dramatic entrance cue
explosion-dust.mp3         // Explosion sound
victory.mp3                // Victory fanfare
impact-1/3/4/5/6/7/8.mp3   // Impact sounds (random)
death-scream-1-14.mp3      // Death screams (random)
```

**Preload Location:** `src/game/main.ts` scene preload

## Testing Guide

### 1. Character Spawning Test
```
✓ Characters spawn at top of screen
✓ Characters fall smoothly (250ms)
✓ Landing animations play
✓ Impact sounds trigger on landing
✓ Dust effects appear at feet
✓ Names display correctly positioned
```

### 2. Battle Sequence Test
```
✓ Full-screen explosion animates
✓ Characters move to center (400-600ms)
✓ Run animations play during movement
✓ Continuous explosions sequence (5 total)
✓ Screen shake effect plays
✓ Blood splatters appear randomly
✓ Battle music loops
✓ Battle phase completes in ~4.5s
```

### 3. Results Phase Test
```
✓ Loser marked as eliminated
✓ Loser explosion physics work correctly
✓ Loser travels off-screen
✓ Winner celebration animation
✓ Winner scaled up 2x
✓ Throne appears at center
✓ Confetti falls from top
✓ Victory sound plays
✓ Results complete in ~5s
```

### 4. UI Updates Test
```
✓ Loading spinner displays initially
✓ Game renders when fight starts
✓ Player stats display correctly
✓ Prize calculations are accurate
✓ Winner indicator shows green border
✓ Result banner animates on completion
✓ Real-time lobby status updates
```

### 5. Sound Effects Test
```
✓ Battle theme loops without cutoff
✓ Challenger fanfare plays at correct volume
✓ Impact sounds vary (random selection)
✓ Death screams vary (random selection)
✓ Victory sound plays once on win
✓ Global volume slider affects all sounds
✓ Mute toggle silences everything
```

### 6. Mobile Responsiveness Test
```
✓ Game container scales to device width
✓ Text sizes adjust for small screens
✓ Touch interactions work correctly
✓ Animations still smooth on mobile
```

## Performance Considerations

### Optimization Tips

1. **Particle Count**: Monitor confetti particles (100 total)
   - Reduce if performance drops below 60fps
   - Use object pooling for repeated particles

2. **Explosion Frequency**: 5 explosions over 2.8 seconds
   - Space them evenly (560ms apart)
   - Reuse explosion sprite if possible

3. **Physics Simulation**: For eliminated participants
   - Use native Phaser tweens instead of manual physics
   - Simplify collision detection
   - Destroy off-screen particles immediately

4. **Audio Context**:
   - Unlock on first user interaction (already implemented)
   - Limit simultaneous sound playback to 8-10
   - Use short sound files (< 2 seconds)

5. **Memory Management**:
   - Clear all celebrationObjects after fade-out
   - Destroy sprites immediately off-screen
   - Call `cleanup()` between rounds

## Debugging

### Console Logging

The implementation includes extensive logging via `logger.game.debug()`:

```typescript
// Scene lifecycle
[OneVOneScene] Starting 1v1 fight
[OneVOneScene] Playing entrance animation
[OneVOneScene] Running battle animation
[OneVOneScene] Showing fight results
[OneVOneScene] 1v1 fight completed

// Manager calls
[AnimationManager] Starting battle phase sequence
[AnimationManager] Starting results phase sequence
[PlayerManager] Participant added successfully
[SoundManager] Playing "victory" at volume 0.6
```

### Browser DevTools

1. **Performance Tab**:
   - Monitor frame rate (should stay 60fps)
   - Check for memory leaks (cleanup verification)
   - Profile animation frames

2. **Audio DevTools**:
   - Verify sound playback
   - Check volume levels
   - Test mute functionality

3. **Network Tab**:
   - Verify audio assets load
   - Check Convex API calls for lobby updates

### Common Issues

**Issue**: Characters not spawning
- **Cause**: Map data not set on PlayerManager
- **Fix**: Call `playerManager.setMapData()` before `addParticipant()`

**Issue**: Battle continues after winner shown
- **Cause**: DelayedCall timing misconfigured
- **Fix**: Verify timing values match animation durations

**Issue**: Sound doesn't play
- **Cause**: Audio context suspended (browser autoplay policy)
- **Fix**: Ensure audio is unlocked on first interaction

**Issue**: Performance drops during explosions
- **Cause**: Too many particles/tweens
- **Fix**: Reduce explosion count or use object pooling

## Integration with Existing Code

### Files Modified

1. **src/game/scenes/OneVOneScene.ts**
   - Enhanced `startFight()` with entrance animation
   - Improved `runBattle()` with full AnimationManager integration
   - Enhanced `showResults()` with results phase sequence
   - Added `playEntranceAnimation()` helper

2. **src/components/onevone/OneVOneFightScene.tsx**
   - Enhanced UI with more detailed player stats
   - Added prize breakdown display
   - Added winner indicator with styling
   - Improved loading state visuals
   - Added result banner animation

### Files Unchanged (but leveraged)

- **src/game/managers/PlayerManager.ts** - Character spawning and positioning
- **src/game/managers/AnimationManager.ts** - Battle and results sequences
- **src/game/managers/BackgroundManager.ts** - Arena background
- **src/game/managers/SoundManager.ts** - Audio management
- **src/game/EventBus.ts** - Scene communication

## Future Enhancements

### Potential Improvements

1. **Camera Effects**:
   - Zoom in on winner during celebration
   - Cinematic letterbox effect during key moments

2. **Character-Specific Effects**:
   - Character-specific victory animations
   - Different explosion patterns per character type

3. **Environmental Effects**:
   - Weather animations based on map
   - Dynamic lighting changes

4. **Audio Improvements**:
   - Character-specific voice lines
   - Announcer commentary
   - Dynamic music based on battle intensity

5. **UI Enhancements**:
   - Floating damage numbers
   - Combo counters
   - Real-time stats display

## Checklist for Phase 6 Completion

- [x] Character spawning with falling animation
- [x] Landing animation with sound effects
- [x] Entrance animation sequence
- [x] Battle phase animation (full-screen explosion)
- [x] Continuous explosions during battle
- [x] Screen shake effects
- [x] Blood splatter effects
- [x] Loser elimination physics
- [x] Winner celebration animation
- [x] Confetti particle effect
- [x] Throne animation
- [x] Sound effect integration (7+ effects)
- [x] UI enhancements (detailed player stats)
- [x] Prize breakdown display
- [x] Winner indicator styling
- [x] Result banner animation
- [x] Real-time lobby status updates
- [x] Loading state improvements
- [x] Mobile responsiveness
- [x] Performance optimization (< 4.5s per phase)

## Summary

Phase 6 successfully transforms the 1v1 fight scene into a polished, engaging experience by:

1. **Leveraging existing managers** for consistent, maintainable code
2. **Creating clear animation phases** (entrance → battle → results)
3. **Integrating comprehensive sound effects** for audio immersion
4. **Providing detailed UI** showing real-time battle information
5. **Optimizing performance** for smooth 60fps animations
6. **Maintaining code quality** with extensive logging and error handling

The implementation is production-ready and can handle multiple concurrent 1v1 battles with proper cleanup between rounds.
