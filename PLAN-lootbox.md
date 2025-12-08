# Lootbox + V2 Characters + Evolution System - Unified Implementation Plan

## Overview

Implement a complete character progression system with:
1. **Lootbox System** - Buy lootboxes (0.1 SOL) for random characters/auras
2. **V2 Characters** - 18 new lootbox-only characters + 4 legacy V1 characters
3. **Evolution System** - 5 free classes that evolve with wins (0→20→50)
4. **Win Tracking** - Per-character wins to unlock evolution skins

**Key Design Decisions:**
- **NO DUPLICATES** - Every lootbox guarantees a new item
- **FREE BASE CLASSES** - All players start with 5 evolution classes
- **PER-CLASS WINS** - Must win with elf to unlock elf evolutions
- **RARITY TIERS** - Dragons/special = legendary, humanoids = common/rare

---

## Character Categories

| Category | Count | Characters | How to Obtain |
|----------|-------|-----------|---------------|
| **FREE Base** | 5 | elf0, Priest0, pumpkin0, skeleton0, zombie0 | Available to all |
| **Evolution L1** | 5 | elf1, Priest1, pumpkin1, skeleton1, zombie1 | 20 wins with that class |
| **Evolution L2** | 5 | elf2, Priest2, pumpkin2, skeleton2, zombie2 | 50 wins with that class |
| **V2 Lootbox** | 18 | bear, blackdragon, darkwolf, elfthief, firedragon, golddragon, hollow, holydragon, kratos, lunk, mert, necromancer, pirate, plaguedoctor, skeleton, waterdragon, whitewolf, winddragon | Lootbox only |
| **V1 Lootbox** | 4 | orc, pepe, darthvader, huggywuggy | Lootbox only |
| **NFT-Gated** | 3 | yasuo, nomu, Siren | NFT ownership |

**Total: 40 characters** (15 evolution + 22 lootbox + 3 NFT)

---

## Lootbox Price & Economics

- **Lootbox Price**: 0.1 SOL (100,000,000 lamports)
- **Lootbox Items**: 22 characters + 3 auras = **25 items**
- **Max Cost to Complete**: 2.5 SOL (25 boxes)
- **Transparent**: No duplicates, players know exact max cost

---

## Rarity & Drop Weights

### Characters in Lootbox

| Character | Type | Rarity | Weight |
|-----------|------|--------|--------|
| orc | V1 | common | 15 |
| pepe | V1 | common | 15 |
| darthvader | V1 | rare | 8 |
| huggywuggy | V1 | rare | 8 |
| bear | V2 | common | 15 |
| darkwolf | V2 | common | 15 |
| elfthief | V2 | common | 15 |
| hollow | V2 | common | 15 |
| kratos | V2 | rare | 8 |
| lunk | V2 | common | 15 |
| mert | V2 | common | 15 |
| necromancer | V2 | rare | 8 |
| pirate | V2 | common | 15 |
| plaguedoctor | V2 | rare | 8 |
| skeleton | V2 | common | 15 |
| whitewolf | V2 | rare | 8 |
| blackdragon | V2 | legendary | 3 |
| firedragon | V2 | legendary | 3 |
| golddragon | V2 | legendary | 3 |
| holydragon | V2 | legendary | 3 |
| waterdragon | V2 | legendary | 3 |
| winddragon | V2 | legendary | 3 |

### Auras in Lootbox

| Aura | Rarity | Weight |
|------|--------|--------|
| Magic Aura | common | 15 |
| Blue Flame | rare | 8 |
| Holy Glow | legendary | 3 |

### Weight Summary

- **Common** (weight 15): 12 items = 180 total weight
- **Rare** (weight 8): 7 items = 56 total weight
- **Legendary** (weight 3): 6 items = 18 total weight
- **TOTAL WEIGHT**: 254

### Drop Chances (New Player)

- Common: 70.9% (180/254)
- Rare: 22.0% (56/254)
- Legendary: 7.1% (18/254)

---

## Evolution System Details

### How It Works

1. All players start with 5 base classes: elf0, Priest0, pumpkin0, skeleton0, zombie0
2. When you WIN a game using a class, your wins counter for that class increments
3. At 20 wins → unlock level 1 skin (elf1, Priest1, etc.)
4. At 50 wins → unlock level 2 skin (elf2, Priest2, etc.)
5. Progress is tracked PER CLASS (20 wins with elf only counts for elf evolutions)

### Evolution Thresholds

| Level | Wins Required | Visual Change |
|-------|---------------|---------------|
| 0 (Base) | 0 | Starting skin |
| 1 | 20 | Enhanced skin |
| 2 | 50 | Ultimate skin |

### UI Notifications

When a player unlocks a new evolution:
```
┌─────────────────────────────────────────┐
│  🎉 EVOLUTION UNLOCKED!                  │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │        [elf1 sprite]            │    │
│  │                                  │    │
│  └─────────────────────────────────┘    │
│                                          │
│  You've reached 20 wins with Elf!        │
│  New skin unlocked: Elf Warrior          │
│                                          │
│           [Equip Now]  [Close]           │
└─────────────────────────────────────────┘
```

---

## Assets

### Lootbox Assets
- Sprite: `/public/assets/misc/lootBox.png`
- Animation JSON: `/public/assets/misc/lootBox.json`
- Animations:
  - `back`: frames 0-17 (box opening from behind)
  - `front`: frames 18-35 (front view of opening)

