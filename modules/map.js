import {
    BASE_MAP_WIDTH,
    BASE_MAP_HEIGHT,
    LEGACY_MAP_WIDTH,
    LEGACY_MAP_HEIGHT,
    MAP_SIZE_MULTIPLIER,
    MAX_MAP_WIDTH,
    MAX_MAP_HEIGHT,
    POWER_ITEM_DROP_CHANCE
} from './config.js';
import { positionKey, shuffle, deepClone } from './utils.js';
import { activeMember } from './state.js';
import { setMovementAllowance } from './party.js';

export function mapDimensionsForLevel(dungeonLevel) {
    const dangerTier = Math.floor((dungeonLevel - 1) / 5);
    const expandDimension = size => {
        const expanded = Math.ceil(size * MAP_SIZE_MULTIPLIER);
        return Math.min(dungeonLevel <= 5 ? LEGACY_MAP_WIDTH : MAX_MAP_WIDTH, expanded);
    };
    const legacyWidth = Math.min(LEGACY_MAP_WIDTH, BASE_MAP_WIDTH + dangerTier * 4);
    const legacyHeight = Math.min(LEGACY_MAP_HEIGHT, BASE_MAP_HEIGHT + dangerTier * 2);
    return {
        width: expandDimension(legacyWidth),
        height: expandDimension(legacyHeight)
    };
}

export function generateMap(game, member = activeMember(game), logMessage = () => {}) {
    if (!member) return;
    const dimensions = mapDimensionsForLevel(member.dungeonLevel);
    game.mapWidth = dimensions.width;
    game.mapHeight = dimensions.height;
    game.turn = member.dungeonLevel - 1;
    game.map = Array.from({ length: game.mapHeight }, () => Array(game.mapWidth).fill('#'));
    game.monsters = {};
    game.treasures = {};
    game.exitPositions = [];

    const stack = [{ x: 1, y: 1 }];
    game.map[1][1] = ' ';

    while (stack.length) {
        const current = stack[stack.length - 1];
        const neighbors = [
            { x: current.x + 2, y: current.y },
            { x: current.x - 2, y: current.y },
            { x: current.x, y: current.y + 2 },
            { x: current.x, y: current.y - 2 }
        ].filter(n =>
            n.x > 0 && n.x < game.mapWidth - 1 &&
            n.y > 0 && n.y < game.mapHeight - 1 &&
            game.map[n.y][n.x] === '#'
        );

        if (!neighbors.length) {
            stack.pop();
        } else {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            game.map[(current.y + next.y) / 2][(current.x + next.x) / 2] = ' ';
            game.map[next.y][next.x] = ' ';
            stack.push(next);
        }
    }

    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === ' ') game.map[y][x] = '.';
        }
    }
    for (let y = 1; y <= 4; y++) {
        for (let x = 1; x <= 4; x++) game.map[y][x] = '.';
    }

    for (const other of game.party) {
        if (other.dungeonLevel === member.dungeonLevel) {
            other.position = other.floorPositions[member.dungeonLevel]
                ? { ...other.floorPositions[member.dungeonLevel] }
                : null;
        } else {
            other.position = null;
        }
    }

    member.position = member.floorPositions[member.dungeonLevel]
        ? { ...member.floorPositions[member.dungeonLevel] }
        : { x: 1, y: 1 };

    const spawnTiles = [
        { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 },
        { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 3 },
        { x: 3, y: 3 }, { x: 4, y: 1 }, { x: 1, y: 4 }, { x: 4, y: 2 }
    ];

    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== member.dungeonLevel || partyMember.position) continue;
        const spawn = spawnTiles.find(tile =>
            game.map[tile.y][tile.x] !== '#' &&
            !game.party.some(other =>
                other !== partyMember && other.dungeonLevel === member.dungeonLevel &&
                other.position?.x === tile.x && other.position?.y === tile.y
            )
        );
        partyMember.position = spawn ? { ...spawn } : { ...member.position };
    }

    placeExits(game);
    placeInteractables(game, member);
    game.map[1][1] = 'S';
    setMovementAllowance(member);
    storeActiveFloor(game, member);
}

function placeExits(game) {
    const openMazeTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.') openMazeTiles.push({ x, y });
        }
    }
    openMazeTiles.sort((a, b) =>
        (Math.abs(b.x - 1) + Math.abs(b.y - 1)) - (Math.abs(a.x - 1) + Math.abs(a.y - 1))
    );
    const firstExit = openMazeTiles[0];
    const secondExit = openMazeTiles.find(p =>
        p.x !== firstExit.x && p.y !== firstExit.y &&
        Math.abs(p.x - firstExit.x) + Math.abs(p.y - firstExit.y) > 4
    );
    game.exitPositions = [firstExit, secondExit || openMazeTiles[1]];
    for (const exit of game.exitPositions) game.map[exit.y][exit.x] = '>';
}

