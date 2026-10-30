import { move, attack, standGuard, rest, finishTurn } from './actions.js';
import { sendLocalAction } from './network-actions.js';
import { activeMember } from './state.js';

export function bindInput(game, logMessage, updateUI, broadcast, networkManager) {
    function localOrSend(action, args, executor) {
        const member = activeMember(game);
        const localPlayer = !networkManager || !networkManager.mode || networkManager.isHost;
        const controlsLocalMember = !networkManager?.localMemberId || member?.id === networkManager.localMemberId;
        if (localPlayer && controlsLocalMember) {
            executor();
            return;
        }
        if (networkManager && !networkManager.isHost && member?.id === networkManager.localMemberId) {
            sendLocalAction(networkManager, action, args);
        }
    }

    document.addEventListener('keydown', event => {
        const menu = document.getElementById('escape-menu');
        if (event.key === 'Escape') {
            event.preventDefault();
            if (menu?.open) menu.close();
            else menu?.showModal();
            return;
        }
        if (menu?.open) return;
        if (game.gameOver) return;
        if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) return;

        switch (event.key.toLowerCase()) {
            case 'w': case 'arrowup':
                event.preventDefault();
                localOrSend('move', { direction: 'up' }, () => move(game, 'up', logMessage, updateUI, broadcast));
                break;
            case 'a': case 'arrowleft':
                event.preventDefault();
                localOrSend('move', { direction: 'left' }, () => move(game, 'left', logMessage, updateUI, broadcast));
                break;
            case 's': case 'arrowdown':
                event.preventDefault();
                localOrSend('move', { direction: 'down' }, () => move(game, 'down', logMessage, updateUI, broadcast));
                break;
            case 'd': case 'arrowright':
                event.preventDefault();
                localOrSend('move', { direction: 'right' }, () => move(game, 'right', logMessage, updateUI, broadcast));
                break;
            case 'f':
                event.preventDefault();
                localOrSend('attack', {}, () => attack(game, logMessage, updateUI, broadcast));
                break;
            case 'r':
                event.preventDefault();
                if (game.activeMember()?.hp < game.activeMember()?.maxHp) {
                    localOrSend('rest', {}, () => rest(game, logMessage, updateUI, broadcast));
                }
                break;
            case 'g':
                event.preventDefault();
                localOrSend('guard', {}, () => standGuard(game, logMessage, updateUI, broadcast));
                break;
            case 'e':
                event.preventDefault();
                localOrSend('endTurn', {}, () => finishTurn(game, logMessage, updateUI, broadcast));
                break;
        }
    });

    document.getElementById('move-up')?.addEventListener('click', () => localOrSend('move', { direction: 'up' }, () => move(game, 'up', logMessage, updateUI, broadcast)));
    document.getElementById('move-left')?.addEventListener('click', () => localOrSend('move', { direction: 'left' }, () => move(game, 'left', logMessage, updateUI, broadcast)));
    document.getElementById('move-down')?.addEventListener('click', () => localOrSend('move', { direction: 'down' }, () => move(game, 'down', logMessage, updateUI, broadcast)));
    document.getElementById('move-right')?.addEventListener('click', () => localOrSend('move', { direction: 'right' }, () => move(game, 'right', logMessage, updateUI, broadcast)));
    document.getElementById('end-turn-btn')?.addEventListener('click', () => localOrSend('endTurn', {}, () => finishTurn(game, logMessage, updateUI, broadcast)));
    document.getElementById('attack-btn')?.addEventListener('click', () => localOrSend('attack', {}, () => attack(game, logMessage, updateUI, broadcast)));
    document.getElementById('rest-btn')?.addEventListener('click', () => localOrSend('rest', {}, () => rest(game, logMessage, updateUI, broadcast)));
    document.getElementById('guard-btn')?.addEventListener('click', () => localOrSend('guard', {}, () => standGuard(game, logMessage, updateUI, broadcast)));
}