### V2 Character Assets
- Location: `/public/assets/characters/v2/`
- Format: `{name}.json` + `{name}.png`
- Animations: Idle, Move, land (3 animations)

### Evolution Character Assets
- Location: `/public/assets/characters/v2/evo/`
- Format: `{class}{level}.json` + `{class}{level}.png`
- Examples: elf0.json, elf1.json, elf2.json
- Animations: Idle, Move, land (3 animations)

---

## Phase 1: Database Schema

### Update `convex/schema.ts`

```typescript
// ============================================================================
// UPDATED CHARACTER TABLE
// ============================================================================

characters: defineTable({
  id: v.number(),
  name: v.string(),                           // Internal name: "elf0", "bear"
  displayName: v.optional(v.string()),        // UI name: "Elf Apprentice", "Bear"
  assetPath: v.string(),                      // "/characters/v2/bear.png"
  description: v.optional(v.string()),

  // Character acquisition type
  characterType: v.string(),                  // "free" | "lootbox" | "nft"

  // Evolution system (only for free evolution characters)
  evolutionLine: v.optional(v.string()),      // "elf", "priest", "pumpkin", "skeleton", "zombie"
  evolutionLevel: v.optional(v.number()),     // 0, 1, 2
  winsRequired: v.optional(v.number()),       // 0, 20, 50

  // NFT-gated (existing)
  nftCollection: v.optional(v.string()),
  nftCollectionName: v.optional(v.string()),

  // Rarity (for lootbox weighting and UI effects)
  rarity: v.optional(v.string()),             // "common" | "rare" | "legendary"

  isActive: v.boolean(),
})
  .index("by_active", ["isActive"])
  .index("by_type", ["characterType"])
  .index("by_evolution_line", ["evolutionLine"]),

// ============================================================================
// NEW: PLAYER EVOLUTION PROGRESS
// ============================================================================

playerEvolutionProgress: defineTable({
  walletAddress: v.string(),
  evolutionLine: v.string(),                  // "elf", "priest", "pumpkin", "skeleton", "zombie"
  wins: v.number(),                           // Total wins with any skin in this line
  unlockedLevel: v.number(),                  // 0, 1, or 2
  lastWinAt: v.optional(v.number()),          // Unix timestamp
})
  .index("by_wallet", ["walletAddress"])
  .index("by_wallet_and_line", ["walletAddress", "evolutionLine"]),

// ============================================================================
// NEW: PLAYER OWNED CHARACTERS (from lootbox)
// ============================================================================

playerCharacters: defineTable({
  walletAddress: v.string(),
  characterId: v.number(),
  unlockedAt: v.number(),                     // Unix timestamp
  unlockedBy: v.string(),                     // "lootbox" | "purchase" | "default"
})
  .index("by_wallet", ["walletAddress"])
  .index("by_wallet_and_character", ["walletAddress", "characterId"]),

// ============================================================================
// LOOTBOX TABLES
// ============================================================================

lootboxTypes: defineTable({
  id: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  price: v.number(),                          // Lamports (100_000_000 = 0.1 SOL)
  assetKey: v.string(),                       // "lootBox"
  isActive: v.boolean(),
})
  .index("by_id", ["id"]),

lootboxDrops: defineTable({
  lootboxTypeId: v.number(),
  itemType: v.string(),                       // "aura" | "character"
  itemId: v.number(),
  weight: v.number(),                         // Drop weight
  rarity: v.string(),                         // "common" | "rare" | "legendary"
})
  .index("by_lootbox_type", ["lootboxTypeId"]),

playerLootboxes: defineTable({
  walletAddress: v.string(),
  lootboxTypeId: v.number(),
  purchasedAt: v.number(),
  txSignature: v.string(),
})
  .index("by_wallet", ["walletAddress"])
  .index("by_wallet_and_type", ["walletAddress", "lootboxTypeId"]),

lootboxOpenings: defineTable({
  walletAddress: v.string(),
  lootboxTypeId: v.number(),
  itemType: v.string(),
  itemId: v.number(),
  rarity: v.string(),
  openedAt: v.number(),
})
  .index("by_wallet", ["walletAddress"]),
```

---

## Phase 2: Seed Data

### Character ID Scheme

```
ID Ranges:
- 1-50: Legacy V1 characters (orc=1, pepe=6, darthvader=7, huggywuggy=8, yasuo=9, nomu=10, siren=11)
- 100-199: V2 lootbox characters (bear=100, blackdragon=101, ...)
- 200-299: Evolution characters
  - 200-202: elf (elf0=200, elf1=201, elf2=202)
  - 210-212: priest
  - 220-222: pumpkin
  - 230-232: skeleton
  - 240-242: zombie
```

### `seed/characters.json`

