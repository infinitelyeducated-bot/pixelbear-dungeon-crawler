import { MAX_PARTY_SIZE, CLASSES, MAX_CHARACTER_LEVEL, PLAYER_COLORS, PLAYER_MARKERS } from './config.js';
import { activeMember } from './state.js';
import { adjacentDeadPartyMembers, updateDerivedStats, setMovementAllowance, experienceRequired } from './party.js';
import { pathDistanceWithin, positionKey } from './utils.js';
import { nearestAttackTarget } from './combat.js';

export function renderMap(game, mapContent) {
    const fragment = document.createDocumentFragment();
    const active = activeMember(game);
    const membersByPosition = new Map();
    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== active?.dungeonLevel || !partyMember.position) continue;
        const key = positionKey(partyMember.position.x, partyMember.position.y);
        if (!membersByPosition.has(key)) membersByPosition.set(key, []);
        membersByPosition.get(key).push(partyMember);
    }

    for (let y = 0; y < game.mapHeight; y++) {
        const row = document.createElement('div');
        row.className = 'map-row';
        for (let x = 0; x < game.mapWidth; x++) {
            const membersHere = membersByPosition.get(positionKey(x, y)) || [];
            const member = membersHere.find(p => p === active) || membersHere[0];
            const cell = member
                ? (game.map[y][x] === 'S' ? 'S' : member.marker)
                : game.map[y][x];
            const cellElement = document.createElement('span');
            cellElement.className = 'map-cell';
            cellElement.textContent = cell;
            cellElement.dataset.x = String(x);
            cellElement.dataset.y = String(y);
            styleCell(game, cellElement, x, y, cell, member, membersHere, active);
            row.appendChild(cellElement);
        }
        fragment.appendChild(row);
    }
    mapContent.replaceChildren(fragment);
}

function styleCell(game, cellElement, x, y, cell, member, membersHere, active) {
    if (member) {
        cellElement.style.color = member.color;
        cellElement.style.fontWeight = 'bold';
        const stackedNames = membersHere.map(p => p.name).join(', ');
        cellElement.title = `${game.map[y][x] === 'S' ? 'Starting position: ' : ''}${stackedNames}`;
        cellElement.setAttribute('aria-label', cellElement.title);
        if (member === active) cellElement.classList.add('active-player');
    } else if (cell === '#') {
        cellElement.style.color = '#ffffff';
    } else if (cell === 'S') {
        cellElement.style.color = '#00e5ff';
        cellElement.title = 'Starting position';
    } else if (cell === 'M') {
        cellElement.style.color = '#ef5350';
        const monster = game.monsters[positionKey(x, y)];
        if (monster) {
            const distance = active?.position
                ? pathDistanceWithin(game.map, active.position, { x, y }, 3)
                : Infinity;
            cellElement.title = `${monster.name} (${monster.hp}/${monster.maxHp} HP)` + (distance <= 3 ? `, ${distance} squares away` : '');
            if (distance <= 3) {
                cellElement.classList.add('monster-cell');
                const indicator = document.createElement('span');
                indicator.className = 'monster-health-indicator';
                indicator.innerHTML = `<span class="monster-health-label">${distance} sq ${Math.ceil(monster.hp)}/${monster.maxHp}</span>` +
                    `<span class="monster-health-track"><span class="monster-health-fill" style="width:${Math.max(0, monster.hp / monster.maxHp * 100)}%"></span></span>`;
                cellElement.appendChild(indicator);
            }
        }
    } else if (game.treasures[positionKey(x, y)]) {
        const treasure = game.treasures[positionKey(x, y)];
        cellElement.style.color = treasure.type === 'power' ? '#ffeb3b' : '#ffd740';
        cellElement.title = treasure.type === 'power'
            ? 'Power Item (+5 damage, +60 XP)'
            : `${treasure.name}: ${treasure.value} treasure`;
    } else if (cell === '^') {
        cellElement.style.color = '#ff7043';
    } else if (cell === '>') {
        cellElement.style.color = '#69f0ae';
    }
}

export function renderLegend(game, container) {
    container.replaceChildren();
    for (const partyMember of game.party) {
        const marker = document.createElement('span');
        marker.className = 'player-legend-marker';
        marker.textContent = partyMember.marker;
        marker.style.color = partyMember.color;
        marker.title = partyMember.name;
        marker.setAttribute('aria-label', partyMember.name);
        container.appendChild(marker);
    }
}

