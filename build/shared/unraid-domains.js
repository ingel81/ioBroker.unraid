"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VM_CONTROL_STATES = exports.DOCKER_CONTROL_STATES = exports.expandSelection = exports.collectNodeIds = exports.domainDefinitionById = exports.domainDefinitions = exports.getDomainAncestors = exports.defaultEnabledDomains = exports.allDomainIds = exports.domainNodeById = exports.domainTree = void 0;
/**
 * Complete domain tree structure for the admin UI.
 * Defines all available domains and their hierarchy.
 */
const domainTreeDefinition = [
    {
        id: 'info',
        label: 'domains.info',
        children: [
            {
                id: 'info.time',
                label: 'domains.info.time',
                defaultSelected: true,
            },
            {
                id: 'info.os',
                label: 'domains.info.os',
            },
        ],
    },
    {
        id: 'server',
        label: 'domains.server',
        children: [
            {
                id: 'server.status',
                label: 'domains.server.status',
                defaultSelected: true,
            },
        ],
    },
    {
        id: 'metrics',
        label: 'domains.metrics',
        children: [
            {
                id: 'metrics.cpu',
                label: 'domains.metrics.cpu',
                defaultSelected: true,
            },
            {
                id: 'metrics.memory',
                label: 'domains.metrics.memory',
                defaultSelected: true,
            },
            {
                id: 'metrics.temperature',
                label: 'domains.metrics.temperature',
                children: [
                    {
                        id: 'metrics.temperature.board',
                        label: 'domains.metrics.temperature.board',
                        defaultSelected: false,
                    },
                ],
            },
        ],
    },
    {
        id: 'array',
        label: 'domains.array',
        children: [
            {
                id: 'array.status',
                label: 'domains.array.status',
                defaultSelected: true,
            },
            {
                id: 'array.disks',
                label: 'domains.array.disks',
                defaultSelected: true,
            },
            {
                id: 'array.parities',
                label: 'domains.array.parities',
                defaultSelected: false,
            },
            {
                id: 'array.caches',
                label: 'domains.array.caches',
                defaultSelected: false,
            },
        ],
    },
    {
        id: 'docker',
        label: 'domains.docker',
        children: [
            {
                id: 'docker.containers',
                label: 'domains.docker.containers',
                defaultSelected: false,
            },
            {
                id: 'docker.updates',
                label: 'domains.docker.updates',
                defaultSelected: true,
            },
        ],
    },
    {
        id: 'shares',
        label: 'domains.shares',
        children: [
            {
                id: 'shares.list',
                label: 'domains.shares.list',
                defaultSelected: false,
            },
        ],
    },
    {
        id: 'vms',
        label: 'domains.vms',
        children: [
            {
                id: 'vms.list',
                label: 'domains.vms.list',
                defaultSelected: false,
            },
        ],
    },
];
/**
 * Build an index map of domain nodes by their IDs.
 *
 * @param nodes - Domain nodes to index
 * @param acc - Accumulator map
 * @returns Map of domain IDs to nodes
 */
const buildNodeIndex = (nodes, acc) => {
    for (const node of nodes) {
        acc.set(node.id, node);
        if (node.children?.length) {
            buildNodeIndex(node.children, acc);
        }
    }
    return acc;
};
/**
 * Collect all domain IDs from a list of nodes recursively.
 *
 * @param nodes - Domain nodes to collect IDs from
 * @param acc - Accumulator array
 * @returns Array of all domain IDs
 */
const collectIds = (nodes, acc = []) => {
    for (const node of nodes) {
        acc.push(node.id);
        if (node.children?.length) {
            collectIds(node.children, acc);
        }
    }
    return acc;
};
/**
 * Collect domain IDs that are marked as default selected.
 *
 * @param nodes - Domain nodes to check
 * @param acc - Accumulator array
 * @returns Array of default selected domain IDs
 */
const collectDefaultIds = (nodes, acc = []) => {
    for (const node of nodes) {
        if (node.defaultSelected) {
            acc.push(node.id);
        }
        if (node.children?.length) {
            collectDefaultIds(node.children, acc);
        }
    }
    return acc;
};
/**
 * Build an index of domain ancestors for quick lookup.
 *
 * @param nodes - Domain nodes to process
 * @param parentId - Parent domain ID for the current level
 * @param acc - Accumulator map
 * @returns Map of domain IDs to their ancestors
 */
const buildAncestorIndex = (nodes, parentId, acc) => {
    for (const node of nodes) {
        const ancestors = parentId ? [...(acc.get(parentId) ?? []), parentId] : [];
        acc.set(node.id, ancestors);
        if (node.children?.length) {
            buildAncestorIndex(node.children, node.id, acc);
        }
    }
    return acc;
};
/**
 * Complete domain tree for UI selection
 */