```json
[
  // ============ V1 LOOTBOX CHARACTERS ============
  {
    "id": 1,
    "name": "orc",
    "displayName": "Orc Warrior",
    "assetPath": "/characters/orc.png",
    "description": "A mighty fighter with high power and defense",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 6,
    "name": "pepe",
    "displayName": "Pepe",
    "assetPath": "/characters/pepe.png",
    "description": "A legendary meme warrior with unique abilities",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 7,
    "name": "darthvader",
    "displayName": "Darth Vader",
    "assetPath": "/characters/darthvader.png",
    "description": "Dark lord of the Sith with powerful force abilities",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },
  {
    "id": 8,
    "name": "huggywuggy",
    "displayName": "Huggy Wuggy",
    "assetPath": "/characters/huggywuggy.png",
    "description": "Creepy but cuddly creature from the shadows",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },

  // ============ NFT-GATED CHARACTERS ============
  {
    "id": 9,
    "name": "yasuo",
    "displayName": "Yasuo",
    "assetPath": "/characters/yasuo.png",
    "description": "Swift wandering swordsman seeking redemption",
    "characterType": "nft",
    "nftCollection": "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH",
    "nftCollectionName": "Monkey",
    "isActive": true
  },
  {
    "id": 10,
    "name": "nomu",
    "displayName": "Nomu",
    "assetPath": "/characters/fish.png",
    "description": "Nomu's native utility token",
    "characterType": "nft",
    "nftCollection": "DsNoUoX6txsJkrsg1hnKA5CpCi575Tw13YgbqiYUzzvU",
    "nftCollectionName": "Nomu OG Collection",
    "isActive": true
  },
  {
    "id": 11,
    "name": "siren",
    "displayName": "Siren",
    "assetPath": "/characters/mermaid.png",
    "description": "Super solana is in the house",
    "characterType": "nft",
    "nftCollection": "AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy",
    "nftCollectionName": "HMS",
    "isActive": true
  },

  // ============ V2 LOOTBOX CHARACTERS ============
  {
    "id": 100,
    "name": "bear",
    "displayName": "Bear",
    "assetPath": "/characters/v2/bear.png",
    "description": "A fierce forest guardian",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 101,
    "name": "blackdragon",
    "displayName": "Black Dragon",
    "assetPath": "/characters/v2/blackdragon.png",
    "description": "Ancient dragon of darkness",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },
  {
    "id": 102,
    "name": "darkwolf",
    "displayName": "Dark Wolf",
    "assetPath": "/characters/v2/darkwolf.png",
    "description": "A shadow hunter from the night",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 103,
    "name": "elfthief",
    "displayName": "Elf Thief",
    "assetPath": "/characters/v2/elfthief.png",
    "description": "Quick and cunning rogue",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 104,
    "name": "firedragon",
    "displayName": "Fire Dragon",
    "assetPath": "/characters/v2/firedragon.png",
    "description": "Blazing dragon of flames",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },
  {
    "id": 105,
    "name": "golddragon",
    "displayName": "Gold Dragon",
    "assetPath": "/characters/v2/golddragon.png",
    "description": "Majestic dragon of wealth",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },
  {
    "id": 106,
    "name": "hollow",
    "displayName": "Hollow",
    "assetPath": "/characters/v2/hollow.png",
    "description": "An empty vessel seeking purpose",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 107,
    "name": "holydragon",
    "displayName": "Holy Dragon",
    "assetPath": "/characters/v2/holydragon.png",
    "description": "Divine dragon of light",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },
  {
    "id": 108,
    "name": "kratos",
    "displayName": "Kratos",
    "assetPath": "/characters/v2/kratos.png",
    "description": "God of War, slayer of gods",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },
  {
    "id": 109,
    "name": "lunk",
    "displayName": "Lunk",
    "assetPath": "/characters/v2/lunk.png",
    "description": "A mysterious adventurer",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 110,
    "name": "mert",
    "displayName": "Mert",
    "assetPath": "/characters/v2/mert.png",
    "description": "The legendary Helius founder",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 111,
    "name": "necromancer",
    "displayName": "Necromancer",
    "assetPath": "/characters/v2/necromancer.png",
    "description": "Master of the undead arts",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },
  {
    "id": 112,
    "name": "pirate",
    "displayName": "Pirate",
    "assetPath": "/characters/v2/pirate.png",
    "description": "Scourge of the seven seas",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 113,
    "name": "plaguedoctor",
    "displayName": "Plague Doctor",
    "assetPath": "/characters/v2/plaguedoctor.png",
    "description": "Mysterious healer of the plague",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },
  {
    "id": 114,
    "name": "skeleton",
    "displayName": "Skeleton Knight",
    "assetPath": "/characters/v2/skeleton.png",
    "description": "Undead warrior from ancient times",
    "characterType": "lootbox",
    "rarity": "common",
    "isActive": true
  },
  {
    "id": 115,
    "name": "waterdragon",
    "displayName": "Water Dragon",
    "assetPath": "/characters/v2/waterdragon.png",
    "description": "Serpent dragon of the deep",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },
  {
    "id": 116,
    "name": "whitewolf",
    "displayName": "White Wolf",
    "assetPath": "/characters/v2/whitewolf.png",
    "description": "Noble guardian of the north",
    "characterType": "lootbox",
    "rarity": "rare",
    "isActive": true
  },
  {
    "id": 117,
    "name": "winddragon",
    "displayName": "Wind Dragon",
    "assetPath": "/characters/v2/winddragon.png",
    "description": "Swift dragon of the skies",
    "characterType": "lootbox",
    "rarity": "legendary",
    "isActive": true
  },

  // ============ EVOLUTION CHARACTERS ============
  // ELF LINE (200-202)
  {
    "id": 200,
    "name": "elf0",
    "displayName": "Elf Apprentice",
    "assetPath": "/characters/v2/evo/elf0.png",
    "description": "A young elf beginning their journey",
    "characterType": "free",
    "evolutionLine": "elf",
    "evolutionLevel": 0,
    "winsRequired": 0,
    "isActive": true
  },
  {
    "id": 201,
    "name": "elf1",
    "displayName": "Elf Warrior",
    "assetPath": "/characters/v2/evo/elf1.png",
    "description": "Battle-hardened elf fighter",
    "characterType": "free",
    "evolutionLine": "elf",
    "evolutionLevel": 1,
    "winsRequired": 20,
    "isActive": true
  },
  {
    "id": 202,
    "name": "elf2",
    "displayName": "Elf Champion",
    "assetPath": "/characters/v2/evo/elf2.png",
    "description": "Legendary elf master",
    "characterType": "free",
    "evolutionLine": "elf",
    "evolutionLevel": 2,
    "winsRequired": 50,
    "isActive": true
  },

  // PRIEST LINE (210-212)
  {
    "id": 210,
    "name": "Priest0",
    "displayName": "Acolyte",
    "assetPath": "/characters/v2/evo/Priest0.png",
    "description": "A humble servant of the light",
    "characterType": "free",
    "evolutionLine": "priest",
    "evolutionLevel": 0,
    "winsRequired": 0,
    "isActive": true
  },
  {
    "id": 211,
    "name": "Priest1",
    "displayName": "Priest",
    "assetPath": "/characters/v2/evo/Priest1.png",
    "description": "Devoted healer of the faithful",
    "characterType": "free",
    "evolutionLine": "priest",
    "evolutionLevel": 1,
    "winsRequired": 20,
    "isActive": true
  },
  {
    "id": 212,
    "name": "Priest2",
    "displayName": "High Priest",
    "assetPath": "/characters/v2/evo/Priest2.png",
    "description": "Divine conduit of holy power",
    "characterType": "free",
    "evolutionLine": "priest",
    "evolutionLevel": 2,
    "winsRequired": 50,
    "isActive": true
  },

  // PUMPKIN LINE (220-222)
  {
    "id": 220,
    "name": "pumpkin0",
    "displayName": "Pumpkin Sprite",
    "assetPath": "/characters/v2/evo/pumpkin0.png",
    "description": "A mischievous halloween spirit",
    "characterType": "free",
    "evolutionLine": "pumpkin",
    "evolutionLevel": 0,
    "winsRequired": 0,
    "isActive": true
  },
  {
    "id": 221,
    "name": "pumpkin1",
    "displayName": "Pumpkin Knight",
    "assetPath": "/characters/v2/evo/pumpkin1.png",
    "description": "Armored guardian of the harvest",
    "characterType": "free",
    "evolutionLine": "pumpkin",
    "evolutionLevel": 1,
    "winsRequired": 20,
    "isActive": true
  },
  {
    "id": 222,
    "name": "pumpkin2",
    "displayName": "Pumpkin Lord",
    "assetPath": "/characters/v2/evo/pumpkin2.png",
    "description": "Ruler of the eternal halloween",
    "characterType": "free",
    "evolutionLine": "pumpkin",
    "evolutionLevel": 2,
    "winsRequired": 50,
    "isActive": true
  },

  // SKELETON LINE (230-232)
  {
    "id": 230,
    "name": "skeleton0",
    "displayName": "Skeleton",
    "assetPath": "/characters/v2/evo/skeleton0.png",
    "description": "A risen warrior from the grave",
    "characterType": "free",
    "evolutionLine": "skeleton",
    "evolutionLevel": 0,
    "winsRequired": 0,
    "isActive": true
  },
  {
    "id": 231,
    "name": "skeleton1",
    "displayName": "Skeleton Warrior",
    "assetPath": "/characters/v2/evo/skeleton1.png",
    "description": "Battle-tested undead fighter",
    "characterType": "free",
    "evolutionLine": "skeleton",
    "evolutionLevel": 1,
    "winsRequired": 20,
    "isActive": true
  },
  {
    "id": 232,
    "name": "skeleton2",
    "displayName": "Skeleton King",
    "assetPath": "/characters/v2/evo/skeleton2.png",
    "description": "Ruler of the undead legion",
    "characterType": "free",
    "evolutionLine": "skeleton",
    "evolutionLevel": 2,
    "winsRequired": 50,
    "isActive": true
  },

  // ZOMBIE LINE (240-242)
  {
    "id": 240,
    "name": "zombie0",
    "displayName": "Zombie",
    "assetPath": "/characters/v2/evo/zombie0.png",
    "description": "A shambling undead creature",
    "characterType": "free",
    "evolutionLine": "zombie",
    "evolutionLevel": 0,
    "winsRequired": 0,
    "isActive": true
  },
  {
    "id": 241,
    "name": "zombie1",
    "displayName": "Zombie Brute",
    "assetPath": "/characters/v2/evo/zombie1.png",
    "description": "Powerful mutated zombie",
    "characterType": "free",
    "evolutionLine": "zombie",
    "evolutionLevel": 1,
    "winsRequired": 20,
    "isActive": true
  },
  {
    "id": 242,
    "name": "zombie2",
    "displayName": "Zombie Overlord",
    "assetPath": "/characters/v2/evo/zombie2.png",
    "description": "Master of the zombie horde",
    "characterType": "free",
    "evolutionLine": "zombie",
    "evolutionLevel": 2,
    "winsRequired": 50,
    "isActive": true
  }
]
```

