import { POWER_ITEM_DROP_CHANCE, MAX_CHARACTER_LEVEL, ENEMIES, MAX_ENEMY_SCALE_LEVEL, MAX_ENEMY_ATTACK_BONUS } from './config.js';
import { pathDistanceWithin, positionKey } from './utils.js';
import { activeMember } from './state.js';
import {
    adjacentPartyMembers,
    adjacentDeadPartyMembers,
    experienceRequired,
    gainExperience,
    updateDerivedStats
} from './party.js';

export function handleTrap(game, x, y, logMessage) {
    const member = activeMember(game);
    const damage = Math.floor(Math.random() * 5) + 2;
    member.hp = Math.max(0, member.hp - damage);
    logMessage(`${member.name} triggers a trap and takes ${damage} damage.`, member);
    game.map[y][x] = '.';
    if (member.hp === 0) logMessage(`${member.name} is down!`, member);
}

export function handleTreasure(game, x, y, logMessage) {
    const member = activeMember(game);
    const key = positionKey(x, y);
    const treasure = game.treasures[key];
    if (!treasure) return;
    if (treasure.type === 'power') {
        collectPowerItem(member, game, logMessage);
    } else {
        member.treasureCount++;
        member.treasure += treasure.value;
        logMessage(`${member.name} collects ${treasure.name} worth ${treasure.value} treasure (total ${member.treasure}).`, member);
    }
    delete game.treasures[key];
    game.map[y][x] = '.';
}

export function collectPowerItem(member, game, logMessage) {
    member.treasureCount++;
    member.powerItems++;
    updateDerivedStats(member);
    logMessage(`${member.name} finds a Power Item! Gains 60 XP and +5 damage.`, member);
    gainExperience(member, 60, 'finding a Power Item', game, logMessage);
    playPowerItemSound();
}

function playPowerItemSound() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
        const context = new AudioContextConstructor();
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;
        filter.connect(context.destination);
        const now = context.currentTime;
        for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sawtooth';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + index * 0.105);
            gain.gain.linearRampToValueAtTime(0.12, now + index * 0.105 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.105 + 0.19);
            oscillator.connect(gain);
            gain.connect(filter);
            oscillator.start(now + index * 0.105);
            oscillator.stop(now + index * 0.105 + 0.2);
        }
        window.setTimeout(() => context.close(), 700);
    } catch (error) {
        console.error('Power item sound failed:', error);
    }
}

export function attackMonster(game, member, x, y, logMessage) {
    const key = positionKey(x, y);
    const monster = game.monsters[key];
    if (!monster) return false;

    const distance = pathDistanceWithin(game.map, member.position, { x, y }, 2);
    const nearbyAllies = adjacentPartyMembers(game, member).filter(ally =>
        Math.abs(ally.position.x - x) + Math.abs(ally.position.y - y) <= 1
    );
    const teamDamageBonus = Math.min(6, nearbyAllies.length * 2);
    const { damage, critical, criticalRoll } = rollAttackDamage(member, distance, teamDamageBonus);
    monster.hp = Math.max(0, monster.hp - damage);
    logMessage(
        `${member.name} ${critical ? 'critically hits' : 'hits'} ${monster.name} for ${damage} damage` +
        `${critical ? ` (critical roll ${criticalRoll})` : ''}` +
        `${teamDamageBonus ? ` with ${nearbyAllies.length} ally assist(s) (+${teamDamageBonus})` : ''}` +
        ` (${monster.hp}/${monster.maxHp} HP left).`,
        member
    );

    if (monster.hp === 0) {
        const xp = killExperience(member, game);
        logMessage(`${member.name} defeats ${monster.name} and gains ${xp} XP.`, member);
        gainExperience(member, xp, 'defeating a monster', game, logMessage);
        delete game.monsters[key];
        game.map[y][x] = '.';
        if (Math.random() < POWER_ITEM_DROP_CHANCE) {
            logMessage(`${monster.name} drops a Power Item; ${member.name} automatically collects it.`, member);
            collectPowerItem(member, game, logMessage);
        }
        return true;
    }

    if (distance > 1) return false;
    const retaliation = Math.max(1,
        monster.attack - member.defense - Math.min(3, adjacentPartyMembers(game, member).length) +
        Math.floor(Math.random() * 2));
    member.hp = Math.max(0, member.hp - retaliation);
    logMessage(`${member.name} is struck by ${monster.name} for ${retaliation} damage.`, member);
    if (member.hp === 0) {
        logMessage(`${member.name} is down!`, member);
        checkPartyDefeat(game, logMessage);
    }
    return false;
}

export function enemyTurn(game, member, logMessage) {
    if (member.hp <= 0) return;
    if (member.guardActive) {
        member.guardActive = false;
        resolveGuardReaction(game, member, logMessage);
        return;
    }
    if (Math.random() >= 0.3) return;

    let attacker = null;
    let closestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game.map, { x, y }, member.position, 2);
            if (distance < closestDistance) {
                attacker = game.monsters[positionKey(x, y)];
                closestDistance = distance;
            }
        }
    }
    if (!attacker) return;

    const guardedByParty = Math.min(3, adjacentPartyMembers(game, member).length);
    const damage = Math.max(1,
        attacker.attack - member.defense - guardedByParty + Math.floor(Math.random() * 2));
    member.hp = Math.max(0, member.hp - damage);
    logMessage(`${member.name} is attacked by a nearby ${attacker.name} for ${damage} damage.`, member);
    if (member.hp === 0) {
        logMessage(`${member.name} is down!`, member);
        checkPartyDefeat(game, logMessage);
    }
}

