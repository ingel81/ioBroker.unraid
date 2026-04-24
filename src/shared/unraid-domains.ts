import type { CapabilityKey } from './capabilities';

/**
 * Represents a node in the domain selection tree.
 * Used for UI representation and configuration.
 */
export interface DomainNode {
    /** Unique domain identifier */
    id: DomainId;
    /** Translation key for UI label */
    label: string;
    /** Optional description for the domain */
    description?: string;
    /** Whether this domain is selected by default */
    defaultSelected?: boolean;
    /** Child nodes in the domain tree */
    children?: readonly DomainNode[];
}

/**
 * All available domain IDs in the Unraid adapter.
 * Domains represent different data categories from Unraid.
 */
export type DomainId =
    | 'info'
    | 'info.time'
    | 'info.os'
    | 'server'
    | 'server.status'
    | 'metrics'
    | 'metrics.cpu'
    | 'metrics.memory'
    | 'metrics.temperature'
    | 'metrics.temperature.board'
    | 'array'
    | 'array.status'
    | 'array.disks'
    | 'array.parities'
    | 'array.caches'
    | 'docker'
    | 'docker.containers'
    | 'docker.updates'
    | 'shares'
    | 'shares.list'
    | 'vms'
    | 'vms.list';

/**
 * Specification for a GraphQL field selection.
 * Supports nested field selections.
 */
export interface FieldSpec {
    /** Field name in GraphQL schema */
    name: string;
    /** Nested field selections */
    selection?: readonly FieldSpec[];
    /** If set, the field is only included when this capability flag is true */
    requiresCapability?: CapabilityKey;
}

/**
 * Root-level GraphQL query selection.
 * Groups field selections under a root query field.
 */
export interface RootSelection {
    /** Root query field name */
    root: string;
    /** Fields to select from the root */
    fields: readonly FieldSpec[];
    /** If set, the whole root selection is only included when this capability flag is true */
    requiresCapability?: CapabilityKey;
}

/**
 * Supported ioBroker state value types
 */
export type StateValueType = 'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed';

/**
 * Mapping between GraphQL data and ioBroker states.
 * Defines how to extract values and create states.
 */
export interface StateMapping {
    /** ioBroker state ID */
    id: string;
    /** Path to extract value from GraphQL response */
    path: readonly string[];
    /** Common state attributes for ioBroker */
    common: {
        /** Value type for the state */
        type: StateValueType;
        /** Role of the state in ioBroker */
        role: string;
        /** Whether the state is readable */
        read?: boolean;
        /** Whether the state is writable */
        write?: boolean;
        /** Default value for the state */
        def?: boolean | number | string | null;
        /** Optional unit of measurement */
        unit?: string;
        /** Optional name for the state */
        name?: string;
        /** Optional description for the state */
        desc?: string;
    };
    /** Optional transformation function for the value */
    transform?: (value: unknown) => unknown;
}

/**
 * Complete definition of a domain.
 * Contains GraphQL selections and state mappings.
 */
export interface DomainDefinition {
    /** Domain identifier */
    id: DomainId;
    /** GraphQL selections to fetch data */
    selection: readonly RootSelection[];
    /** State mappings for this domain */
    states: readonly StateMapping[];
}

/**
 * Complete domain tree structure for the admin UI.
 * Defines all available domains and their hierarchy.
 */
const domainTreeDefinition: readonly DomainNode[] = [
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
const buildNodeIndex = (nodes: readonly DomainNode[], acc: Map<DomainId, DomainNode>): Map<DomainId, DomainNode> => {
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
const collectIds = (nodes: readonly DomainNode[], acc: DomainId[] = []): DomainId[] => {
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
const collectDefaultIds = (nodes: readonly DomainNode[], acc: DomainId[] = []): DomainId[] => {
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
const buildAncestorIndex = (
    nodes: readonly DomainNode[],
    parentId: DomainId | undefined,
    acc: Map<DomainId, DomainId[]>,
): Map<DomainId, DomainId[]> => {
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
export const domainTree = domainTreeDefinition;
/**
 * Map of domain IDs to their corresponding nodes for quick lookup
 */
export const domainNodeById = buildNodeIndex(domainTreeDefinition, new Map<DomainId, DomainNode>());
/**
 * Immutable array of all available domain IDs
 */
export const allDomainIds = Object.freeze(collectIds(domainTreeDefinition));
/**
 * Immutable array of domain IDs that are enabled by default
 */
export const defaultEnabledDomains = Object.freeze(collectDefaultIds(domainTreeDefinition));

const ancestorIndex = buildAncestorIndex(domainTreeDefinition, undefined, new Map<DomainId, DomainId[]>());

/**
 * Get all ancestor domain IDs for a given domain.
 *
 * @param id - Domain ID to get ancestors for
 * @returns Array of ancestor domain IDs, ordered from parent to root
 */
export const getDomainAncestors = (id: DomainId): readonly DomainId[] => ancestorIndex.get(id) ?? [];

const domainDefinitionsList: readonly DomainDefinition[] = [
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
                transform: (value: unknown): number | null => {
                    if (!value || typeof value !== 'object') {
                        return null;
                    }
                    const capacity = value as Record<string, unknown>;
                    const kilobytes = capacity.kilobytes as Record<string, unknown> | undefined;
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

function numberOrNull(value: unknown): number | null {
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
function bytesToGigabytes(value: unknown): number | null {
    const numeric = numberOrNull(value);
    if (numeric === null) {
        return null;
    }
    const gigabytes = numeric / (1024 * 1024 * 1024);
    return Number.isFinite(gigabytes) ? gigabytes : null;
}

function kilobytesToGigabytes(value: unknown): number | null {
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
export const domainDefinitions = domainDefinitionsList;

/**
 * Map of domain IDs to their definitions for quick lookup
 */
export const domainDefinitionById = new Map<DomainId, DomainDefinition>(
    domainDefinitionsList.map(definition => [definition.id, definition]),
);

/**
 * Recursively collect all domain IDs from a node and its children.
 *
 * @param node - Domain node to collect IDs from
 * @returns Array of all domain IDs in the node tree
 */
export const collectNodeIds = (node: DomainNode): readonly DomainId[] => {
    const ids: DomainId[] = [node.id];
    if (node.children?.length) {
        for (const child of node.children) {
            ids.push(...collectNodeIds(child));
        }
    }
    return ids;
};

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
export const expandSelection = (selection: Iterable<DomainId>): Set<DomainId> => {
    const result = new Set<DomainId>();
    for (const id of selection) {
        if (domainDefinitionById.has(id)) {
            result.add(id);
        }
    }
    return result;
};

/**
 * Docker container control state mappings
 */
export const DOCKER_CONTROL_STATES: StateMapping[] = [
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
export const VM_CONTROL_STATES: StateMapping[] = [
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