### `seed/lootboxTypes.json`

```json
[
  {
    "id": 1,
    "name": "Standard Lootbox",
    "description": "Contains random characters and auras. No duplicates!",
    "price": 100000000,
    "assetKey": "lootBox",
    "isActive": true
  }
]
```

### `seed/lootboxDrops.json`

```json
[
  // V1 CHARACTERS
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 1, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 6, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 7, "weight": 8, "rarity": "rare" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 8, "weight": 8, "rarity": "rare" },

  // V2 CHARACTERS - COMMON
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 100, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 102, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 103, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 106, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 109, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 110, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 112, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 114, "weight": 15, "rarity": "common" },

  // V2 CHARACTERS - RARE
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 108, "weight": 8, "rarity": "rare" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 111, "weight": 8, "rarity": "rare" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 113, "weight": 8, "rarity": "rare" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 116, "weight": 8, "rarity": "rare" },

  // V2 CHARACTERS - LEGENDARY (Dragons)
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 101, "weight": 3, "rarity": "legendary" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 104, "weight": 3, "rarity": "legendary" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 105, "weight": 3, "rarity": "legendary" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 107, "weight": 3, "rarity": "legendary" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 115, "weight": 3, "rarity": "legendary" },
  { "lootboxTypeId": 1, "itemType": "character", "itemId": 117, "weight": 3, "rarity": "legendary" },

  // AURAS
  { "lootboxTypeId": 1, "itemType": "aura", "itemId": 1, "weight": 15, "rarity": "common" },
  { "lootboxTypeId": 1, "itemType": "aura", "itemId": 2, "weight": 8, "rarity": "rare" },
  { "lootboxTypeId": 1, "itemType": "aura", "itemId": 3, "weight": 3, "rarity": "legendary" }
]
```