function resolveGuardReaction(game, member, logMessage) {
    let nearestPosition = null;
    let nearestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game.map, { x, y }, member.position, 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPosition = { x, y };
            }
        }
    }
    if (nearestPosition) {
        const monster = game.monsters[positionKey(nearestPosition.x, nearestPosition.y)];
        const alliesHelping = adjacentPartyMembers(game, member).filter(ally =>
            Math.abs(ally.position.x - nearestPosition.x) + Math.abs(ally.position.y - nearestPosition.y) <= 1
        );
        const { damage, critical, criticalRoll } = rollAttackDamage(member, nearestDistance, Math.min(6, alliesHelping.length * 2));
        monster.hp = Math.max(0, monster.hp - damage);
        logMessage(
            `${member.name} reacts to ${monster.name} and ${critical ? 'critically hits' : 'strikes'} for ${damage} damage` +
            `${alliesHelping.length ? ` with ${alliesHelping.length} ally assist(s)` : ''}` +
            `${critical ? ` (critical roll ${criticalRoll})` : ''}.`,
            member
        );
        if (monster.hp === 0) {
            const xp = killExperience(member, game);
            logMessage(`${member.name} defeats ${monster.name} and gains ${xp} XP.`, member);
            gainExperience(member, xp, 'defeating a monster', game, logMessage);
            delete game.monsters[positionKey(nearestPosition.x, nearestPosition.y)];
            game.map[nearestPosition.y][nearestPosition.x] = '.';
        }
    } else {
        logMessage(`${member.name} stands guard, but no monster comes within 2 spaces.`, member);
    }
    if (member.classKey === 'cleric') attemptClericGuardHeal(game, member, logMessage);
}

function attemptClericGuardHeal(game, cleric, logMessage) {
    if (cleric.clericHealedLevels.includes(cleric.dungeonLevel)) return;
    const adjacentMembers = game.party.filter(member =>
        member !== cleric && member.hp > 0 && member.position &&
        member.dungeonLevel === cleric.dungeonLevel &&
        Math.abs(member.position.x - cleric.position.x) + Math.abs(member.position.y - cleric.position.y) === 1
    ).filter(member => member.hp < member.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (!adjacentMembers.length) {
        logMessage(`${cleric.name} has no injured adjacent party member to heal while guarding.`, cleric);
        return;
    }
    const chance = Math.min(100, cleric.intelligence * cleric.level);
    if (Math.random() * 100 >= chance) {
        logMessage(`${cleric.name} fails to heal while guarding (${chance}% chance).`, cleric);
        return;
    }
    const target = adjacentMembers[0];
    const healed = target.maxHp - target.hp;
    target.hp = target.maxHp;
    cleric.clericHealedLevels.push(cleric.dungeonLevel);
    logMessage(`${cleric.name} fully heals adjacent ${target.name} for ${healed} HP while guarding.`, cleric);
}

export function rollAttackDamage(member, distance, teamDamageBonus = 0) {
    const wizardRangedAttack = member.classKey === 'wizard' && distance <= 2 && member.movesRemaining > 0;
    const criticalRoll = Math.floor(Math.random() * 6) + 1 + criticalRollBonus(member, wizardRangedAttack);
    const critical = criticalRoll >= 6;
    const rogueBonus = member.classKey === 'rogue' ? member.initiative * 1.5 : 0;
    const baseDamage = Math.max(1,
        member.attack + rogueBonus + teamDamageBonus + Math.floor(Math.random() * 3));
    return {
        damage: critical ? baseDamage * 2 : baseDamage,
        critical,
        criticalRoll
    };
}

function criticalRollBonus(member, wizardRangedAttack = false) {
    const invested = stat => Math.max(0, member[stat] - 10);
    switch (member.classKey) {
        case 'fighter': return invested('strength');
        case 'rogue': return invested('dexterity') + member.initiative;
        case 'wizard': return wizardRangedAttack ? invested('intelligence') : 0;
        case 'cleric': return invested('wisdom');
        default: return 0;
    }
}

export function killExperience(member, game) {
    const baseExperience = member.dungeonLevel >= 15 ? 25 : 10;
    return baseExperience + Math.floor(member.wisdom / 5);
}

export function movementExperience(member) {
    return 3;
}

export function checkPartyDefeat(game, logMessage) {
    game.gameOver = game.party.every(member => member.hp <= 0);
    if (game.gameOver) logMessage('The entire party has fallen. Game over.', null, 'Dungeon');
}

export function nearestAttackTarget(game, member) {
    if (!member?.position) return null;
    const attackRange = member.classKey === 'wizard' && member.movesRemaining > 0 ? 2 : 1;
    let nearest = null;
    let nearestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game.map, member.position, { x, y }, attackRange);
            if (distance > 0 && distance <= attackRange && distance < nearestDistance) {
                nearest = { x, y };
                nearestDistance = distance;
            }
        }
    }
    return nearest;
}
