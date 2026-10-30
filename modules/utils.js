export function positionKey(x, y) {
    return `${x},${y}`;
}

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function isWalkable(map, x, y) {
    return (
        y >= 0 && y < map.length &&
        x >= 0 && x < map[0].length &&
        map[y][x] !== '#'
    );
}

export function pathDistanceWithin(map, start, target, maxDistance) {
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
            if (!isWalkable(map, x, y) || visited.has(key)) continue;
            visited.add(key);
            queue.push({ x, y, distance: current.distance + 1 });
        }
    }
    return Infinity;
}

export function generateId(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
}