---

## Phase 3: Backend Implementation

### 3.1 Create `convex/evolution.ts`

```typescript
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Get all evolution progress for a player
export const getPlayerEvolutionProgress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

// Get available evolution skins for a player
export const getAvailableEvolutionSkins = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    // Get all evolution characters
    const evolutionChars = await ctx.db
      .query("characters")
      .withIndex("by_type", q => q.eq("characterType", "free"))
      .collect();

    // Get player's evolution progress
    const progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const progressMap = new Map(progress.map(p => [p.evolutionLine, p]));

    // Filter to only unlocked skins
    return evolutionChars.filter(char => {
      if (!char.evolutionLine) return false;
      const playerProgress = progressMap.get(char.evolutionLine);
      const unlockedLevel = playerProgress?.unlockedLevel ?? 0;
      return (char.evolutionLevel ?? 0) <= unlockedLevel;
    });
  },
});

// Record a win and check for evolution unlock
export const recordWin = internalMutation({
  args: {
    walletAddress: v.string(),
    characterId: v.number()
  },
  handler: async (ctx, args) => {
    // Get the character to check if it's an evolution character
    const character = await ctx.db
      .query("characters")
      .filter(q => q.eq(q.field("id"), args.characterId))
      .first();

    if (!character || character.characterType !== "free" || !character.evolutionLine) {
      return { evolved: false };
    }

    const evolutionLine = character.evolutionLine;

    // Get or create evolution progress
    let progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet_and_line", q =>
        q.eq("walletAddress", args.walletAddress).eq("evolutionLine", evolutionLine)
      )
      .first();

    if (!progress) {
      // Create new progress entry
      await ctx.db.insert("playerEvolutionProgress", {
        walletAddress: args.walletAddress,
        evolutionLine,
        wins: 1,
        unlockedLevel: 0,
        lastWinAt: Date.now(),
      });
      return { evolved: false, wins: 1, unlockedLevel: 0 };
    }

    // Increment wins
    const newWins = progress.wins + 1;
    let newUnlockedLevel = progress.unlockedLevel;
    let evolved = false;

    // Check for evolution thresholds
    if (newWins >= 50 && progress.unlockedLevel < 2) {
      newUnlockedLevel = 2;
      evolved = true;
    } else if (newWins >= 20 && progress.unlockedLevel < 1) {
      newUnlockedLevel = 1;
      evolved = true;
    }

    await ctx.db.patch(progress._id, {
      wins: newWins,
      unlockedLevel: newUnlockedLevel,
      lastWinAt: Date.now(),
    });

    return {
      evolved,
      wins: newWins,
      unlockedLevel: newUnlockedLevel,
      evolutionLine,
    };
  },
});

// Initialize evolution progress for new player (all lines at level 0)
export const initializeEvolutionProgress = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const evolutionLines = ["elf", "priest", "pumpkin", "skeleton", "zombie"];

    for (const line of evolutionLines) {
      const existing = await ctx.db
        .query("playerEvolutionProgress")
        .withIndex("by_wallet_and_line", q =>
          q.eq("walletAddress", args.walletAddress).eq("evolutionLine", line)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("playerEvolutionProgress", {
          walletAddress: args.walletAddress,
          evolutionLine: line,
          wins: 0,
          unlockedLevel: 0,
        });
      }
    }
  },
});
```

