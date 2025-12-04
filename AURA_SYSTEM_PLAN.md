# Aura System Plan

## Overview

Add animated auras that wrap around characters. Players start with **no auras** and must **earn** or **buy** them.

### Available Auras

| Asset Key | Frames                          | Description       |
| --------- | ------------------------------- | ----------------- |
| B         | 120 (back: 0-59, front: 60-119) | Blue Flame effect |
| H         | 120 (back: 0-59, front: 60-119) | Holy Glow effect  |
| M         | 120 (back: 0-59, front: 60-119) | Magic Aura effect |

Location: `public/assets/auras/Aura-{B,H,M}-sheet.{png,json}`

---

## Database Schema

### New Table: `auras`

```typescript
auras: defineTable({
  id: v.number(), // 1, 2, 3...
  name: v.string(), // "Blue Flame", "Holy Glow", "Magic Aura"
  assetKey: v.string(), // "B", "H", "M"
  description: v.optional(v.string()),
  rarity: v.string(), // "common" | "rare" | "legendary"
  pointsCost: v.optional(v.number()), // e.g., 10000 points to unlock
  purchasePrice: v.optional(v.number()), // lamports (e.g., 0.1 SOL = 100_000_000)
  isActive: v.boolean(),
});
```

### New Table: `playerAuras`

```typescript
playerAuras: defineTable({
  walletAddress: v.string(), // Player wallet (primary key part)
  auraId: v.number(), // Aura ID
  unlockedAt: v.number(), // Unix timestamp
  unlockedBy: v.string(), // "points" | "purchase" | "achievement"
})
  .index("by_wallet", ["walletAddress"])
  .index("by_wallet_and_aura", ["walletAddress", "auraId"]);
```

### Update Table: `players`

```typescript
// Add field:
equippedAuraId: v.optional(v.number()), // Currently selected aura (null = no aura)
```

---

## Aura Definitions (Seed Data)

| ID  | Asset Key | Name       | Rarity    | Unlock Type     | Points Cost | SOL Price |
| --- | --------- | ---------- | --------- | --------------- | ----------- | --------- |
| 1   | M         | Magic Aura | common    | points/purchase | 2,000       | 0.02 SOL  |
| 2   | B         | Blue Flame | rare      | points/purchase | 5,000       | 0.1 SOL   |
| 3   | H         | Holy Glow  | legendary | points/purchase | 15,000      | 0.25 SOL  |

### Unlock Rules

- **Magic Aura (M)**: 2,000 points OR 0.02 SOL purchase
- **Blue Flame (B)**: 5,000 points OR 0.1 SOL purchase
- **Holy Glow (H)**: 15,000 points OR 0.25 SOL purchase

### Points System (existing)

- 1 point per 0.001 SOL bet
- Stored in `players.totalPoints`

---

## UX Design

### Entry Point: Character Selection Panel

```
Fo this we want to do like src/components/ProfileDialog.tsx player and aura has to be menus from the sidebar
and the characher has to bealwons on the top with all the features
┌─────────────────────────────────────────────────────────────┐
│              CHARACTER SELECTION PANEL                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │          [Character Preview with Aura]                │  │
│  │                    ✨ ORC ✨                           │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│                                        │
│                │
│        ┤
│                                           │
└─────────────────────────────────────────────────────────────┘
```

### Aura Selection Modal

```
┌─────────────────────────────────────────────────────────────┐
│                    AURA SELECTION MODAL                      │
├─────────────────────────────────────────────────────────────┤
│  Your Points: 12,450 ⭐                          [X] Close   │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  NONE   │  │ Magic   │  │  Blue   │  │  Holy   │        │
│  │   ○     │  │  ✓ ✨   │  │  🔒     │  │  🔒     │        │
│  │ Equipped│  │ Owned   │  │ 5,000⭐ │  │ 15,000⭐│        │
│  │ (free)  │  │ (free)  │  │  rare   │  │legendary│        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│      ✓                         │             │              │
│                           [UNLOCK]      [UNLOCK]            │
│                          via Points    via Points           │
│                             OR            OR                 │
│                         [0.1 SOL]     [0.25 SOL]            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │         PREVIEW (animated aura on character)          │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│                    [EQUIP SELECTED]                         │
└─────────────────────────────────────────────────────────────┘
```

### Modal States

1. **Locked Aura Selected**
   - Show unlock options: Points button + SOL button
   - Preview shows aura (grayed out or with lock overlay)

2. **Owned Aura Selected**
   - Show "Equip" button if not currently equipped
   - Show "Equipped ✓" badge if currently equipped
   - Full color preview

3. **"None" Selected**
   - Show "Remove Aura" or "Equip None" button
   - Preview shows character without aura

---

## In-Game Rendering (Phaser)

### Sprite Hierarchy

```typescript
// Each character container:
Container (character)
├── auraBackSprite  (z-index: -1)  // Frames 0-59 ("back" tag)
├── characterSprite (z-index: 0)   // The character itself
└── auraFrontSprite (z-index: 1)   // Frames 60-119 ("front" tag)
```

### Animation Setup

