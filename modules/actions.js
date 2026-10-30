import { activeMember } from './state.js';
import {
    adjacentDeadPartyMembers,
    setMovementAllowance,
    updateDerivedStats,
    experienceRequired,
    gainExperience
} from './party.js';
import { storeActiveFloor, loadMemberFloor } from './map.js';
import { handleTrap, handleTreasure, attackMonster, enemyTurn, checkPartyDefeat, nearestAttackTarget } from './combat.js';

export function move(game, direction, logMessage, updateUI, broadcast) {
    if (game.gameOver) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0) return;
    if (member.movesRemaining <= 0) {
        finishTurn(game, logMessage, updateUI, broadcast);
        return;
    }

    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    const newX = member.position.x + dx;
    const newY = member.position.y + dy;

    if (game.map[newY]?.[newX] === '#') {
        logMessage('A solid wall blocks the way.', member);
        return;
    }

    beginMovement(game, member, logMessage);
    const targetCell = game.map[newY][newX];

    if (targetCell === 'M') {
        member.movesRemaining--;
        const defeated = attackMonster(game, member, newX, newY, logMessage);
        if (defeated && member.hp > 0) {
            member.position = { x: newX, y: newY };
            gainExperience(member, movementExperience(), 'movement', game, logMessage);
            if (game.treasures[`${newX},${newY}`]) handleTreasure(game, newX, newY, logMessage);
        }
        if (member.hp <= 0 || member.movesRemaining <= 0) finishTurn(game, logMessage, updateUI, broadcast);
        updateUI();
        if (broadcast) broadcast({ type: 'state', game });
        return;
    }

    member.position = { x: newX, y: newY };
    member.movesRemaining--;
    gainExperience(member, movementExperience(), 'movement', game, logMessage);
    logMessage(`moves ${direction} to (${newX + 1}, ${newY + 1}).`, member);

    if (targetCell === '^') handleTrap(game, newX, newY, logMessage);
    if (game.treasures[`${newX},${newY}`]) handleTreasure(game, newX, newY, logMessage);
    if (targetCell === '>') {
        nextLevel(game, member, logMessage);
        updateUI();
        if (broadcast) broadcast({ type: 'state', game });
        return;
    }

    if (member.hp <= 0 || member.movesRemaining <= 0) finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'state', game });
}

export function attack(game, logMessage, updateUI, broadcast) {
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver) return;
    const target = nearestAttackTarget(game, member);
    if (!target) {
        logMessage('has no monster in attack range.', member);
        return;
    }
    attackMonster(game, member, target.x, target.y, logMessage);
    if (!game.gameOver) finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'state', game });
}

export function standGuard(game, logMessage, updateUI, broadcast) {
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver || member.guardActive) return;
    const fallen = member.classKey === 'cleric' && member.movesRemaining >= 3
        ? adjacentDeadPartyMembers(game, member)
        : [];
    if (fallen.length) {
        const revived = fallen[0];
        revived.hp = Math.max(1, Math.ceil(revived.maxHp * 0.25));
        revived.guardActive = false;
        member.movesRemaining = 0;
        logMessage(`uses a demanding Guard to bring ${revived.name} back from the dead with ${revived.hp} HP.`, member);
        finishTurn(game, logMessage, updateUI, broadcast);
        updateUI();
        if (broadcast) broadcast({ type: 'state', game });
        return;
    }
    if (member.hp !== member.maxHp || member.movesRemaining < 2) return;
    member.guardActive = true;
    member.movesRemaining--;
    logMessage('stands guard and can react to a monster within 2 spaces at turn end.', member);
    updateUI();
    if (broadcast) broadcast({ type: 'state', game });
}

export function rest(game, logMessage, updateUI, broadcast) {
    const member = activeMember(game);
    if (!member || member.hp <= 0) return;
    if (member.hp < member.maxHp) {
        const oldHp = member.hp;
        const healAmount = Math.max(1, Math.floor(member.maxHp * 0.3));
        member.hp = Math.min(member.maxHp, member.hp + healAmount);
        logMessage(`rests and recovers ${member.hp - oldHp} HP.`, member);
    } else {
        logMessage('is already at full health.', member);
    }
    finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'state', game });
}

export function finishTurn(game, logMessage, updateUI, broadcast) {
    const member = activeMember(game);
    if (!member) return;
    logMessage('ends their turn.', member);
    enemyTurn(game, member, logMessage);
    member.movesRemaining = 0;
    if (game.gameOver) {
        updateUI();
        return;
    }
    storeActiveFloor(game, member);

    for (let offset = 1; offset <= game.party.length; offset++) {
        const nextIndex = (game.activeMemberIndex + offset) % game.party.length;
        const nextMember = game.party[nextIndex];
        if (nextMember.hp <= 0) continue;
        game.activeMemberIndex = nextIndex;
        loadMemberFloor(game, nextMember);
        setMovementAllowance(nextMember);
        logMessage(`begins their turn with ${nextMember.movesPerTurn} movement spaces.`, nextMember);
        updateUI();
        if (broadcast) broadcast({ type: 'state', game });
        return;
    }
    checkPartyDefeat(game, logMessage);
    updateUI();
    if (broadcast) broadcast({ type: 'state', game });
}

function beginMovement(game, member, logMessage) {
    if (!game.hasStarted) {
        game.hasStarted = true;
        for (const partyMember of game.party) {
            if (partyMember.pendingAttributePoints > 0) {
                logMessage(`${partyMember.name} forfeits ${partyMember.pendingAttributePoints} unused starting attribution points.`, partyMember);
                partyMember.pendingAttributePoints = 0;
            }
        }
        logMessage('begins the adventure; class and party setup are now locked.', member);
        return;
    }
    if (member.pendingAttributePoints > 0) {
        logMessage(`${member.name} forfeits ${member.pendingAttributePoints} unused attribution points before moving.`, member);
        member.pendingAttributePoints = 0;
    }
}

function nextLevel(game, member, logMessage) {
    storeActiveFloor(game, member);
    member.dungeonLevel++;
    game.turn = member.dungeonLevel - 1;
    loadMemberFloor(game, member);
    logMessage(`descends alone to dungeon level ${member.dungeonLevel}.`, member);
}

function movementExperience() {
    return 3;
}


