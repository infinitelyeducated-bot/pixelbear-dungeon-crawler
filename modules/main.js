import { createGame, createPartyMember, activeMember, persistSnapshot, loadStoredSnapshot, saveSnapshot } from './state.js';
import { generateMap, storeActiveFloor, loadMemberFloor, setPartyFormation, isWalkable } from './map.js';
import { applyCharacterClass, updateDerivedStats, setMovementAllowance, getDifficultySettings, adjacentDeadPartyMembers } from './party.js';
import { createLogger } from './log.js';
import { LayoutManager } from './layout.js';
import { NetworkManager } from './network.js';
import { renderMap, renderLegend, updateActionButtons, renderCharacterSheets, updateMapSizing, centerMapOnActiveMember, renderMinimap, renderTurnOrder, renderFloatingTexts, updateFloatingTexts, renderTopPartyRow } from './ui.js';
import { bindInput } from './input.js';
import { handleRemoteAction, sendLocalAction, confirmLocalAction, rejectLocalAction } from './network-actions.js';
import { nearestAttackTarget } from './combat.js';
import { MAX_PARTY_SIZE, CLASSES, DIFFICULTIES, ITEMS } from './config.js';

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
    setPartyFormation(game, 'cluster');
    game.difficulty = 'normal';
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
    renderMinimap(game, document.getElementById('minimap'));
    renderLegend(game, document.getElementById('player-legend-markers'));
    renderTurnOrder(game, document.getElementById('turn-order-bar'));
    renderTopPartyRow(game, document.getElementById('top-party-row'));
    renderFloatingTexts(game, document.getElementById('floating-text-layer'));
    const biome = game.biome;
    const levelTitle = document.getElementById('level-title');
    levelTitle.textContent = `${biome ? biome.name + ' — ' : ''}DUNGEON LEVEL ${activeMember(game)?.dungeonLevel || 1}`;
    updateActionButtons(game);
    updateMobileButtons(game);
    renderInventoryPanel(game);
    renderCharacterSheets(game, document.getElementById('character-sheet-list'));
    layoutManager.refresh();
    updateMapSizing();
    centerMapOnActiveMember(game);
}

function renderInventoryPanel(game) {
    const panel = document.getElementById('inventory-panel');
    if (!panel) return;
    panel.replaceChildren();
    const member = activeMember(game);
    if (!member || !Object.keys(member.inventory || {}).length) {
        panel.textContent = 'No items.';
        return;
    }
    for (const [key, count] of Object.entries(member.inventory)) {
        const item = ITEMS[key];
        if (!item) continue;
        const btn = document.createElement('button');
        btn.className = 'inventory-item';
        btn.textContent = `${item.icon} ${item.name} x${count}`;
        btn.title = item.description;
        btn.disabled = member.hp <= 0 || game.gameOver;
        btn.addEventListener('click', () => {
            import('./actions.js').then(m => {
                m.useInventoryItem(game, key, logMessage, updateUI, broadcast);
            });
        });
        panel.appendChild(btn);
    }
}

function updateMobileButtons(game) {
    const member = activeMember(game);
    const canAct = Boolean(member && member.hp > 0 && !game.gameOver);
    const directions = {
        'mobile-up': 'up', 'mobile-down': 'down', 'mobile-left': 'left', 'mobile-right': 'right'
    };
    for (const [id, dir] of Object.entries(directions)) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !(canAct && canMove(game, member, dir));
    }
    const attackBtn = document.getElementById('mobile-action');
    if (attackBtn) attackBtn.disabled = !(canAct && Boolean(nearestAttackTarget(game, member)));
    const restBtn = document.getElementById('mobile-rest');
    if (restBtn) restBtn.disabled = !(canAct && member.hp < member.maxHp);
    const guardBtn = document.getElementById('mobile-guard');
    if (guardBtn) {
        const canRevive = canAct && member.classKey === 'cleric' &&
            member.movesRemaining >= 3 && adjacentDeadPartyMembers(game, member).length > 0;
        guardBtn.disabled = !(canAct && !member.guardActive &&
            (canRevive || (member.hp === member.maxHp && member.movesRemaining >= 2)));
    }
    const endBtn = document.getElementById('mobile-end');
    if (endBtn) endBtn.disabled = !canAct;
}

function canMove(game, member, direction) {
    if (!member || member.hp <= 0 || member.movesRemaining <= 0 || game.gameOver) return false;
    const offsets = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
    const offset = offsets[direction];
    return isWalkable(game, member.position.x + offset.x, member.position.y + offset.y);
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
        const rightStatus = document.getElementById('network-status-right');
        if (rightStatus) rightStatus.textContent = event.detail;
    });
    networkManager.addEventListener('peerConnected', event => {
        const { peerId, reconnect } = event.detail;
        logMessage(`Peer ${peerId} connected${reconnect ? ' (reconnect)' : ''}.`, null, 'Network');
        if (networkManager.isHost) {
            const assigned = assignPeerToMember(peerId, reconnect);
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
        } else if (data.type === 'actionConfirmed') {
            confirmLocalAction(data.actionId);
            game = data.game;
            updateUI();
        } else if (data.type === 'actionRejected') {
            rejectLocalAction(data.actionId);
            logMessage(`Action rejected: ${data.reason}`, activeMember(game));
        } else if (data.type === 'chat') {
            appendChatMessage(data);
        }
    });
    networkManager.addEventListener('turnTick', event => {
        const { timeLeft, duration } = event.detail;
        const timerDisplay = document.getElementById('turn-timer');
        if (timerDisplay) timerDisplay.textContent = `${timeLeft}s / ${duration}s`;
    });
    networkManager.addEventListener('turnTimeout', () => {
        logMessage('Turn timer expired.', activeMember(game));
        if (!networkManager.isHost) {
            sendLocalAction(networkManager, 'endTurn', {});
        } else {
            import('./actions.js').then(m => m.finishTurn(game, logMessage, updateUI, broadcast));
        }
    });
}

