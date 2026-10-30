import { positionKey } from './utils.js';
import { isWalkable } from './map.js';

export function pathDistanceWithin(game, start, target, maxDistance) {
    const queue = [{ x: start.x, y: start.y, distance: 0 }];
    const visited = new Set(positionKey(start.x, start.y));
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (current.x === target.x && current.y === target.y) return current.distance;
        if (current.distance >= maxDistance) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = current.x + dx;
            const y = current.y + dy;
            const key = positionKey(x, y);
            if (!isWalkable(game, x, y) || visited.has(key)) continue;
            visited.add(key);
            queue.push({ x, y, distance: current.distance + 1 });
        }
    }
    return Infinity;
}