### 3.2 Create `convex/lootboxes.ts`

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get available lootbox types
export const getLootboxTypes = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("lootboxTypes")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get player's unopened lootboxes
export const getPlayerLootboxes = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerLootboxes")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

// Get items player can still get (for UI)
export const getAvailableDrops = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", q => q.eq("lootboxTypeId", 1))
      .collect();

    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedAuraIds = new Set(ownedAuras.map(a => a.auraId));
    const ownedCharIds = new Set(ownedCharacters.map(c => c.characterId));

    return allDrops.filter(drop => {
      if (drop.itemType === "aura") {
        return !ownedAuraIds.has(drop.itemId);
      }
      if (drop.itemType === "character") {
        return !ownedCharIds.has(drop.itemId);
      }
      return true;
    });
  },
});

// Get collection progress
export const getCollectionProgress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", q => q.eq("lootboxTypeId", 1))
      .collect();

    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const totalItems = allDrops.length;
    const ownedCount = ownedAuras.length + ownedCharacters.length;

    return {
      owned: ownedCount,
      total: totalItems,
      complete: ownedCount >= totalItems,
    };
  },
});

// Open a lootbox (shrinking pool - no duplicates)
export const openLootbox = mutation({
  args: {
    walletAddress: v.string(),
    lootboxId: v.id("playerLootboxes")
  },
  handler: async (ctx, args) => {
    // Verify ownership
    const lootbox = await ctx.db.get(args.lootboxId);
    if (!lootbox || lootbox.walletAddress !== args.walletAddress) {
      throw new Error("Lootbox not found or not owned");
    }

    // Get all possible drops
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", q => q.eq("lootboxTypeId", lootbox.lootboxTypeId))
      .collect();

    // Get owned items
    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedAuraIds = new Set(ownedAuras.map(a => a.auraId));
    const ownedCharIds = new Set(ownedCharacters.map(c => c.characterId));

    // Filter to available drops (SHRINKING POOL)
    const availableDrops = allDrops.filter(drop => {
      if (drop.itemType === "aura") {
        return !ownedAuraIds.has(drop.itemId);
      }
      if (drop.itemType === "character") {
        return !ownedCharIds.has(drop.itemId);
      }
      return true;
    });

    if (availableDrops.length === 0) {
      throw new Error("You already own everything!");
    }

    // Calculate total weight of available items
    const totalWeight = availableDrops.reduce((sum, d) => sum + d.weight, 0);

    // Roll random number
    const roll = Math.random() * totalWeight;

    // Find winner
    let cumulative = 0;
    let winner = availableDrops[0];

    for (const drop of availableDrops) {
      cumulative += drop.weight;
      if (roll < cumulative) {
        winner = drop;
        break;
      }
    }

    // Unlock the item
    if (winner.itemType === "aura") {
      await ctx.db.insert("playerAuras", {
        walletAddress: args.walletAddress,
        auraId: winner.itemId,
        unlockedAt: Date.now(),
        unlockedBy: "lootbox",
      });
    } else if (winner.itemType === "character") {
      await ctx.db.insert("playerCharacters", {
        walletAddress: args.walletAddress,
        characterId: winner.itemId,
        unlockedAt: Date.now(),
        unlockedBy: "lootbox",
      });
    }

    // Delete the lootbox from inventory
    await ctx.db.delete(args.lootboxId);

    // Record opening history
    await ctx.db.insert("lootboxOpenings", {
      walletAddress: args.walletAddress,
      lootboxTypeId: lootbox.lootboxTypeId,
      itemType: winner.itemType,
      itemId: winner.itemId,
      rarity: winner.rarity,
      openedAt: Date.now(),
    });

    // Get item details for animation
    let itemDetails = null;
    if (winner.itemType === "character") {
      itemDetails = await ctx.db
        .query("characters")
        .filter(q => q.eq(q.field("id"), winner.itemId))
        .first();
    } else if (winner.itemType === "aura") {
      itemDetails = await ctx.db
        .query("auras")
        .filter(q => q.eq(q.field("id"), winner.itemId))
        .first();
    }

    return {
      itemType: winner.itemType,
      itemId: winner.itemId,
      rarity: winner.rarity,
      itemDetails,
    };
  },
});

