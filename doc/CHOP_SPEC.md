# CHOP - Game Specification

## Concept
Timberman-style PVP game on Solana. Players bet SOL and compete in real-time.

---

## Modes

### 1. Solo Mode
- **0.001 SOL = 10 games**
- Weekly leaderboard
- **Lives system (continue):**
  - You die → "Continue?" → pay → resume your score
  - **Price x10 per life:**
    - Life 1: 0.001 SOL
    - Life 2: 0.01 SOL
    - Life 3: 0.1 SOL
    - Life 4: 1 SOL
    - Life 5: 10 SOL
    - Life 6: 100 SOL
    - ...

### 2. PVP Mode
- Anyone can create a game (choose the bet amount)
- **Lobby: 60 sec** to join
- **Game: 60 sec** — everyone plays at the same time
- Hit a branch = OUT
- After 60 sec = highest score wins
- **If everyone dies = last player standing wins**
- Tiebreaker (same frame death): highest score at death

---

## Rake (5% total)
- **2.5% game creator**
- **2.5% platform**

---

## Resources

- **Timberman Phaser Tutorial**: https://soluka.fr/blog/archives/phaser-2-creer-timberman-en-html5-canvas/
- **Original Demo**: http://timberman.soluka.fr/
- **Github Source**: https://github.com/Soluka/Timberman-Phaser-2
