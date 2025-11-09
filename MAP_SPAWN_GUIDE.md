# Map Spawn Configuration Guide

## How to Get Ellipse Values for New Maps

### Step 1: Open Your Map in Aseprite
1. Launch Aseprite
2. Open your map image file (e.g., `Arena.png`)

### Step 2: Draw the Spawn Ellipse
1. Select the **Ellipse Tool** from the toolbar
2. Draw an ellipse over the **playable area** where characters should spawn
3. Make sure the ellipse covers the safe zone (avoid obstacles/edges)

### Step 3: Read the Measurements
Aseprite will display measurements on the left side panel:
- **Left**: Distance from center to left edge (e.g., 60)
- **Right**: Distance from center to right edge (e.g., 59)
- **Top**: Distance from center to top edge (e.g., 62)
- **Bottom**: Distance from center to bottom edge (e.g., 29)

### Step 4: Calculate Values
Use these formulas:

```
radiusX = Left (or Right if different, use average)
radiusY = max(Top, Bottom)  // Use the LARGER value for safety
centerX = Image Width / 2   // Usually 198 for 396px wide images
centerY = Top + Bottom      // Distance from top of image to center
minSpawnRadius = 15-20      // Inner dead zone (avoid center clustering)
maxSpawnRadius = radiusY - 7  // Outer boundary (leave margin for character size)
minSpacing = 25             // Minimum distance between characters
```

### Step 5: Add to seed/maps.json

```json
{
  "id": X,
  "name": "Your Map Name",
  "description": "Map description",
  "assetPath": "assets/maps/your_map.png",
  "background": "assets/maps/your_map_bg.png",
  "spawnConfiguration": {
    "centerX": 198,
    "centerY": 62,
    "radiusX": 60,
    "radiusY": 62,
    "minSpawnRadius": 15,
    "maxSpawnRadius": 55,
    "minSpacing": 25
  },
  "isActive": true
}
```

## Example

**Aseprite readings:**
- Left: 60px
- Right: 59px
- Top: 62px
- Bottom: 29px
- Image size: 396 × 180px

**Calculated values:**
```json
{
  "centerX": 198,        // 396 / 2
  "centerY": 91,         // 62 + 29
  "radiusX": 60,         // Average of 60 and 59
  "radiusY": 62,         // max(62, 29)
  "minSpawnRadius": 15,
  "maxSpawnRadius": 55,  // 62 - 7
  "minSpacing": 25
}
```

## Tips

- **radiusY**: Always use the LARGER of Top/Bottom to ensure characters stay in bounds
- **maxSpawnRadius**: Leave 5-10px margin for character size (~15px radius)
- **minSpawnRadius**: Start with 15-20 to avoid center clustering
- **minSpacing**: 25px works well for most character sizes
- Test in-game and adjust if characters spawn too close or out of bounds
