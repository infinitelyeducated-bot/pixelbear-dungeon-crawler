# PixelBear's ASCII Dungeon Crawler

A party-based ASCII dungeon crawler that runs in the browser. Supports local play and LAN/WAN multiplayer via WebRTC.

## Quick start

```bash
npm install
npm start
```

Then open the printed local URL in your browser (e.g. http://localhost:8080/crawler.html).

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Move up |
| A / ← | Move left |
| S / ↓ | Move down |
| D / → | Move right |
| F | Attack nearest target |
| R | Rest and heal |
| G | Stand guard |
| E | End turn |
| Esc | Pause menu |

On mobile devices, the on-screen D-pad and action buttons replace the keyboard shortcuts.

## Multiplayer

1. Start the server on one computer.
2. One player clicks **Network → Host Game**. A host ID appears.
3. Other players open the same page, enter the host ID, and click **Join**.
4. Each joining player is automatically assigned a party member to control.
5. The host is authoritative: client actions are sent to the host, applied, and synced back.

## UI features

- **Turn-order timeline bar** shows living party members in turn order and highlights the active character.
- **Class avatars/portraits** appear on character sheets and the turn-order bar.
- **Floating combat text** appears over the map when characters or monsters take damage.
- **Reachable-tile highlights** show where the active character can move on their turn.
- **HP bars** on each character sheet display current health as a colored bar.
- **Map tooltips** describe monsters, treasure, traps, doors, and terrain when you hover over a tile.
- **Minimap overview** in the side panel shows explored areas and party positions.
- **Mobile controls** include an on-screen D-pad and action buttons that appear on narrow screens.
- **Pause menu** has a Mute toggle and a volume slider; settings persist in `localStorage`.

## Combat & gameplay features

- **Inventory system** with usable items: Healing Potion, Scroll of Blessing, Potion of Haste, Antidote, and Iron Key. Pick them up from the floor and use them from the side panel.
- **Status effects**: Poison, Stun, Bless, Haste, and Slow. They modify attack, movement, and action availability.
- **Monster AI variants**: Ranged attackers, fleeing cowards, pack hunters, patrollers, and brutes.
- **Boss floors** every 5 dungeon levels with larger, tougher boss monsters.
- **Revised death mechanics**: On Hard/Nightmare, death is permanent. On Easy/Normal, downed members have a chance to make a death saving throw; shrines revive one fallen ally.
- **Party formations** (Cluster, Line, Wedge, Spread) chosen before the first move.
- **Difficulty presets** (Easy, Normal, Hard, Nightmare) control enemy density, trap density, XP rate, monster stats, and permadeath.

## Project structure

```
.
├── crawler.html          # Main game page
├── server.js             # Static file server + WebSocket signaling
├── package.json
└── modules/
    ├── main.js           # Initialization and UI wiring
    ├── state.js          # Game state, save/load, snapshots
    ├── party.js          # Party members, stats, leveling
    ├── map.js            # Maze generation, floors, fog of war, biomes
    ├── pathfinding.js    # Reachability and distance helpers
    ├── combat.js         # Combat, traps, treasure
    ├── actions.js        # Player turn actions
    ├── ui.js             # Rendering, turn order, minimap, floating text
    ├── layout.js         # Draggable panels
    ├── input.js          # Keyboard/button/touch input
    ├── network.js        # WebRTC host/client
    ├── network-actions.js# Remote turn handling
    ├── log.js            # Adventure log
    ├── config.js         # Constants
    └── utils.js          # Helpers
```

## Save data

Snapshots are stored in `localStorage` under `ascii-dungeon-crawler.snapshot.v1`. Use the pause menu to save or load manually.