```typescript
// In Preloader.ts - load aura assets
this.load.atlas("aura-B", "/assets/auras/Aura-B-sheet.png", "/assets/auras/Aura-B-sheet.json");
this.load.atlas("aura-H", "/assets/auras/Aura-H-sheet.png", "/assets/auras/Aura-H-sheet.json");
this.load.atlas("aura-M", "/assets/auras/Aura-M-sheet.png", "/assets/auras/Aura-M-sheet.json");

// Create animations
this.anims.create({
  key: "aura-B-back",
  frames: this.anims.generateFrameNames("aura-B", {
    prefix: "Aura-B ",
    start: 0,
    end: 59,
    suffix: ".png",
  }),
  frameRate: 10,
  repeat: -1,
});

this.anims.create({
  key: "aura-B-front",
  frames: this.anims.generateFrameNames("aura-B", {
    prefix: "Aura-B ",
    start: 60,
    end: 119,
    suffix: ".png",
  }),
  frameRate: 10,
  repeat: -1,
});
```

### Aura Scaling

Auras should scale with character size (bet-to-size feature):

```typescript
const auraScale = characterScale * 1.2; // Slightly larger than character
auraBackSprite.setScale(auraScale);
auraFrontSprite.setScale(auraScale);
```

---

## Convex Functions

### Queries

```typescript
// auras.ts
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("auras")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getPlayerAuras = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    return await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .collect();
  },
});

export const getEquippedAura = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();
    return player?.equippedAuraId ?? null;
  },
});
```

### Mutations

```typescript
export const unlockWithPoints = mutation({
  args: { walletAddress: v.string(), auraId: v.number() },
  handler: async (ctx, { walletAddress, auraId }) => {
    // 1. Get aura definition
    // 2. Check player has enough points
    // 3. Deduct points from player
    // 4. Add to playerAuras
    // 5. Return success
  },
});

export const recordPurchase = mutation({
  args: { walletAddress: v.string(), auraId: v.number(), txSignature: v.string() },
  handler: async (ctx, { walletAddress, auraId, txSignature }) => {
    // Called after SOL payment confirmed
    // 1. Verify transaction (optional - trust frontend or verify via Helius)
    // 2. Add to playerAuras
    // 3. Return success
  },
});

export const equipAura = mutation({
  args: { walletAddress: v.string(), auraId: v.optional(v.number()) },
  handler: async (ctx, { walletAddress, auraId }) => {
    // 1. If auraId provided, verify player owns it
    // 2. Update player.equippedAuraId
    // 3. Return success
  },
});
```

---

## React Components

### New: `AuraSelectionModal.tsx`

```typescript
interface AuraSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCharacter: Character | null;
  walletAddress: string;
  playerPoints: number;
}
```

### Update: `CharacterSelection2.tsx`

- Add "AURA" button next to navigation arrows
- Pass equipped aura to character preview
- Show aura indicator on character if equipped

### New: `AuraPreviewScene.tsx`

- Phaser scene for modal preview
- Shows character + selected aura animated
- Similar to CharacterPreviewScene but with aura layers

---

## Bet Integration

### Option A: Store in Convex Only (Simpler)

- Aura is cosmetic only
- Fetched from Convex when rendering game
- No blockchain changes needed

### Option B: Include in Bet Data (On-Chain)

- Add `auraId: u8` to bet instruction
- Store in blockchain bet data
- More complex but fully on-chain

**Recommendation**: Start with Option A (Convex only), migrate to Option B later if needed.

---

## Implementation Checklist

### Phase 1: Backend

- [ ] Update `convex/schema.ts` - add `auras` and `playerAuras` tables
- [ ] Update `convex/schema.ts` - add `equippedAuraId` to players
- [ ] Create `seed/auras.json` with initial aura definitions
- [ ] Create `convex/auras.ts` with queries and mutations
- [ ] Update `convex/players.ts` - add equipAura mutation

### Phase 2: Phaser

- [ ] Update `Preloader.ts` - load aura spritesheets
- [ ] Create aura animations in Preloader
- [ ] Update character rendering to include aura sprites
- [ ] Add aura to CharacterPreviewScene

### Phase 3: React UI

- [ ] Create `AuraSelectionModal.tsx` component
- [ ] Create `usePlayerAuras.ts` hook
- [ ] Update `CharacterSelection2.tsx` - add AURA button
- [ ] Add SOL payment flow for purchases

### Phase 4: Polish

- [ ] Add unlock animations/confetti
- [ ] Add sound effects for equip/unlock
- [ ] Mobile responsive modal
- [ ] Loading states and error handling

---

## Open Questions

1. **Free Aura Trigger**: When should Magic Aura be given?
   - On first bet?
   - On account creation?
   - After tutorial?

2. **SOL Payment Flow**:
   - Direct transfer to treasury wallet?
   - Through smart contract?
   - Convex action that verifies tx?

3. **Aura in Bet Data**:
   - Store on-chain (blockchain) or off-chain (Convex only)?
   - Affects other players seeing your aura

4. **Future Auras**:
   - Achievement-based unlocks?
   - Limited edition/seasonal auras?
   - NFT-gated auras?

---

## File Structure

```
convex/
├── auras.ts              # New: Aura queries/mutations
├── schema.ts             # Updated: Add auras, playerAuras tables
└── players.ts            # Updated: Add equippedAuraId field

src/
├── components/
│   ├── AuraSelectionModal.tsx    # New: Modal component
│   └── CharacterSelection2.tsx   # Updated: Add AURA button
├── hooks/
│   └── usePlayerAuras.ts         # New: Aura data hook
└── game/
    └── scenes/
        ├── Preloader.ts          # Updated: Load aura assets
        └── Game.ts               # Updated: Render auras on characters

seed/
└── auras.json            # New: Aura seed data

public/assets/auras/      # Existing aura assets
├── Aura-B-sheet.json
├── Aura-B-sheet.png
├── Aura-H-sheet.json
├── Aura-H-sheet.png
├── Aura-M-sheet.json
└── Aura-M-sheet.png
```
