import { CLASSES, CLASS_SETTINGS, MAX_PARTY_SIZE, MAX_CHARACTER_LEVEL } from './config.js';
import { activeMember } from './state.js';

export function movementAllowance(member) {
    return Math.max(1, Math.floor(member.dexterity / 5) + 2);
}

export function setMovementAllowance(member) {
    member.movesPerTurn = movementAllowance(member);
    member.movesRemaining = member.movesPerTurn;
}

export function updateDerivedStats(member) {
    const levelBonus = member.level - 1;
    member.maxHp = member.classBase.maxHp + levelBonus * 5 + Math.max(0, member.constitution - 10) * 5;
    member.attack = member.classBase.attack + levelBonus +
        (member.classKey === 'fighter' ? Math.floor(Math.max(0, member.strength - 10) / 5) : 0) +
        (member.powerItems || 0) * 5;
    member.defense = member.classBase.defense + levelBonus + Math.floor(Math.max(0, member.dexterity - 10) / 4);
}

export function applyCharacterClass(member, classKey, startingPoints = 0) {
    const baseStats = CLASSES[classKey];
    const settings = CLASS_SETTINGS[classKey];
    member.classKey = classKey;
    member.className = baseStats.name;
    member.classBase = { ...baseStats };
    member.race = settings.race;
    member.hp = baseStats.hp;
    member.maxHp = baseStats.maxHp;
    member.attack = baseStats.attack;
    member.defense = baseStats.defense;
    member.armorClass = settings.armorClass;
    member.initiative = 0;
    member.dexterity = 10;
    member.intelligence = 10;
    member.strength = 10;
    member.constitution = 10;
    member.wisdom = 10;
    member.pendingAttributePoints = startingPoints;
    member.clericHealedLevels = [];
    updateDerivedStats(member);
    member.hp = member.maxHp;
    setMovementAllowance(member);
}

export function experienceRequired(member, partySize) {
    return Math.max(1, Math.ceil(200 * member.level / partySize));
}

export function gainExperience(member, amount, source, game, logMessage) {
    member.xp += amount;
    logMessage(`${member.name} gains ${amount} XP from ${source} (${member.xp}/${experienceRequired(member, game.party.length)} toward next level).`, member);
    checkLevelUp(member, game, logMessage);
}

export function checkLevelUp(member, game, logMessage) {
    while (member.level < MAX_CHARACTER_LEVEL && member.xp >= experienceRequired(member, game.party.length)) {
        member.xp -= experienceRequired(member, game.party.length);
        member.level++;
        const allocated = member.allocatedFields || [];
        const allStats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'initiative'];
        for (const stat of allStats) {
            const bonus = allocated.includes(stat) ? 2 : 0.5;
            member[stat] = (member[stat] || 0) + bonus;
        }
        updateDerivedStats(member);
        member.hp = member.maxHp;
        member.pendingAttributePoints = 0;
        logMessage(`${member.name} reaches level ${member.level}, gains automatic attribution bonuses, and fully heals.`, member);
    }
}

export function removePartyMember(game, memberId, logMessage) {
    if (game.hasStarted) {
        logMessage('The party can only be changed before the first move.', activeMember(game));
        return false;
    }
    if (game.party.length <= 1) {
        logMessage('Cannot remove the last party member!', activeMember(game));
        return false;
    }
    const memberIndex = game.party.findIndex(m => m.id === memberId);
    if (memberIndex === -1) return false;

    const removedWasActive = game.activeMemberIndex === memberIndex;
    const removedName = game.party[memberIndex].name;
    game.party.splice(memberIndex, 1);

    if (removedWasActive) {
        game.activeMemberIndex = Math.min(memberIndex, game.party.length - 1);
        const next = game.party[game.activeMemberIndex];
        if (next.hp <= 0) {
            const living = game.party.findIndex(m => m.hp > 0);
            if (living >= 0) game.activeMemberIndex = living;
        }
    } else if (game.activeMemberIndex > memberIndex) {
        game.activeMemberIndex--;
    }

    game.party.forEach((member, index) => {
        member.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        member.marker = PLAYER_MARKERS[index % PLAYER_MARKERS.length];
    });
    logMessage(`${removedName} has left the party.`, activeMember(game));
    return true;
}

export function adjacentPartyMembers(game, member) {
    return game.party.filter(other =>
        other !== member && other.hp > 0 && other.position &&
        other.dungeonLevel === member.dungeonLevel &&
        Math.abs(other.position.x - member.position.x) + Math.abs(other.position.y - member.position.y) <= 1
    );
}

export function adjacentDeadPartyMembers(game, member) {
    return game.party.filter(other =>
        other !== member && other.hp <= 0 && other.position &&
        other.dungeonLevel === member.dungeonLevel &&
        Math.abs(other.position.x - member.position.x) + Math.abs(other.position.y - member.position.y) === 1
    );
}

import { PLAYER_COLORS, PLAYER_MARKERS } from './config.js';