export function setActionAvailability(id, available, active = false) {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = !available;
    button.classList.toggle('guard-active', active);
    button.setAttribute('aria-pressed', String(active));
}

export function updateActionButtons(game) {
    const member = activeMember(game);
    const canAct = Boolean(member && member.hp > 0 && !game.gameOver);
    for (const direction of ['up', 'left', 'down', 'right']) {
        setActionAvailability(`move-${direction}`, canAct && canMove(game, member, direction));
    }
    setActionAvailability('attack-btn', canAct && Boolean(nearestAttackTarget(game, member)));
    setActionAvailability('rest-btn', canAct && member.hp < member.maxHp);
    const canRevive = canAct && member.classKey === 'cleric' &&
        member.movesRemaining >= 3 && adjacentDeadPartyMembers(game, member).length > 0;
    const canGuard = canAct && !member.guardActive &&
        (canRevive || (member.hp === member.maxHp && member.movesRemaining >= 2));
    setActionAvailability('guard-btn', canGuard, canAct && member.guardActive);
    setActionAvailability('end-turn-btn', canAct);
    document.getElementById('remove-member-btn').disabled = game.party.length <= 1 || game.hasStarted;
    document.getElementById('add-member-btn').disabled = game.party.length >= MAX_PARTY_SIZE || game.hasStarted;
    document.getElementById('gm-starting-points').disabled = game.hasStarted;
}

function canMove(game, member, direction) {
    if (!member || member.hp <= 0 || member.movesRemaining <= 0 || game.gameOver) return false;
    const offsets = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
    const offset = offsets[direction];
    return game.map[member.position.y + offset.y]?.[member.position.x + offset.x] !== '#';
}

export function renderCharacterSheets(game, container) {
    container.replaceChildren();
    game.party.forEach((member, index) => {
        const card = buildCharacterSheet(game, member, index);
        container.appendChild(card);
    });
}