// Get opening history
export const getOpeningHistory = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lootboxOpenings")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(50);
  },
});
```

### 3.3 Update `convex/characters.ts`

```typescript
// Add new query for available characters
export const getAvailableCharacters = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allChars = await ctx.db
      .query("characters")
      .withIndex("by_active", q => q.eq("isActive", true))
      .collect();

    // Get player's lootbox characters
    const ownedChars = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCharIds = new Set(ownedChars.map(c => c.characterId));

    // Get player's evolution progress
    const evoProgress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();
    const evoProgressMap = new Map(evoProgress.map(p => [p.evolutionLine, p]));

    // Get NFT verification (existing logic)
    const nftHoldings = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_wallet", q => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCollections = new Set(nftHoldings.map(h => h.collectionAddress));

    return allChars.map(char => {
      let isUnlocked = false;
      let unlockProgress = null;

      if (char.characterType === "free") {
        // Evolution character - check if level is unlocked
        const progress = evoProgressMap.get(char.evolutionLine ?? "");
        const unlockedLevel = progress?.unlockedLevel ?? 0;
        isUnlocked = (char.evolutionLevel ?? 0) <= unlockedLevel;
        unlockProgress = progress ? {
          wins: progress.wins,
          unlockedLevel: progress.unlockedLevel,
          nextThreshold: progress.unlockedLevel === 0 ? 20 : progress.unlockedLevel === 1 ? 50 : null,
        } : null;
      } else if (char.characterType === "lootbox") {
        // Lootbox character - check if owned
        isUnlocked = ownedCharIds.has(char.id);
      } else if (char.characterType === "nft") {
        // NFT character - check if owns collection
        isUnlocked = char.nftCollection ? ownedCollections.has(char.nftCollection) : false;
      }

      return {
        ...char,
        isUnlocked,
        unlockProgress,
      };
    });
  },
});
```

---

## Phase 4: Frontend Components

### 4.1 Character Selection UI Mockup

```
┌─────────────────────────────────────────────────────────────────────┐
│  SELECT YOUR CHARACTER                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  FREE CLASSES                                    [Click to expand]   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐│
│  │   [elf]   │ │ [priest]  │ │ [pumpkin] │ │ [skeleton]│ │ [zombie]││
│  │  15/20 ⚔  │ │  25/50 ⚔  │ │   3/20 ⚔  │ │  50/50 ★  │ │  0/20 ⚔ ││
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └─────────┘│
│                                                                      │
│  LOOTBOX COLLECTION (8/22)                       [Buy Lootbox 0.1]   │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │ orc │ │pepe │ │bear │ │kratos│ │ 🔒  │ │ 🔒  │ │ 🔒  │ │ 🔒  │   │
│  │  ✓  │ │  ✓  │ │  ✓  │ │  ✓  │ │     │ │     │ │     │ │     │   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘   │
│  ... (scroll for more)                                               │
│                                                                      │
│  NFT EXCLUSIVE                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                                │
│  │ [yasuo] │ │ [nomu]  │ │ [siren] │                                │
│  │   ✓     │ │   🔒    │ │   🔒    │                                │
│  │ Monkey  │ │ Nomu OG │ │  HMS    │                                │
│  └─────────┘ └─────────┘ └─────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Evolution Class Expanded View

```
┌─────────────────────────────────────────────────────────────────────┐
│  ELF CLASS                                              [← Back]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Your Progress: 15 wins                                              │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 15/50                   │
│                                                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │                 │ │                 │ │                 │        │
│  │   [elf0.png]    │ │   [elf1.png]    │ │   [elf2.png]    │        │
│  │                 │ │                 │ │                 │        │
│  │   ✓ UNLOCKED    │ │   🔒 5 more     │ │   🔒 35 more    │        │
│  │                 │ │                 │ │                 │        │
│  │  Elf Apprentice │ │  Elf Warrior    │ │  Elf Champion   │        │
│  │  [SELECT]       │ │  20 wins        │ │  50 wins        │        │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Lootbox Opening Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│                          LOOT BOX                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                    ┌─────────────────────┐                          │
│                    │                     │                          │
│                    │   [lootbox.gif]     │                          │
│                    │   Opening...        │                          │
│                    │                     │                          │
│                    └─────────────────────┘                          │
│                                                                      │
│                         ✨✨✨✨✨                                     │
│                                                                      │
│                    ┌─────────────────────┐                          │
│                    │                     │                          │
│                    │  [golddragon.png]   │                          │
│                    │                     │                          │
│                    └─────────────────────┘                          │
│                                                                      │
│                    ⭐ LEGENDARY ⭐                                   │
│                    "Gold Dragon"                                     │
│                                                                      │
│             [Open Another (3 left)]    [Close]                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.4 Evolution Unlock Notification

```
┌─────────────────────────────────────────────────────────────────────┐
│                    🎉 EVOLUTION UNLOCKED! 🎉                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                    ┌─────────────────────┐                          │
│                    │                     │                          │
│                    │   [elf1.png]        │                          │
│                    │   ✨ sparkles ✨     │                          │
│                    │                     │                          │
│                    └─────────────────────┘                          │
│                                                                      │
│              You've reached 20 wins with Elf!                        │
│                                                                      │
│                 New skin unlocked:                                   │
│                 "Elf Warrior"                                        │
│                                                                      │
│                [Equip Now]    [Continue]                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Game Integration

### 5.1 Asset Loading Updates

Update Phaser Preloader to load V2 characters:

```typescript
// In Preloader.ts
const v2Characters = [
  'bear', 'blackdragon', 'darkwolf', 'elfthief', 'firedragon',
  'golddragon', 'hollow', 'holydragon', 'kratos', 'lunk', 'mert',
  'necromancer', 'pirate', 'plaguedoctor', 'skeleton', 'waterdragon',
  'whitewolf', 'winddragon'
];

const evoCharacters = [
  'elf0', 'elf1', 'elf2',
  'Priest0', 'Priest1', 'Priest2',
  'pumpkin0', 'pumpkin1', 'pumpkin2',
  'skeleton0', 'skeleton1', 'skeleton2',
  'zombie0', 'zombie1', 'zombie2'
];

// Load V2 characters
for (const char of v2Characters) {
  this.load.atlas(char, `/assets/characters/v2/${char}.png`, `/assets/characters/v2/${char}.json`);
}

// Load evolution characters
for (const char of evoCharacters) {
  this.load.atlas(char, `/assets/characters/v2/evo/${char}.png`, `/assets/characters/v2/evo/${char}.json`);
}
```

