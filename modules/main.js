import { createGame, createPartyMember, activeMember, persistSnapshot, loadStoredSnapshot, saveSnapshot } from './state.js';
import { generateMap, storeActiveFloor, loadMemberFloor } from './map.js';
import { applyCharacterClass, updateDerivedStats, setMovementAllowance } from './party.js';
import { createLogger } from './log.js';
import { LayoutManager } from './layout.js';
import { NetworkManager } from './network.js';
import { renderMap, renderLegend, updateActionButtons, renderCharacterSheets, updateMapSizing, centerMapOnActiveMember } from './ui.js';
import { bindInput } from './input.js';
import { handleRemoteAction } from './network-actions.js';
import { MAX_PARTY_SIZE, CLASSES } from './config.js';

let game = createGame();
let gameLog = [];
let logMessage = createLogger(gameLog, appendLogRecord);
let layoutManager = new LayoutManager();
let networkManager = null;

function initGame() {
    const stored = loadStoredSnapshot();
    if (stored) {
        game = stored.game;
        gameLog = stored.log;
        logMessage = createLogger(gameLog, appendLogRecord);
    } else {
        startNewGame();
    }
}

function startNewGame() {
    game = createGame();
    gameLog = [];
    logMessage = createLogger(gameLog, appendLogRecord);
    createPartyMember(game, 'Aldric', 'fighter');
    createPartyMember(game, 'Brienne', 'rogue');
    createPartyMember(game, 'Cedric', 'wizard');
    createPartyMember(game, 'Dalia', 'cleric');
    createPartyMember(game, 'Elara', 'fighter');
    createPartyMember(game, 'Finn', 'rogue');
    generateMap(game, activeMember(game), logMessage);
    updateUI();
    logMessage('Welcome to the ASCII Dungeon! Navigate to find treasure and defeat enemies.', null, 'Dungeon');
    logMessage('DM distributes 3 points per character before the first move; unused points are forfeited. On level, +2 to invested stats and +0.5 to others.', activeMember(game));
}

export function updateUI() {
    renderMap(game, document.getElementById('dungeon-map-content'));
    renderLegend(game, document.getElementById('player-legend-markers'));
    document.getElementById('level-title').textContent = `DUNGEON LEVEL ${activeMember(game)?.dungeonLevel || 1}`;
    updateActionButtons(game);
    renderCharacterSheets(game, document.getElementById('character-sheet-list'));
    layoutManager.refresh();
    updateMapSizing();
    centerMapOnActiveMember(game);
}