function buildCharacterSheet(game, member, index) {
    const card = document.createElement('article');
    card.className = `character-sheet ${member === activeMember(game) ? 'active' : ''}`;
    card.dataset.memberId = String(member.id);
    card.style.setProperty('--member-color', member.color);
    card.style.borderColor = member === activeMember(game) ? member.color : '#4a4a6a';

    const header = document.createElement('div');
    header.className = 'sheet-heading-row';
    const heading = document.createElement('h3');
    heading.textContent = `${member.marker} ${index + 1}. ${member.name}${member.hp <= 0 ? ' (down)' : ''}${member === activeMember(game) ? ' — ACTIVE' : ''}`;
    heading.style.color = member.color;
    header.appendChild(heading);

    const classPoints = document.createElement('div');
    classPoints.className = 'sheet-class-points';
    const classLabel = document.createElement('label');
    classLabel.textContent = 'Class';
    const classSelect = document.createElement('select');
    classSelect.dataset.memberId = String(member.id);
    classSelect.dataset.field = 'classKey';
    classSelect.disabled = game.hasStarted;
    for (const [classKey, characterClass] of Object.entries(CLASSES)) {
        const option = document.createElement('option');
        option.value = classKey;
        option.textContent = characterClass.name;
        option.selected = member.classKey === classKey;
        classSelect.appendChild(option);
    }
    classLabel.appendChild(classSelect);
    const remainingPoints = document.createElement('span');
    remainingPoints.className = 'remaining-points';
    remainingPoints.textContent = `${member.pendingAttributePoints} pt`;
    remainingPoints.title = 'Unspent attribution points';
    classPoints.append(classLabel, remainingPoints);
    header.appendChild(classPoints);

    const fields = document.createElement('div');
    fields.className = 'sheet-fields';
    const addInput = (label, key, value, options = {}) => {
        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = label;
        const input = document.createElement('input');
        input.type = options.type || 'text';
        input.value = value;
        input.dataset.memberId = String(member.id);
        input.dataset.field = key;
        if (options.type === 'number') {
            input.min = String(options.min);
            input.max = String(options.max);
            input.step = '1';
        }
        input.disabled = Boolean(options.disabled);
        fieldLabel.appendChild(input);
        fields.appendChild(fieldLabel);
    };
    addInput('Name', 'name', member.name);
    addInput('Race', 'race', member.race);
    addInput('HP', 'hp', member.hp, { type: 'number', min: 0, max: member.maxHp });
    addInput('Maximum HP', 'maxHp', member.maxHp, { type: 'number', min: 1, max: 9999, disabled: true });
    addInput('Armor Class', 'armorClass', member.armorClass, { type: 'number', min: 0, max: 99, disabled: true });
    addInput('Attack', 'attack', member.attack, { type: 'number', min: 1, max: 999, disabled: true });
    addInput('Defense', 'defense', member.defense, { type: 'number', min: 1, max: 999, disabled: true });
    addInput('Treasure', 'treasure', member.treasure, { type: 'number', min: 0, max: 999999999, disabled: true });
    addInput('Treasures Found', 'treasureCount', member.treasureCount, { type: 'number', min: 0, max: 999999, disabled: true });
    addInput('Power Items', 'powerItems', member.powerItems, { type: 'number', min: 0, max: 999999, disabled: true });
    addInput('Item Damage Bonus', 'itemDamageBonus', `+${member.powerItems * 5}`, { disabled: true });
    addInput('Charisma', 'charisma', member.charisma, { type: 'number', min: 3, max: 99, disabled: true });
    addInput('Level', 'level', member.level, { type: 'number', min: 1, max: MAX_CHARACTER_LEVEL, disabled: true });
    addInput('Experience', 'xp', `${member.xp}/${experienceRequired(member, game.party.length)}`, { disabled: true });
    addInput('Dungeon Level', 'dungeonLevel', member.dungeonLevel, { type: 'number', min: 1, max: 999, disabled: true });
    addInput('Movement', 'movesRemaining', `${member.movesRemaining}/${member.movesPerTurn}`, { disabled: true });
    addInput('Status', 'status', member.hp > 0 ? 'Alive' : 'Down', { disabled: true });

    const attributes = document.createElement('div');
    attributes.className = 'attribute-allocation';
    for (const [key, label, baseValue] of [
        ['initiative', 'Initiative', 0],
        ['dexterity', 'Dexterity', 10],
        ['intelligence', 'Intelligence', 10],
        ['strength', 'Strength', 10],
        ['constitution', 'Constitution', 10],
        ['wisdom', 'Wisdom', 10]
    ]) {
        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(baseValue);
        input.max = '99';
        input.step = '1';
        input.value = String(member[key]);
        input.dataset.memberId = String(member.id);
        input.dataset.pointStat = key;
        input.readOnly = true;
        input.className = 'attribute-point-control';
        input.setAttribute('aria-label', `${label}: ${member[key]}. Left-click to add one point, right-click to subtract one.`);
        input.title = 'Left-click to add a point; right-click to subtract a point.';
        input.disabled = member.pendingAttributePoints <= 0 && member[key] <= baseValue;
        fieldLabel.appendChild(input);
        attributes.appendChild(fieldLabel);
    }

    const summary = document.createElement('p');
    summary.className = 'sheet-status';
    summary.textContent = `${member.pendingAttributePoints} point(s) available. Left-click a stat to spend one; right-click to reclaim one. Unused points are lost when moving.`;

    card.append(header, fields, attributes, summary);
    return card;
}

export function updateMapSizing() {
    const mapViewport = document.getElementById('dungeon-map');
    const mapContent = document.getElementById('dungeon-map-content');
    if (!mapViewport || !mapContent) return;
    const fontSize = Math.max(6, Math.min(9, mapViewport.clientWidth / 32));
    mapViewport.style.fontSize = `${fontSize}px`;
    mapContent.style.padding = `${mapViewport.clientHeight / 2}px ${mapViewport.clientWidth / 2}px`;
}

export function centerMapOnActiveMember(game) {
    const member = activeMember(game);
    if (!member?.position) return;
    const viewport = document.getElementById('dungeon-map');
    const cell = document.querySelector(
        `#dungeon-map-content .map-cell[data-x="${member.position.x}"][data-y="${member.position.y}"]`
    );
    if (!cell || !viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    viewport.scrollLeft += cellRect.left + cellRect.width / 2 - (viewportRect.left + viewport.clientWidth / 2);
    viewport.scrollTop += cellRect.top + cellRect.height / 2 - (viewportRect.top + viewport.clientHeight / 2);
}
