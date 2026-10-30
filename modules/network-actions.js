import { activeMember } from './state.js';
import { move, attack, standGuard, rest, finishTurn } from './actions.js';

export function handleRemoteAction(game, networkManager, data, logMessage, updateUI, broadcast) {
    if (!networkManager?.isHost) return false;
    const { peerId, action, args } = data;
    const memberId = networkManager.getAssignedMemberId(peerId);
    const member = game.party.find(m => m.id === memberId);
    const active = activeMember(game);
    if (!member || !active || member.id !== active.id) {
        // Not this peer's turn or member not assigned
        return false;
    }

    switch (action) {
        case 'move':
            move(game, args.direction, logMessage, () => {}, broadcast);
            break;
        case 'attack':
            attack(game, logMessage, () => {}, broadcast);
            break;
        case 'guard':
            standGuard(game, logMessage, () => {}, broadcast);
            break;
        case 'rest':
            rest(game, logMessage, () => {}, broadcast);
            break;
        case 'endTurn':
            finishTurn(game, logMessage, () => {}, broadcast);
            break;
        default:
            return false;
    }
    updateUI();
    return true;
}

export function sendLocalAction(networkManager, action, args = {}) {
    if (!networkManager || !networkManager.mode) return false;
    if (networkManager.isHost) return false; // Host acts directly
    networkManager.broadcast({ type: 'action', action, args });
    return true;
}
