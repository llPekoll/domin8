# Phase 6: Quick Reference Guide

## Fight Scene Animation Sequence

### Duration: ~12 seconds total

```
[0ms] ─────────────── START ───────────────
  ├─ Characters spawn (via PlayerManager)
  └─ Falling animation begins (0-250ms)

[250ms] ────── LANDING ────────
  ├─ Impact sound plays (random: impact-1,3,4,5,6,7,8)
  ├─ Landing animation plays
  └─ Transition to idle

[600ms] ────── ENTRANCE ────────
  ├─ Run animation starts
  ├─ Screen shake (200ms, 0.01)
  └─ Insert coin sound (0.6 volume)

[1500ms] ────── BATTLE PHASE ────────
  ├─ Full-screen explosion (200ms)
  ├─ Move to center (400ms)
  ├─ Run animations play
  ├─ 5x Continuous explosions (560ms spacing)
  ├─ Screen shake (400ms, 0.015)
  ├─ Blood splatters (multiple)
  └─ Duration: ~2800ms

[4500ms] ────── RESULTS PHASE ────────
  ├─ Mark losers as eliminated
  ├─ Explosion outward (physics)
  ├─ Winner celebration (3000ms)
  │   ├─ Throne appears
  │   ├─ Winner scales 2x
  │   ├─ Victory sound
  │   └─ Confetti (100 particles)
  └─ Duration: ~5000ms

[9500ms] ────── FADE OUT ────────
  ├─ Celebration objects fade
  └─ Cleanup begins

[~12000ms] ───── COMPLETE ────────
  └─ Emit "1v1-complete" event
```

## Sound Effects Reference

### By Event

| Event | Sound | Volume | File |
|-------|-------|--------|------|
| Fight starts | challenger | 0.8 | challenger.mp3 |
| Entrance | insert-coin | 0.6 | insert-coin.mp3 |
| During battle | battle-theme | 0.2 | battle-theme.mp3 |
| Landing | impact-* | 0.4 | impact-1/3/4/5/6/7/8.mp3 |
| Battle ends | explosion-dust | 0.7 | explosion-dust.mp3 |
| Victory | victory | 0.6 | victory.mp3 |
| Elimination | death-scream-* | 0.5 | death-scream-1-14.mp3 |

### Random Variations

**Impact Sounds** (landing)
- impact-1, impact-3, impact-4, impact-5, impact-6, impact-7, impact-8
- Random selection on each landing

**Death Screams** (elimination)
- death-scream-1 through death-scream-14
- Random selection per eliminated player

## Manager Methods Called

### PlayerManager
```typescript
playerManager.setMapData(oneVOneMapData)
playerManager.addParticipant(participantA)  // Left
playerManager.addParticipant(participantB)  // Right
playerManager.moveParticipantsToCenter()
playerManager.getParticipants()
playerManager.showResults(gameState)
playerManager.clearParticipants()
```

### AnimationManager
```typescript
animationManager.startBattlePhaseSequence(playerManager, callback)
animationManager.startResultsPhaseSequence(playerManager, winner, callback)
```

### SoundManager
```typescript
SoundManager.playChallenger(scene, 0.8)
SoundManager.playInsertCoin(scene, 0.6)
SoundManager.play(scene, "battle-theme", 0.2, { loop: true })
SoundManager.playRandomImpact(scene, 0.4)
SoundManager.playExplosion(scene, 0.7)
SoundManager.playVictory(scene, 0.6)
SoundManager.playRandomDeathScream(scene, 0.5)
```

### BackgroundManager
```typescript
backgroundManager.setBackgroundById(1)
```

## UI Display Updates

### Real-time from Convex Query
```typescript
useQuery(api.lobbies.getLobbyState, { lobbyId: lobby.lobbyId })
```

Updates:
- Lobby status (0 = waiting, 1 = resolved)
- Winner wallet address
- Character IDs
- Bet amounts

### Calculated Values
```typescript
totalPot = amount * 2
houseFee = totalPot * 0.02
winnerPrize = totalPot * 0.98
```

## Key Parameters

### Map Configuration
```typescript
{
  centerX: screenCenterX,
  centerY: screenCenterY,
  radiusX: screenCenterX * 0.4,      // Compact
  radiusY: screenCenterY * 0.3,
  minSpawnRadius: 0,
  maxSpawnRadius: 100,
  minSpacing: 50,
}
```

### Character Size
```typescript
betScale = 1.2  // Fixed for 1v1 visibility
```

### Animation Timing
```typescript
entryDelay: 600ms       // Wait for landing
battleStart: 1500ms     // After entrance
battleDuration: 2800ms  // Effects play
resultsDelay: 4500ms    // After battle
celebrationDuration: 5000ms
totalFightTime: ~12000ms
```

## Debugging Tips

### Check Character Spawning
```typescript
// In browser console
(window.phaserGame.scene.getScene("OneVOne")).playerManager.getParticipants()
```

### Monitor Sound Playback
```typescript
// Check global volume
SoundManager.getGlobalVolume()

// Check mute state
SoundManager.isSoundMuted()

// Toggle mute
SoundManager.toggleMute()
```

### View Animation Logs
```typescript
// Search console for:
[OneVOneScene]
[AnimationManager]
[PlayerManager]
[SoundManager]
```

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Characters don't spawn | Map data not set | Call `setMapData()` before `addParticipant()` |
| Sound doesn't play | Audio context suspended | Click any element to unlock audio |
| Battle skips phases | Wrong timing delays | Verify delays match animation durations |
| Memory leak | Cleanup not called | Ensure `clearParticipants()` runs on completion |
| Performance drops | Too many particles | Reduce confetti count (100 default) |
| Winner not found | Wallet address mismatch | Verify blockchain data matches DB |

## Phase Transition Events

### EventBus Emission
```typescript
EventBus.emit("1v1-complete")  // Signals React to update UI
```

### React Component Handling
```typescript
useEffect(() => {
  if (lobby.status === 1 && lobby.winner && !fightStarted) {
    // React to blockchain confirmation
  }
}, [lobby, fightStarted])
```

## Performance Targets

- **Frame Rate**: 60fps minimum during all animations
- **Memory**: < 50MB total (including audio)
- **Fight Duration**: 10-14 seconds
- **Audio Load**: < 5MB (preloaded)
- **Particle Count**: Max 150 total (100 confetti + 50 debris)

## Files to Check

### Code Files
- `src/game/scenes/OneVOneScene.ts` - Main scene logic
- `src/components/onevone/OneVOneFightScene.tsx` - React wrapper
- `src/game/managers/PlayerManager.ts` - Character management
- `src/game/managers/AnimationManager.ts` - Battle sequences
- `src/game/managers/SoundManager.ts` - Audio control

### Documentation Files
- `docs/PHASE_6_IMPLEMENTATION.md` - Full implementation guide
- `docs/PHASE_6_SUMMARY.md` - Summary of changes
- `docs/1v1_step_by_step_plan.md` - Overall roadmap

## Ready for Phase 7?

Phase 6 is complete when:
- ✅ All animations play smoothly (60fps)
- ✅ Sound effects trigger at correct times
- ✅ UI updates real-time from Convex
- ✅ Winner determined correctly
- ✅ Memory cleaned up between fights
- ✅ Mobile responsive
- ✅ No console errors

Next: Phase 7 - Final Testing & Polish