function appendChatMessage(message) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;
    const entry = document.createElement('div');
    entry.className = 'chat-entry';
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    entry.innerHTML = `<span class="chat-time">[${time}]</span> <span class="chat-sender">${escapeHtml(message.sender)}</span>: ${escapeHtml(message.text)}`;
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function assignPeerToMember(peerId, reconnect = false) {
    const used = new Set([networkManager.localMemberId]);
    for (const conn of networkManager.connections.values()) {
        if (conn.assignedMemberId) used.add(conn.assignedMemberId);
    }
    let chosen = null;
    if (reconnect) {
        const previous = networkManager.getRestoredAssignment(peerId);
        const previousMember = previous ? game.party.find(m => m.id === previous && m.hp > 0) : null;
        if (previousMember && !used.has(previous)) {
            chosen = previousMember;
            logMessage(`${chosen.name} reassigned to reconnected peer ${peerId}.`, null, 'Network');
        }
    }
    if (!chosen) {
        chosen = game.party.find(m => m.hp > 0 && !used.has(m.id));
    }
    if (chosen) {
        networkManager.assignMember(peerId, chosen.id);
        if (!reconnect) logMessage(`${chosen.name} is now controlled by peer ${peerId}.`, null, 'Network');
        return chosen.id;
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
        const hostAsGm = document.getElementById('host-as-gm')?.checked ?? false;
        networkManager = new NetworkManager();
        setupNetworkHandlers();
        try {
            const id = await networkManager.startHost(url, { hostAsGm });
            document.getElementById('host-id-display').textContent = id;
            document.getElementById('network-mode').textContent = hostAsGm ? 'Hosting as GM' : 'Hosting';
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

    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    chatForm?.addEventListener('submit', event => {
        event.preventDefault();
        if (!networkManager?.mode || !chatInput.value.trim()) return;
        const msg = networkManager.sendChat(chatInput.value.trim());
        appendChatMessage(msg);
        chatInput.value = '';
    });

    document.getElementById('turn-timer-toggle')?.addEventListener('change', event => {
        const seconds = Number(document.getElementById('turn-timer-seconds')?.value || 60);
        if (event.target.checked) {
            networkManager?.startTurnTimer(seconds);
        } else {
            networkManager?.stopTurnTimer();
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
            const active = activeMember(game);
            if (active) removePartyMember(game, active.id, logMessage);
            refreshPartySetupMap();
            updateUI();
        }
    });
    document.getElementById('gm-starting-points')?.addEventListener('change', event => {
        setStartingPoints(event.target);
    });
    document.getElementById('difficulty-select')?.addEventListener('change', event => {
        import('./actions.js').then(m => m.setGameDifficulty(game, event.target.value, logMessage));
        updateUI();
    });
    document.getElementById('formation-select')?.addEventListener('change', event => {
        import('./actions.js').then(m => m.setFormation(game, event.target.value, logMessage));
        updateUI();
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
    document.getElementById('descend-button')?.addEventListener('click', () => {
        const member = activeMember(game);
        if (member) {
            import('./actions.js').then(m => {
                m.descendFloor(game, member, logMessage);
                updateUI();
            });
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

function startFloatingTextLoop() {
    let last = performance.now();
    function frame(now) {
        const delta = (now - last) / 1000;
        last = now;
        updateFloatingTexts(delta);
        renderFloatingTexts(game, document.getElementById('floating-text-layer'));
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function bindAudioControls() {
    const muteToggle = document.getElementById('mute-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    if (!muteToggle || !volumeSlider) return;

    const stored = localStorage.getItem('pdc-audio');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            muteToggle.checked = parsed.muted ?? false;
            volumeSlider.value = parsed.volume ?? 0.5;
        } catch { /* ignore */ }
    }

    const save = () => localStorage.setItem('pdc-audio', JSON.stringify({
        muted: muteToggle.checked,
        volume: Number(volumeSlider.value)
    }));

    muteToggle.addEventListener('change', () => { save(); updateAudioState(); });
    volumeSlider.addEventListener('input', () => {
        volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
        save();
        updateAudioState();
    });
    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
    updateAudioState();
}

function updateAudioState() {
    const muted = document.getElementById('mute-toggle')?.checked ?? false;
    const volume = Number(document.getElementById('volume-slider')?.value ?? 0.5);
    window.__pdcAudio = { muted, volume };
}

function showErrorBoundary(error) {
    console.error(error);
    const boundary = document.getElementById('error-boundary');
    const message = document.getElementById('error-message');
    if (boundary) boundary.style.display = 'flex';
    if (message) message.textContent = error?.message || 'An unexpected error occurred.';
}

function bindErrorBoundary() {
    document.getElementById('reset-from-error')?.addEventListener('click', () => {
        localStorage.removeItem(SAVE_STORAGE_KEY);
        location.reload();
    });
    window.addEventListener('error', event => showErrorBoundary(event.error));
    window.addEventListener('unhandledrejection', event => showErrorBoundary(event.reason));
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        initGame();
        renderSavedLog();
        updateUI();
        bindInput(game, logMessage, updateUI, broadcast, networkManager);
        bindGameUI();
        bindNetworkUI();
        bindAudioControls();
        bindErrorBoundary();
        startFloatingTextLoop();
        window.addEventListener('resize', () => {
            updateMapSizing();
            centerMapOnActiveMember(game);
        });
    } catch (error) {
        showErrorBoundary(error);
    }
});