### 5.2 Animation Configuration

V2 characters have 3 animations (different from V1):
- `Idle`: frames 0-1, pingpong
- `Move`: frames 2-5, forward
- `land`: frames 6-10, forward

Update animation creation to handle both formats.

### 5.3 Win Recording Integration

Update game end logic to record wins:

```typescript
// When game ends and winner is determined
if (winner.walletAddress === currentPlayerWallet) {
  // Record the win for evolution tracking
  const result = await recordWin({
    walletAddress: currentPlayerWallet,
    characterId: selectedCharacterId,
  });

  if (result.evolved) {
    // Show evolution unlock notification
    showEvolutionUnlockModal(result.evolutionLine, result.unlockedLevel);
  }
}
```

---

## Implementation Order

### Week 1: Foundation

**Day 1-2: Schema & Seed Data**
- [ ] Update `convex/schema.ts` with all new tables
- [ ] Create complete `seed/characters.json` with all 40 characters
- [ ] Create `seed/lootboxTypes.json`
- [ ] Create `seed/lootboxDrops.json`
- [ ] Update seed script to load all new data
- [ ] Run migration / seed on dev environment

**Day 3-4: Backend - Evolution System**
- [ ] Create `convex/evolution.ts`
- [ ] Add `initializeEvolutionProgress` mutation
- [ ] Add `recordWin` internal mutation
- [ ] Add `getPlayerEvolutionProgress` query
- [ ] Add `getAvailableEvolutionSkins` query
- [ ] Integrate win recording with game end flow

**Day 5: Backend - Lootbox System**
- [ ] Create `convex/lootboxes.ts`
- [ ] Add `getLootboxTypes` query
- [ ] Add `getPlayerLootboxes` query
- [ ] Add `getAvailableDrops` query
- [ ] Add `openLootbox` mutation (shrinking pool)
- [ ] Add `getCollectionProgress` query

### Week 2: Frontend & Integration

**Day 6-7: Character Selection UI**
- [ ] Update `CharacterSelection.tsx` with new layout
- [ ] Add evolution class selector component
- [ ] Add progress bars for each evolution line
- [ ] Add lootbox collection section
- [ ] Add NFT exclusive section
- [ ] Create `useCharacters.ts` hook

**Day 8-9: Lootbox UI**
- [ ] Create `LootboxShop.tsx` component
- [ ] Create `LootboxOpenModal.tsx` with animation
- [ ] Add rarity-based visual effects (sparkles, glow)
- [ ] Create `useLootbox.ts` hook
- [ ] Integrate with shop purchase flow

**Day 10: Evolution Notifications**
- [ ] Create `EvolutionUnlockModal.tsx`
- [ ] Add notification trigger on win
- [ ] Add celebration animation/effects

### Week 3: Polish & Testing

**Day 11-12: Game Integration**
- [ ] Update Phaser asset loading for V2 characters
- [ ] Handle 3-animation format (Idle, Move, land)
- [ ] Test all character sprites in game
- [ ] Verify animation playback

**Day 13-14: Testing & Bug Fixes**
- [ ] Test full evolution flow (0→20→50 wins)
- [ ] Test lootbox purchase and opening
- [ ] Test shrinking pool (no duplicates)
- [ ] Test NFT-gated characters
- [ ] Test all UI states
- [ ] Performance testing

---

## File Changes Summary

### New Files
- `convex/evolution.ts` - Evolution system logic
- `convex/lootboxes.ts` - Lootbox system logic
- `seed/lootboxTypes.json` - Lootbox definitions
- `seed/lootboxDrops.json` - Drop tables
- `src/components/LootboxShop.tsx` - Lootbox purchase UI
- `src/components/LootboxOpenModal.tsx` - Opening animation
- `src/components/EvolutionUnlockModal.tsx` - Evolution notification
- `src/components/EvolutionClassSelector.tsx` - Evolution skin picker
- `src/hooks/useLootbox.ts` - Lootbox hook
- `src/hooks/useEvolution.ts` - Evolution progress hook

### Modified Files
- `convex/schema.ts` - Add 5 new tables
- `seed/characters.json` - Complete rewrite with 40 characters
- `convex/characters.ts` - Add `getAvailableCharacters` query
- `convex/shop.ts` - Add "lootbox" item type
- `convex/shopMutations.ts` - Handle lootbox purchase recording
- `src/hooks/useShopPurchase.ts` - Add "lootbox" to ItemType
- `src/components/CharacterSelection.tsx` - Complete redesign
- `src/game/scenes/Preloader.ts` - Load V2 assets
- `src/game/scenes/Game.ts` - Handle V2 animations

---

## Cost Summary

**Lootbox Economics:**
- Price: 0.1 SOL per box
- Total items: 25 (22 characters + 3 auras)
- Max cost to complete: 2.5 SOL
- Transparent: No duplicates, guaranteed new item each time

**Evolution (FREE):**
- 5 base classes available to all players
- 10 additional skins earned through gameplay
- No cost, just skill and persistence

**Revenue Model:**
- Lootbox sales: 0.1 SOL × purchases
- House fee from games: 5% of betting pools
- No pay-to-win: Evolution skins are cosmetic only