function appendLogRecord(record) {
    const logPanel = document.getElementById('game-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = document.createElement('span');
    timestamp.style.color = '#ffcc00';
    timestamp.textContent = `[${record.timestamp}] `;
    const name = document.createElement('strong');
    const member = game.party.find(p => p.id === record.memberId);
    name.style.color = member ? member.color : '#ffcc00';
    name.textContent = member ? member.name : record.actorName;
    entry.append(timestamp, name, document.createTextNode(` ${record.message}`));
    logPanel.appendChild(entry);
    while (logPanel.children.length > 200) logPanel.firstElementChild.remove();
    logPanel.scrollTop = logPanel.scrollHeight;
}

function renderSavedLog() {
    const logPanel = document.getElementById('game-log');
    logPanel.replaceChildren();
    for (const record of gameLog) appendLogRecord(record);
}

function broadcast(data) {
    if (networkManager && networkManager.mode) {
        if (data.type === 'state') {
            networkManager.broadcast({ type: 'sync', game });
        } else {
            networkManager.broadcast(data);
        }
    }
}

function setupNetworkHandlers() {
    if (!networkManager) return;
    networkManager.addEventListener('status', event => {
        document.getElementById('network-status').textContent = event.detail;
    });
    networkManager.addEventListener('peerConnected', event => {
        const { peerId } = event.detail;
        logMessage(`Peer ${peerId} connected.`, null, 'Network');
        if (networkManager.isHost) {
            const assigned = assignPeerToMember(peerId);
            networkManager.sendTo(peerId, { type: 'state', game, yourMemberId: assigned });
            networkManager.broadcast({ type: 'sync', game });
        }
    });
    networkManager.addEventListener('peerDisconnected', event => {
        const disconnectedPeerId = event.detail.peerId;
        const memberId = networkManager.getAssignedMemberId(disconnectedPeerId);
        const member = memberId ? game.party.find(m => m.id === memberId) : null;
        if (member) {
            logMessage(`${member.name} is no longer controlled by a remote player (peer ${disconnectedPeerId} disconnected).`, null, 'Network');
        }
        logMessage(`Peer ${disconnectedPeerId} disconnected.`, null, 'Network');
    });
    networkManager.addEventListener('message', event => {
        const { peerId, data } = event.detail;
        if (data.type === 'state') {
            game = data.game;
            if (data.yourMemberId) networkManager.setLocalMemberId(data.yourMemberId);
            updateUI();
        } else if (data.type === 'action') {
            handleRemoteAction(game, networkManager, { peerId, ...data }, logMessage, updateUI, broadcast);
        } else if (data.type === 'sync') {
            game = data.game;
            updateUI();
        }
    });
}

function assignPeerToMember(peerId) {
    const used = new Set([networkManager.localMemberId]);
    for (const conn of networkManager.connections.values()) {
        if (conn.assignedMemberId) used.add(conn.assignedMemberId);
    }
    const available = game.party.find(m => m.hp > 0 && !used.has(m.id));
    if (available) {
        networkManager.assignMember(peerId, available.id);
        logMessage(`${available.name} is now controlled by peer ${peerId}.`, null, 'Network');
        return available.id;
    }
    logMessage(`Peer ${peerId} connected, but no party members are available to assign.`, null, 'Network');
    return null;
}

function bindNetworkUI() {
    const dialog = document.getElementById('network-dialog');
    document.getElementById('network-button')?.addEventListener('click', () => dialog?.showModal());
    document.getElementById('network-cancel')?.addEventListener('click', () => dialog?.close());
    document.getElementById('host-button')?.addEventListener('click', async () => {
        const url = document.getElementById('signaling-url').value;
        networkManager = new NetworkManager();
        setupNetworkHandlers();
        try {
            const id = await networkManager.startHost(url);
            document.getElementById('host-id-display').textContent = id;
            document.getElementById('network-mode').textContent = 'Hosting';
        } catch (error) {
            alert('Could not start host: ' + error.message);
        }
    });
    document.getElementById('join-button')?.addEventListener('click', async () => {
        const url = document.getElementById('signaling-url').value;
        const hostId = document.getElementById('join-host-id').value.trim();
        if (!hostId) return;
        networkManager = new NetworkManager();
        setupNetworkHandlers();
        try {
            await networkManager.joinHost(hostId, url);
            document.getElementById('network-mode').textContent = `Client of ${hostId}`;
        } catch (error) {
            alert('Could not join host: ' + error.message);
        }
    });
}

function bindGameUI() {
    document.getElementById('add-member-btn')?.addEventListener('click', () => {
        const classKeys = Object.keys(CLASSES);
        createPartyMember(game, `Adventurer ${game.party.length + 1}`, classKeys[0]);
        refreshPartySetupMap();
        updateUI();
    });
    document.getElementById('remove-member-btn')?.addEventListener('click', () => {
        if (game.party.length > 0) {
            removePartyMember(game.activeMember().id);
            refreshPartySetupMap();
            updateUI();
        }
    });
    document.getElementById('gm-starting-points')?.addEventListener('change', event => {
        setStartingPoints(event.target);
    });
    document.getElementById('resume-button')?.addEventListener('click', () => {
        document.getElementById('escape-menu').close();
    });
    document.getElementById('open-sheets-button')?.addEventListener('click', () => {
        document.getElementById('escape-menu').close();
        document.getElementById('character-sheets').scrollIntoView({ behavior: 'smooth' });
        document.querySelector('#character-sheet-list input')?.focus({ preventScroll: true });
    });
    document.getElementById('save-game-button')?.addEventListener('click', () => {
        persistSnapshot(game, gameLog);
        document.getElementById('save-status').textContent = 'Game saved.';
    });
    document.getElementById('load-game-button')?.addEventListener('click', () => {
        const stored = loadStoredSnapshot();
        if (stored) {
            game = stored.game;
            gameLog = stored.log;
            logMessage = createLogger(gameLog, appendLogRecord);
            renderSavedLog();
            updateUI();
            document.getElementById('escape-menu').close();
        }
    });
    document.getElementById('reset-game-button')?.addEventListener('click', startNewGame);
    document.getElementById('toggle-layout-edit-button')?.addEventListener('click', () => {
        layoutManager.setEditMode(!layoutManager.layoutEditMode);
        if (layoutManager.layoutEditMode) document.getElementById('escape-menu').close();
    });
    document.getElementById('reset-layout-button')?.addEventListener('click', () => layoutManager.reset());

    document.getElementById('character-sheet-list')?.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
        if (!event.target.dataset.pointStat) updateCharacterField(event.target);
    });
    document.getElementById('character-sheet-list')?.addEventListener('click', event => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.pointStat) return;
        updateAttributePoints(event.target, 1);
    });
    document.getElementById('character-sheet-list')?.addEventListener('contextmenu', event => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.pointStat) return;
        event.preventDefault();
        updateAttributePoints(event.target, -1);
    });
}

