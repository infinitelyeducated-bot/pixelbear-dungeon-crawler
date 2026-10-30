import {
    SAVE_VERSION,
    SAVE_STORAGE_KEY,
    MAX_PARTY_SIZE,
    MAX_MAP_WIDTH,
    MAX_MAP_HEIGHT,
    CLASSES,
    BASE_MAP_WIDTH,
    BASE_MAP_HEIGHT,
    LEGACY_MAP_WIDTH,
    LEGACY_MAP_HEIGHT,
    MAP_SIZE_MULTIPLIER
} from './config.js';
import { deepClone, positionKey } from './utils.js';

export function createGame() {
    return {
        party: [],
        activeMemberIndex: 0,
        map: [],
        monsters: {},
        treasures: {},
        exitPositions: [],
        floorStates: {},
        gameOver: false,
        turn: 0,
        nextMemberId: 1,
        hasStarted: false,
        startingPointsPerPlayer: null,
        network: {
            mode: null, // 'host' | 'client' | null
            peerId: null,
            hostId: null,
            connections: [],
            queuedActions: []
        }
    };
}

export function createPartyMember(game, name, classKey) {
    if (game.party.length >= MAX_PARTY_SIZE) return null;
    const baseStats = CLASSES[classKey];
    const classSettings = {
        fighter: { race: 'Human', armorClass: 14 },
        rogue: { race: 'Elf', armorClass: 12 },
        wizard: { race: 'Gnome', armorClass: 10 },
        cleric: { race: 'Dwarf', armorClass: 16 }
    }[classKey];

    const newMember = {
        id: game.nextMemberId++,
        color: PLAYER_COLORS[game.party.length % PLAYER_COLORS.length],
        marker: PLAYER_MARKERS[game.party.length % PLAYER_MARKERS.length],
        name,
        className: baseStats.name,
        classKey,
        race: classSettings.race,
        ...deepClone(baseStats),
        xp: 0,
        treasure: 0,
        treasureCount: 0,
        powerItems: 0,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        armorClass: classSettings.armorClass,
        initiative: 0,
        classBase: deepClone(baseStats),
        pendingAttributePoints: game.startingPointsPerPlayer || 0,
        dungeonLevel: 1,
        clericHealedLevels: [],
        floorPositions: {},
        position: null,
        guardActive: false,
        movesPerTurn: 0,
        movesRemaining: 0,
        allocatedFields: []
    };
    game.party.push(newMember);
    return newMember;
}

export function activeMember(game) {
    return game.party[game.activeMemberIndex] || null;
}

export function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== SAVE_VERSION || !snapshot.game) return false;
    const g = snapshot.game;
    if (!Array.isArray(g.party) || g.party.length < 1 || g.party.length > MAX_PARTY_SIZE) return false;
    if (!Array.isArray(g.map) || g.map.length < 1 || g.map.length > MAX_MAP_HEIGHT) return false;
    if (!g.map.every(row => Array.isArray(row) && row.length === g.map[0].length && row.length >= 1 && row.length <= MAX_MAP_WIDTH)) return false;
    if (!Number.isInteger(g.activeMemberIndex) || g.activeMemberIndex < 0 || g.activeMemberIndex >= g.party.length) return false;
    if (!g.monsters || typeof g.monsters !== 'object') return false;
    if (!g.floorStates || typeof g.floorStates !== 'object') return false;
    if (!Array.isArray(g.exitPositions)) return false;
    if (!Array.isArray(snapshot.log)) return false;
    return g.party.every(member =>
        member && Number.isInteger(member.id) && typeof member.name === 'string' &&
        Object.hasOwn(CLASSES, member.classKey) && Number.isFinite(member.hp) &&
        Number.isFinite(member.maxHp) && Number.isInteger(member.dungeonLevel) && member.dungeonLevel >= 1 &&
        (member.position === null || (Number.isFinite(member.position.x) && Number.isFinite(member.position.y))) &&
        (member.position !== null || (
            member.floorPositions &&
            member.floorPositions[member.dungeonLevel] &&
            Number.isFinite(member.floorPositions[member.dungeonLevel].x) &&
            Number.isFinite(member.floorPositions[member.dungeonLevel].y)
        ))
    );
}

export function saveSnapshot(game, gameLog) {
    const snapshot = {
        version: SAVE_VERSION,
        game: deepClone(game),
        log: deepClone(gameLog)
    };
    return snapshot;
}

export function persistSnapshot(game, gameLog) {
    const snapshot = saveSnapshot(game, gameLog);
    try {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(snapshot));
        return true;
    } catch (error) {
        console.error('Failed to save snapshot:', error);
        return false;
    }
}

export function loadSnapshot(snapshot) {
    if (!validateSnapshot(snapshot)) return null;
    const game = deepClone(snapshot.game);
    game.activeMember = () => game.party[game.activeMemberIndex] || null;
    return { game, log: deepClone(snapshot.log) };
}

export function loadStoredSnapshot() {
    try {
        const raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (!raw) return null;
        return loadSnapshot(JSON.parse(raw));
    } catch (error) {
        console.error('Failed to load stored snapshot:', error);
        return null;
    }
}

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