exports.domainTree = domainTreeDefinition;
/**
 * Map of domain IDs to their corresponding nodes for quick lookup
 */
exports.domainNodeById = buildNodeIndex(domainTreeDefinition, new Map());
/**
 * Immutable array of all available domain IDs
 */
exports.allDomainIds = Object.freeze(collectIds(domainTreeDefinition));
/**
 * Immutable array of domain IDs that are enabled by default
 */
exports.defaultEnabledDomains = Object.freeze(collectDefaultIds(domainTreeDefinition));
const ancestorIndex = buildAncestorIndex(domainTreeDefinition, undefined, new Map());
/**
 * Get all ancestor domain IDs for a given domain.
 *
 * @param id - Domain ID to get ancestors for
 * @returns Array of ancestor domain IDs, ordered from parent to root
 */
const getDomainAncestors = (id) => ancestorIndex.get(id) ?? [];
exports.getDomainAncestors = getDomainAncestors;
const domainDefinitionsList = [
    {
        id: 'info.time',
        selection: [
            {
                root: 'info',
                fields: [{ name: 'time' }],
            },
        ],
        states: [
            {
                id: 'info.time',
                path: ['info', 'time'],
                common: { type: 'string', role: 'value.datetime' },
            },
        ],
    },
    {
        id: 'info.os',
        selection: [
            {
                root: 'info',
                fields: [
                    {
                        name: 'os',
                        selection: [{ name: 'distro' }, { name: 'release' }, { name: 'kernel' }],
                    },
                ],
            },
        ],
        states: [
            {
                id: 'info.os.distro',
                path: ['info', 'os', 'distro'],
                common: { type: 'string', role: 'text' },
            },
            {
                id: 'info.os.release',
                path: ['info', 'os', 'release'],
                common: { type: 'string', role: 'info.version' },
            },
            {
                id: 'info.os.kernel',
                path: ['info', 'os', 'kernel'],
                common: { type: 'string', role: 'info.version' },
            },
        ],
    },
    {
        id: 'server.status',
        selection: [
            {
                root: 'server',
                fields: [
                    { name: 'name' },
                    { name: 'status' },
                    { name: 'lanip' },
                    { name: 'wanip' },
                    { name: 'localurl' },
                    { name: 'remoteurl' },
                ],
            },
        ],
        states: [
            {
                id: 'server.name',
                path: ['server', 'name'],
                common: { type: 'string', role: 'text' },
            },
            {
                id: 'server.status',
                path: ['server', 'status'],
                common: { type: 'string', role: 'indicator.status' },
            },
            {
                id: 'server.lanip',
                path: ['server', 'lanip'],
                common: { type: 'string', role: 'info.ip' },
            },
            {
                id: 'server.wanip',
                path: ['server', 'wanip'],
                common: { type: 'string', role: 'info.ip' },
            },
            {
                id: 'server.localurl',
                path: ['server', 'localurl'],
                common: { type: 'string', role: 'url' },
            },
            {
                id: 'server.remoteurl',
                path: ['server', 'remoteurl'],
                common: { type: 'string', role: 'url' },
            },
        ],
    },
    {
        id: 'metrics.cpu',
        selection: [
            {
                root: 'metrics',
                fields: [
                    {
                        name: 'cpu',
                        selection: [
                            { name: 'percentTotal' },
                            {
                                name: 'cpus',
                                selection: [
                                    { name: 'percentTotal' },
                                    { name: 'percentUser' },
                                    { name: 'percentSystem' },
                                    { name: 'percentNice' },
                                    { name: 'percentIdle' },
                                    { name: 'percentIrq' },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                root: 'info',
                fields: [
                    {
                        name: 'cpu',
                        selection: [
                            {
                                name: 'packages',
                                selection: [{ name: 'totalPower' }, { name: 'power' }, { name: 'temp' }],
                            },
                        ],
                    },
                ],
            },
        ],
        states: [
            {
                id: 'metrics.cpu.percentTotal',
                path: ['metrics', 'cpu', 'percentTotal'],
                common: { type: 'number', role: 'value.percent', unit: '%' },
                transform: numberOrNull,
            },
            // Note: CPU core states are created dynamically in main.ts
        ],
    },
    {
        id: 'metrics.memory',
        selection: [
            {
                root: 'metrics',
                fields: [
                    {
                        name: 'memory',
                        selection: [
                            { name: 'percentTotal' },
                            { name: 'total' },
                            { name: 'used' },
                            { name: 'free' },
                            { name: 'available' },
                            { name: 'active' },
                            { name: 'buffcache' },
                            { name: 'swapTotal' },
                            { name: 'swapUsed' },
                            { name: 'swapFree' },
                            { name: 'percentSwapTotal' },
                        ],
                    },
                ],
            },
        ],
        states: [
            {
                id: 'metrics.memory.percentTotal',
                path: ['metrics', 'memory', 'percentTotal'],
                common: { type: 'number', role: 'value.percent', unit: '%' },
                transform: numberOrNull,
            },
            {
                id: 'metrics.memory.totalGb',
                path: ['metrics', 'memory', 'total'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.usedGb',
                path: ['metrics', 'memory', 'used'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.freeGb',
                path: ['metrics', 'memory', 'free'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.availableGb',
                path: ['metrics', 'memory', 'available'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.activeGb',
                path: ['metrics', 'memory', 'active'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.buffcacheGb',
                path: ['metrics', 'memory', 'buffcache'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.swap.totalGb',
                path: ['metrics', 'memory', 'swapTotal'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.swap.usedGb',
                path: ['metrics', 'memory', 'swapUsed'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.swap.freeGb',
                path: ['metrics', 'memory', 'swapFree'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: bytesToGigabytes,
            },
            {
                id: 'metrics.memory.swap.percentTotal',
                path: ['metrics', 'memory', 'percentSwapTotal'],
                common: { type: 'number', role: 'value.percent', unit: '%' },
                transform: numberOrNull,
            },
        ],
    },
    {
        id: 'array.status',
        selection: [
            {
                root: 'array',
                fields: [
                    { name: 'state' },
                    {
                        name: 'capacity',
                        selection: [
                            {
                                name: 'kilobytes',
                                selection: [{ name: 'total' }, { name: 'used' }, { name: 'free' }],
                            },
                        ],
                    },
                ],
            },
        ],
        states: [
            {
                id: 'array.state',
                path: ['array', 'state'],
                common: { type: 'string', role: 'indicator.status' },
            },
            {
                id: 'array.capacity.totalGb',
                path: ['array', 'capacity', 'kilobytes', 'total'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: kilobytesToGigabytes,
            },
            {
                id: 'array.capacity.usedGb',
                path: ['array', 'capacity', 'kilobytes', 'used'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: kilobytesToGigabytes,
            },
            {
                id: 'array.capacity.freeGb',
                path: ['array', 'capacity', 'kilobytes', 'free'],
                common: { type: 'number', role: 'value', unit: 'GB' },
                transform: kilobytesToGigabytes,
            },
            {
                id: 'array.capacity.percentUsed',
                path: ['array', 'capacity'],
                common: { type: 'number', role: 'value.percent', unit: '%' },
                transform: (value) => {
                    if (!value || typeof value !== 'object') {
                        return null;
                    }
                    const capacity = value;
                    const kilobytes = capacity.kilobytes;
                    const total = numberOrNull(kilobytes?.total);
                    const used = numberOrNull(kilobytes?.used);
                    if (total && used && total > 0) {
                        return Math.round((used / total) * 10000) / 100;
                    }
                    return null;
                },
            },
        ],
    },
    {
        id: 'array.disks',
        selection: [
            {
                root: 'array',
                fields: [
                    {
                        name: 'disks',
                        selection: [
                            { name: 'name' },
                            { name: 'device' },
                            { name: 'status' },
                            { name: 'temp' },
                            { name: 'type' },
                            { name: 'size' },
                            { name: 'fsType' },
                            { name: 'fsSize' },
                            { name: 'fsUsed' },
                            { name: 'fsFree' },
                            { name: 'isSpinning' },
                            { name: 'numReads' },
                            { name: 'numWrites' },
                            { name: 'numErrors' },
                            { name: 'warning' },
                            { name: 'critical' },
                            { name: 'idx' },
                            { name: 'rotational' },
                            { name: 'transport' },
                        ],
                    },
                ],
            },
        ],
        states: [
        // Note: Disk states are created dynamically in main.ts
        ],
    },
    {
        id: 'array.parities',
        selection: [
            {
                root: 'array',
                fields: [
                    {
                        name: 'parities',
                        selection: [
                            { name: 'name' },
                            { name: 'device' },
                            { name: 'status' },
                            { name: 'temp' },
                            { name: 'type' },
                            { name: 'size' },
                            { name: 'fsType' },
                            { name: 'fsSize' },
                            { name: 'fsUsed' },
                            { name: 'fsFree' },
                            { name: 'isSpinning' },
                            { name: 'numReads' },
                            { name: 'numWrites' },
                            { name: 'numErrors' },
                            { name: 'warning' },
                            { name: 'critical' },
                            { name: 'idx' },
                            { name: 'rotational' },
                            { name: 'transport' },
                        ],
                    },
                ],
            },
        ],
        states: [
        // Note: Parity states are created dynamically in main.ts
        ],
    },
    {
        id: 'array.caches',
        selection: [
            {
                root: 'array',
                fields: [
                    {
                        name: 'caches',
                        selection: [
                            { name: 'name' },
                            { name: 'device' },
                            { name: 'status' },
                            { name: 'temp' },
                            { name: 'type' },
                            { name: 'size' },
                            { name: 'fsType' },
                            { name: 'fsSize' },
                            { name: 'fsUsed' },
                            { name: 'fsFree' },
                            { name: 'isSpinning' },
                            { name: 'numReads' },
                            { name: 'numWrites' },
                            { name: 'numErrors' },
                            { name: 'warning' },
                            { name: 'critical' },
                            { name: 'idx' },
                            { name: 'rotational' },
                            { name: 'transport' },
                        ],
                    },
                ],
            },
        ],
        states: [
        // Note: Cache states are created dynamically in main.ts
        ],
    },
    {
        id: 'docker.containers',
        selection: [
            {
                root: 'docker',
                fields: [
                    {
                        name: 'containers',
                        selection: [
                            { name: 'id' },
                            { name: 'names' },
                            { name: 'image' },
                            { name: 'state' },
                            { name: 'status' },
                            { name: 'autoStart' },
                            { name: 'sizeRootFs' },
                            { name: 'isUpdateAvailable', requiresCapability: 'dockerUpdateFlag' },
                        ],
                    },
                    {
                        name: 'containerUpdateStatuses',
                        requiresCapability: 'dockerContainerUpdateStatuses',
                        selection: [{ name: 'name' }, { name: 'updateStatus' }],
                    },
                ],
            },
        ],
        states: [
        // Note: Container states are created dynamically in main.ts
        ],
    },
    {
        id: 'docker.updates',
        selection: [
            {
                root: 'docker',
                fields: [
                    {
                        name: 'containers',
                        requiresCapability: 'dockerUpdateFlag',
                        selection: [{ name: 'id' }, { name: 'isUpdateAvailable' }],
                    },
                    {
                        name: 'containerUpdateStatuses',
                        requiresCapability: 'dockerContainerUpdateStatuses',
                        selection: [{ name: 'name' }, { name: 'updateStatus' }],
                    },
                ],
            },
        ],
        states: [
        // Note: Aggregated states are created dynamically in main.ts
        ],
    },
    {
        id: 'metrics.temperature.board',
        selection: [
            {
                root: 'metrics',
                requiresCapability: 'temperatureMetrics',
                fields: [
                    {
                        name: 'temperature',
                        selection: [
                            {
                                name: 'sensors',
                                selection: [
                                    { name: 'id' },
                                    { name: 'name' },
                                    { name: 'type' },
                                    {
                                        name: 'current',
                                        selection: [{ name: 'value' }, { name: 'status' }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
        states: [
        // Note: Sensor states are created dynamically in main.ts
        ],
    },
    {
        id: 'shares.list',
        selection: [
            {
                root: 'shares',
                fields: [
                    { name: 'id' },
                    { name: 'name' },
                    { name: 'free' },
                    { name: 'used' },
                    { name: 'size' },
                    { name: 'include' },
                    { name: 'exclude' },
                    { name: 'cache' },
                    { name: 'nameOrig' },
                    { name: 'comment' },
                    { name: 'allocator' },
                    { name: 'splitLevel' },
                    { name: 'floor' },
                    { name: 'cow' },
                    { name: 'color' },
                    { name: 'luksStatus' },
                ],
            },
        ],
        states: [
        // Note: Share states are created dynamically in main.ts
        ],
    },
    {
        id: 'vms.list',
        selection: [
            {
                root: 'vms',
                fields: [
                    {
                        name: 'domains',
                        selection: [{ name: 'id' }, { name: 'name' }, { name: 'state' }, { name: 'uuid' }],
                    },
                ],
            },
        ],
        states: [
        // Note: VM states are created dynamically in main.ts
        ],
    },
];
function numberOrNull(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'bigint') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }
    return null;
}
/**
 * Convert bytes to gigabytes.
 *
 * @param value - Value in bytes
 * @returns Value in gigabytes or null if invalid
 */
function bytesToGigabytes(value) {
    const numeric = numberOrNull(value);
    if (numeric === null) {
        return null;
    }
    const gigabytes = numeric / (1024 * 1024 * 1024);
    return Number.isFinite(gigabytes) ? gigabytes : null;
}
function kilobytesToGigabytes(value) {
    const numeric = numberOrNull(value);
    if (numeric === null) {
        return null;
    }
    const gigabytes = numeric / (1024 * 1024);
    return Number.isFinite(gigabytes) ? Math.round(gigabytes * 100) / 100 : null;
}
/**
 * List of all domain definitions with their GraphQL selections and state mappings
 */
exports.domainDefinitions = domainDefinitionsList;
/**
 * Map of domain IDs to their definitions for quick lookup
 */
exports.domainDefinitionById = new Map(domainDefinitionsList.map(definition => [definition.id, definition]));
/**
 * Recursively collect all domain IDs from a node and its children.
 *
 * @param node - Domain node to collect IDs from
 * @returns Array of all domain IDs in the node tree
 */
const collectNodeIds = (node) => {
    const ids = [node.id];
    if (node.children?.length) {
        for (const child of node.children) {
            ids.push(...(0, exports.collectNodeIds)(child));
        }
    }
    return ids;
};
exports.collectNodeIds = collectNodeIds;
/**
 * Filter a raw domain selection to the set of leaves that have a
 * `DomainDefinition` (i.e. can actually be polled / written to the tree).
 *
 * Historically this function recursively descended into the children of
 * parent nodes. That turned out to be an opt-out trap: when a newer adapter
 * version added a fresh child domain (e.g. `docker.updates` or
 * `metrics.temperature.board`), any existing user whose saved config still
 * contained the parent id (`docker`, `metrics`) silently got the new child
 * enabled without ever clicking it. That contradicts the opt-in expectation
 * for new features.
 *
 * The new contract: pass through exactly what the admin UI persisted; drop
 * parent ids that have no definition; do NOT auto-expand into children. The
 * admin UI still writes all affected leaves on parent toggles, so existing
 * leaf-based selections continue to work unchanged.
 *
 * @param selection - Raw domain ids from the configuration
 * @returns Set of selectable domain ids (those with a DomainDefinition)
 */
const expandSelection = (selection) => {
    const result = new Set();
    for (const id of selection) {
        if (exports.domainDefinitionById.has(id)) {
            result.add(id);
        }
    }
    return result;
};
exports.expandSelection = expandSelection;
/**
 * Docker container control state mappings
 */
exports.DOCKER_CONTROL_STATES = [
    {
        id: 'commands.start',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.start',
            read: true,
            write: true,
            def: false,
            name: 'Start Container',
        },
    },
    {
        id: 'commands.stop',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.stop',
            read: true,
            write: true,
            def: false,
            name: 'Stop Container',
        },
    },
    {
        id: 'commands.pause',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.pause',
            read: true,
            write: true,
            def: false,
            name: 'Pause Container',
        },
    },
    {
        id: 'commands.resume',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.resume',
            read: true,
            write: true,
            def: false,
            name: 'Resume Container',
        },
    },
    {
        id: 'commands.update',
        path: [],
        common: {
            type: 'boolean',
            role: 'button',
            read: true,
            write: true,
            def: false,
            name: 'Update Container',
        },
    },
];
/**
 * Virtual machine control state mappings
 */
exports.VM_CONTROL_STATES = [
    {
        id: 'commands.start',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.start',
            read: true,
            write: true,
            def: false,
            name: 'Start VM',
        },
    },
    {
        id: 'commands.stop',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.stop',
            read: true,
            write: true,
            def: false,
            name: 'Stop VM (Graceful)',
        },
    },
    {
        id: 'commands.forceStop',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.stop',
            read: true,
            write: true,
            def: false,
            name: 'Force Stop VM',
        },
    },
    {
        id: 'commands.pause',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.pause',
            read: true,
            write: true,
            def: false,
            name: 'Pause VM',
        },
    },
    {
        id: 'commands.resume',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.resume',
            read: true,
            write: true,
            def: false,
            name: 'Resume VM',
        },
    },
    {
        id: 'commands.reboot',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.restart',
            read: true,
            write: true,
            def: false,
            name: 'Reboot VM',
        },
    },
    {
        id: 'commands.reset',
        path: [],
        common: {
            type: 'boolean',
            role: 'button.restart',
            read: true,
            write: true,
            def: false,
            name: 'Reset VM (Force)',
        },
    },
];
//# sourceMappingURL=unraid-domains.js.map