function updateCharacterField(input) {
    const member = game.party.find(item => item.id === Number(input.dataset.memberId));
    if (!member) return;
    const field = input.dataset.field;
    if (field === 'classKey') {
        if (game.hasStarted || !CLASSES[input.value]) {
            updateUI();
            return;
        }
        applyCharacterClass(member, input.value, game.startingPointsPerPlayer || 0);
        logMessage(`${member.name} changes class to ${member.className}.`, member);
        updateUI();
        return;
    }
    const textFields = ['name', 'race'];
    if (textFields.includes(field)) {
        const value = input.value.trim();
        if (!value || value.length > 60) {
            logMessage(`${field} must contain 1 to 60 characters.`, member);
            updateUI();
            return;
        }
        member[field] = value;
    } else {
        const value = Number(input.value);
        const bounds = { hp: [0, member.maxHp] }[field];
        if (!bounds || !Number.isInteger(value) || value < bounds[0] || value > bounds[1]) {
            logMessage(`The ${field} value is outside its allowed range.`, member);
            updateUI();
            return;
        }
        member[field] = value;
    }
    if (field === 'hp') {
        member.movesPerTurn = movementAllowance(member);
        member.movesRemaining = Math.min(member.movesRemaining, member.movesPerTurn);
    }
    logMessage(`${member.name} updates ${field} on the character sheet.`, member);
    updateUI();
}

function updateAttributePoints(input, direction) {
    const member = game.party.find(item => item.id === Number(input.dataset.memberId));
    const stat = input.dataset.pointStat;
    if (!member || !stat || (direction !== 1 && direction !== -1)) return;
    const baseValue = stat === 'initiative' ? 0 : 10;
    if (direction === 1 && member.pendingAttributePoints <= 0) {
        logMessage(`${member.name} has no attribution points available to add to ${stat}.`, member);
        return;
    }
    const value = member[stat] + direction;
    if (direction === 1 && !member.allocatedFields.includes(stat)) member.allocatedFields.push(stat);
    if (value < baseValue || value > 99) {
        logMessage(`${stat} must remain between ${baseValue} and 99.`, member);
        updateUI();
        return;
    }
    const oldMaxHp = member.maxHp;
    member[stat] = value;
    member.pendingAttributePoints -= direction;
    updateDerivedStats(member);
    if (stat === 'constitution') {
        member.hp = Math.max(0, Math.min(member.maxHp, member.hp + member.maxHp - oldMaxHp));
    }
    logMessage(`${member.name} ${direction === 1 ? 'adds a point to' : 'removes a point from'} ${stat}.`, member);
    updateUI();
}

function setStartingPoints(input) {
    if (game.hasStarted) return;
    if (input.value === '') {
        game.startingPointsPerPlayer = null;
        for (const member of game.party) {
            member.pendingAttributePoints = 0;
            member.initiative = 0;
            member.dexterity = 10;
            member.intelligence = 10;
            member.strength = 10;
            member.constitution = 10;
            member.wisdom = 10;
            updateDerivedStats(member);
            member.hp = Math.min(member.hp, member.maxHp);
        }
        updateUI();
        return;
    }
    const points = Number(input.value);
    if (!Number.isInteger(points) || points < 0 || points > 544) {
        input.value = game.startingPointsPerPlayer ?? '';
        logMessage('GM starting points must be a whole number from 0 to 544.', null, 'Party Setup');
        return;
    }
    game.startingPointsPerPlayer = points;
    for (const member of game.party) {
        member.pendingAttributePoints = points;
        member.allocatedFields = [];
        member.initiative = 0;
        member.dexterity = 10;
        member.intelligence = 10;
        member.strength = 10;
        member.constitution = 10;
        member.wisdom = 10;
        updateDerivedStats(member);
        member.hp = Math.min(member.hp, member.maxHp);
    }
    logMessage(`sets ${points} starting attribution point(s) for each player.`, null, 'Game Master');
    updateUI();
}

function refreshPartySetupMap() {
    // placeholder for any party-change map adjustments
}

import { movementAllowance } from './party.js';
import { removePartyMember } from './party.js';

window.addEventListener('DOMContentLoaded', () => {
    initGame();
    renderSavedLog();
    updateUI();
    bindInput(game, logMessage, updateUI, broadcast, networkManager);
    bindGameUI();
    bindNetworkUI();
    window.addEventListener('resize', () => {
        updateMapSizing();
        centerMapOnActiveMember(game);
    });
});