function placeInteractables(game, member) {
    const protectedPath = new Set(['2,1', '3,1', '4,1', '4,2', '4,3', '4,4']);
    const openTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            const key = positionKey(x, y);
            if (game.map[y][x] === '.' &&
                !protectedPath.has(key) &&
                Math.abs(x - 1) + Math.abs(y - 1) > 5) {
                openTiles.push({ x, y });
            }
        }
    }
    shuffle(openTiles);

    const dangerTier = Math.floor((member.dungeonLevel - 1) / 5);
    const livingPartySize = Math.max(1, game.party.filter(p => p.hp > 0).length);
    const interactionScale = 1 + dangerTier * 0.5;
    const baseMonsterCount = Math.ceil(livingPartySize * 0.75 * interactionScale);
    const baseTrapCount = Math.ceil(livingPartySize * 0.4 * interactionScale);
    const baseTreasureCount = Math.ceil(livingPartySize * 0.55 * interactionScale);
    const extraInteractables = Math.ceil((baseMonsterCount + baseTrapCount + baseTreasureCount) * 0.2);
    const bonusCounts = [0, 0, 0];
    for (let i = 0; i < extraInteractables; i++) bonusCounts[i % 3]++;

    let tileIndex = 0;
    for (let i = 0; i < baseMonsterCount + bonusCounts[0] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        game.map[y][x] = 'M';
        game.monsters[positionKey(x, y)] = createMonster(game);
    }
    for (let i = 0; i < baseTrapCount + bonusCounts[1] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        game.map[y][x] = '^';
    }
    for (let i = 0; i < baseTreasureCount + bonusCounts[2] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        const treasure = createTreasure(member);
        game.map[y][x] = treasure.icon;
        game.treasures[positionKey(x, y)] = treasure;
    }
}

export function createMonster(game) {
    const member = activeMember(game);
    const dungeonLevel = member?.dungeonLevel || 1;
    const scaleLevel = Math.min(MAX_ENEMY_SCALE_LEVEL, Math.floor((dungeonLevel - 1) / 3));
    const unlockedEnemies = Math.min(ENEMIES.length, 1 + scaleLevel);
    const template = ENEMIES[Math.floor(Math.random() * unlockedEnemies)];
    const attackBonus = Math.min(MAX_ENEMY_ATTACK_BONUS, Math.floor(scaleLevel / 3));
    const [minHp, maxHp] = dungeonLevel <= 5 ? [4, 8] : dungeonLevel <= 12 ? [8, 16] : [16, 30];
    const hp = minHp + Math.floor(Math.random() * (maxHp - minHp + 1));
    return {
        name: template.name,
        icon: template.icon,
        hp: hp,
        maxHp: hp,
        attack: template.attack + attackBonus
    };
}

export function createTreasure(member) {
    if (Math.random() < POWER_ITEM_DROP_CHANCE) {
        return { type: 'power', name: 'Power Item', icon: 'P', value: 0 };
    }
    const treasures = [
        { name: 'Coin Pouch', icon: '$' },
        { name: 'Gemstone', icon: '%' },
        { name: 'Relic', icon: '&' }
    ];
    const treasure = treasures[Math.floor(Math.random() * treasures.length)];
    const minValue = member.dungeonLevel > 15 ? 12 : 1;
    const maxValue = member.dungeonLevel > 15 ? 50 : 25;
    return { type: 'treasure', ...treasure, value: minValue + Math.floor(Math.random() * (maxValue - minValue + 1)) };
}

export function storeActiveFloor(game, member) {
    if (!member || !game.map.length || !member.position) return;
    game.floorStates[member.dungeonLevel] = {
        map: game.map.map(row => [...row]),
        monsters: deepClone(game.monsters),
        treasures: deepClone(game.treasures || {}),
        exitPositions: game.exitPositions.map(p => ({ ...p }))
    };
    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel === member.dungeonLevel && partyMember.position) {
            partyMember.floorPositions[member.dungeonLevel] = { ...partyMember.position };
        }
    }
}

export function loadMemberFloor(game, member) {
    const floor = game.floorStates[member.dungeonLevel];
    if (!floor) {
        generateMap(game, member);
        return;
    }
    game.mapWidth = floor.map[0].length;
    game.mapHeight = floor.map.length;
    game.map = floor.map.map(row => [...row]);
    game.monsters = deepClone(floor.monsters);
    game.treasures = deepClone(floor.treasures || {});
    game.exitPositions = floor.exitPositions.map(p => ({ ...p }));
    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== member.dungeonLevel) {
            partyMember.position = null;
            continue;
        }
        partyMember.position = partyMember.floorPositions[partyMember.dungeonLevel]
            ? { ...partyMember.floorPositions[partyMember.dungeonLevel] }
            : null;
    }
    if (!member.position) member.position = { x: 1, y: 1 };
    game.turn = member.dungeonLevel - 1;
    storeActiveFloor(game, member);
}

import { ENEMIES, MAX_ENEMY_SCALE_LEVEL, MAX_ENEMY_ATTACK_BONUS } from './config.js';
