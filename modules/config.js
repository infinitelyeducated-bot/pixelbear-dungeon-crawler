export const MAP_WIDTH = 21;
export const MAP_HEIGHT = 15;
export const MAX_PARTY_SIZE = 6;
export const SAVE_STORAGE_KEY = 'ascii-dungeon-crawler.snapshot.v1';
export const LAYOUT_STORAGE_KEY = 'ascii-dungeon-crawler.layout.v4';
export const SAVE_VERSION = 1;
export const MAX_CHARACTER_LEVEL = 30;
export const MAX_ENEMY_SCALE_LEVEL = 18;
export const MAX_ENEMY_ATTACK_BONUS = 6;
export const POWER_ITEM_DROP_CHANCE = 1 / 12;
export const BASE_MAP_WIDTH = 49;
export const BASE_MAP_HEIGHT = 35;
export const LEGACY_MAP_WIDTH = 61;
export const LEGACY_MAP_HEIGHT = 35;
export const MAP_SIZE_MULTIPLIER = 2.3;
export const MAX_MAP_WIDTH = 141;
export const MAX_MAP_HEIGHT = 81;
export const SIGNALING_SERVER_URL = `ws://${location.hostname}:8080`;

export const PLAYER_COLORS = [
    '#ff4d4d', '#00bfff', '#00e676', '#ffd600',
    '#e040fb', '#ff9100'
];

export const PLAYER_MARKERS = ['@', '1', '2', '3', '4', '5'];

export const CLASSES = {
    fighter: { name: "Fighter", hp: 15, maxHp: 15, attack: 4, defense: 3, xp: 0, level: 1 },
    rogue:   { name: "Rogue",   hp: 12, maxHp: 12, attack: 5, defense: 2, xp: 0, level: 1 },
    wizard:  { name: "Wizard",  hp: 10, maxHp: 10, attack: 6, defense: 1, xp: 0, level: 1 },
    cleric:  { name: "Cleric",  hp: 14, maxHp: 14, attack: 3, defense: 4, xp: 0, level: 1 }
};

export const CLASS_SETTINGS = {
    fighter: { race: 'Human', armorClass: 14 },
    rogue:   { race: 'Elf',   armorClass: 12 },
    wizard:  { race: 'Gnome', armorClass: 10 },
    cleric:  { race: 'Dwarf', armorClass: 16 }
};

export const ENEMIES = [
    { name: "Giant Rat",   icon: "🐀", hp: 8,  attack: 2 },
    { name: "Skeleton",    icon: "💀", hp: 10, attack: 3 },
    { name: "Orc",         icon: "👹", hp: 12, attack: 4 },
    { name: "Goblin",      icon: "👺", hp: 9,  attack: 3 },
    { name: "Viper",       icon: "🐍", hp: 7,  attack: 5 },
    { name: "Dark Knight", icon: "💀", hp: 18, attack: 5 },
    { name: "Manticore",   icon: "🐉", hp: 20, attack: 6 },
    { name: "Dragon",      icon: "🐉", hp: 30, attack: 8 }
];

export const DEFAULT_LAYOUT_SETTINGS = {
    'dungeon-map': { x: 247.54534912109375, y: 13.436698913574219, width: 337, height: 239 },
    'map-legend': { x: 779.3282012939453, y: -251.16278076171875, width: 304, height: 248 },
    'level-title': { x: 224.8062744140625, y: 3.6175918579101562 },
    'game-help': { x: 0, y: 0 },
    'game-log': { x: -677.5195007324219, y: -148.3204116821289, width: 406, height: 255 },
    'game-brand': { x: 0, y: 0 },
    'action-legend': { x: -335.40045166015625, y: 291.98960876464844, width: 503, height: 161 },
    'character-sheets': { x: 4.1343994140625, y: -20.155029296875 },
    'party-setup': { x: 0, y: 0 }
};
