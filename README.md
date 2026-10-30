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
| F | Attack |
| R | Rest |
| G | Guard |
| E | End turn |
| Esc | Pause menu |

## Multiplayer

1. Start the server on one computer.
2. One player clicks **Network → Host Game**. A host ID appears.
3. Other players open the same page, enter the host ID, and click **Join**.
4. Each joining player is automatically assigned a party member to control.
5. The host is authoritative: client actions are sent to the host, applied, and synced back.

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
    ├── map.js            # Maze generation, floors
    ├── combat.js         # Combat, traps, treasure
    ├── actions.js        # Player turn actions
    ├── ui.js             # Rendering
    ├── layout.js         # Draggable panels
    ├── input.js          # Keyboard/button input
    ├── network.js        # WebRTC host/client
    ├── network-actions.js# Remote turn handling
    ├── log.js            # Adventure log
    ├── config.js         # Constants
    └── utils.js          # Helpers
```

## Save data

Snapshots are stored in `localStorage` under `ascii-dungeon-crawler.snapshot.v1`. Use the pause menu to save or load manually.
