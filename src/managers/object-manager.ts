import type { AdapterInterface } from '../types/adapter-types';
import type { DomainDefinition, DomainId } from '../shared/unraid-domains';
import { domainDefinitionById } from '../shared/unraid-domains';
import type { StateManager } from './state-manager';

interface TrackedObject {
    id: string;
    type: 'channel' | 'state';
    lastSeen: number;
    isStatic: boolean;
    resourceType?: 'cpu' | 'cpuPackage' | 'disk' | 'docker' | 'share' | 'vm' | 'temperature';
    resourceId?: string;
}

/**
 * Manages ioBroker object lifecycle - creation, tracking, and cleanup.
 * Ensures the object structure stays in sync with the Unraid server state.
 */
export class ObjectManager {
    private trackedObjects = new Map<string, TrackedObject>();
    private currentPollTimestamp = 0;
    private staticObjectIds = new Set<string>();

    /**
     * Create a new ObjectManager
     *
     * @param adapter - Adapter interface
     * @param _stateManager - State manager instance (unused, kept for compatibility)
     */
    constructor(
        private readonly adapter: AdapterInterface,
        private readonly _stateManager: StateManager,
    ) {}

    /**
     * Initialize object tracking with static definitions
     *
     * @param definitions - Domain definitions to initialize with
     */
    async initialize(definitions: readonly DomainDefinition[]): Promise<void> {
        this.staticObjectIds = this.collectStaticObjectIds(definitions);
        this.currentPollTimestamp = Date.now();

        // Track all existing objects
        await this.syncExistingObjects();

        // Fix channel names for existing objects
        await this.fixExistingChannelNames();
    }

    /**
     * Start a new polling cycle
     */
    beginPollCycle(): void {
        this.currentPollTimestamp = Date.now();
    }

    /**
     * Mark an object as seen in current poll cycle
     *
     * @param id - The object ID
     * @param type - The object type (channel or state)
     * @param resourceType - The resource type (optional)
     * @param resourceId - The resource ID (optional)
     */
    markObjectSeen(id: string, type: 'channel' | 'state', resourceType?: string, resourceId?: string): void {
        const existing = this.trackedObjects.get(id);
        if (existing) {
            existing.lastSeen = this.currentPollTimestamp;
        } else {
            this.trackedObjects.set(id, {
                id,
                type,
                lastSeen: this.currentPollTimestamp,
                isStatic: this.staticObjectIds.has(id),
                resourceType: resourceType as any,
                resourceId,
            });
        }
    }

    /**
     * Handle dynamic resources found in current poll
     *
     * @param resourceType - The type of resource being handled
     * @param currentResources - Map of current resources found in poll
     */
    async handleDynamicResources(
        resourceType: 'cpu' | 'cpuPackage' | 'disk' | 'docker' | 'share' | 'vm' | 'temperature',
        currentResources: Map<string, any>,
    ): Promise<void> {
        const resourcePrefix = this.getResourcePrefix(resourceType);

        // Track which resource IDs we've seen
        const seenResourceIds = new Set<string>();

        for (const [resourceId] of currentResources) {
            seenResourceIds.add(resourceId);
        }

        // Find resources that no longer exist
        const toRemove: string[] = [];
        for (const [, obj] of this.trackedObjects) {
            if (obj.resourceType === resourceType && obj.resourceId && !seenResourceIds.has(obj.resourceId)) {
                // This resource no longer exists
                toRemove.push(obj.resourceId);
            }
        }

        // Remove objects for resources that no longer exist
        for (const resourceId of toRemove) {
            const objectPrefix = `${resourcePrefix}.${resourceId}`;
            this.adapter.log.info(`Resource ${resourceType}/${resourceId} no longer exists, removing objects`);

            try {
                await this.adapter.delObjectAsync(objectPrefix, { recursive: true });

                // Remove from tracking
                const toDelete: string[] = [];
                for (const [id, obj] of this.trackedObjects) {
                    if (obj.resourceType === resourceType && obj.resourceId === resourceId) {
                        toDelete.push(id);
                    }
                }
                for (const id of toDelete) {
                    this.trackedObjects.delete(id);
                }
            } catch (error) {
                this.adapter.log.warn(`Failed to remove objects for ${objectPrefix}: ${this.describeError(error)}`);
            }
        }
    }

    /**
     * Map selected domain ids to the state-path prefixes under which the
     * corresponding dynamic handlers place their states. A single domain can
     * cover multiple prefixes (e.g. `metrics.cpu` drives both
     * `metrics.cpu.cores.*` and `metrics.cpu.packages.*`). For domains that
     * only produce static states, no entry is needed — those are covered by
     * the explicit `states[].id` list in the DomainDefinition.
     */
    private static readonly DOMAIN_DYNAMIC_PREFIXES: Partial<Record<DomainId, readonly string[]>> = {
        'metrics.cpu': ['metrics.cpu.cores', 'metrics.cpu.packages'],
        'array.disks': ['array.disks'],
        'array.parities': ['array.parities'],
        'array.caches': ['array.caches'],
        'docker.containers': ['docker.containers'],
        'docker.updates': ['docker.updates'],
        'shares.list': ['shares'],
        'vms.list': ['vms'],
        'metrics.temperature.board': ['metrics.temperature.board'],
    };

    /**
     * Clean up all objects not in the selected domains.
     *
     * Builds the allowed keep-list from two sources:
     *   1. `DomainDefinition.states[].id` — explicit static state ids for the
     *      selected domains (e.g. `server.name`, `array.state`,
     *      `array.capacity.totalGb`). Parent channels of those ids are kept too.
     *   2. `DOMAIN_DYNAMIC_PREFIXES` — state-path prefixes under which dynamic
     *      handlers create states (e.g. `metrics.cpu.cores` for any
     *      `metrics.cpu.cores.<n>.*` descendant).
     *
     * Anything not matching either source is removed.
     *
     * @param selectedDomains - Set of selected domain IDs to keep
     */
    async cleanupUnselectedDomains(selectedDomains: Set<DomainId>): Promise<void> {
        const objects = await this.adapter.getAdapterObjectsAsync();
        this.adapter.log.debug(
            `Cleanup: selected domains = [${[...selectedDomains].sort().join(', ')}], scanning ${Object.keys(objects).length} objects`,
        );

        const allowedExactIds = new Set<string>();
        const allowedDynamicPrefixes = new Set<string>();

        const addWithAncestors = (id: string): void => {
            const parts = id.split('.');
            for (let i = 1; i <= parts.length; i++) {
                allowedExactIds.add(parts.slice(0, i).join('.'));
            }
        };

        for (const id of selectedDomains) {
            const definition = domainDefinitionById.get(id);
            if (definition) {
                addWithAncestors(definition.id);
                for (const state of definition.states) {
                    addWithAncestors(state.id);
                }
            }
            const dynamicPrefixes = ObjectManager.DOMAIN_DYNAMIC_PREFIXES[id];
            if (dynamicPrefixes) {
                for (const prefix of dynamicPrefixes) {
                    allowedDynamicPrefixes.add(prefix);
                    // Ensure the prefix itself and its ancestor channels are kept
                    addWithAncestors(prefix);
                }
            }
        }

        let removed = 0;
        let kept = 0;
        for (const fullId of Object.keys(objects)) {
            const relativeId = this.getRelativeId(fullId);
            if (!relativeId) {
                continue;
            }

            if (this.isAllowed(relativeId, allowedExactIds, allowedDynamicPrefixes)) {
                kept += 1;
                continue;
            }

            try {
                await this.adapter.delObjectAsync(relativeId, { recursive: true });
                this.trackedObjects.delete(relativeId);
                this.adapter.log.debug(`Cleanup: removed ${relativeId}`);
                removed += 1;
            } catch (error) {
                this.adapter.log.warn(`Failed to remove object ${relativeId}: ${this.describeError(error)}`);
            }
        }
        if (removed > 0) {
            this.adapter.log.info(`Cleanup done: removed ${removed} unselected object(s), kept ${kept}`);
        } else {
            this.adapter.log.debug(`Cleanup done: kept ${kept} object(s), nothing to remove`);
        }
    }

    /**
     * @param relativeId - Relative object id (without namespace prefix)
     * @param allowedExactIds - Set of ids (and their parent channels) that must stay
     * @param allowedDynamicPrefixes - Prefixes under which dynamic descendants are allowed
     * @returns True if the object must be kept
     */
    private isAllowed(relativeId: string, allowedExactIds: Set<string>, allowedDynamicPrefixes: Set<string>): boolean {
        if (allowedExactIds.has(relativeId)) {
            return true;
        }
        for (const prefix of allowedDynamicPrefixes) {
            if (relativeId.startsWith(`${prefix}.`)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get tracking statistics
     */
    getStatistics(): { total: number; static: number; dynamic: number; byType: Record<string, number> } {
        const stats = {
            total: this.trackedObjects.size,
            static: 0,
            dynamic: 0,
            byType: {} as Record<string, number>,
        };

        for (const obj of this.trackedObjects.values()) {
            if (obj.isStatic) {
                stats.static++;
            } else {
                stats.dynamic++;
            }

            if (obj.resourceType) {
                stats.byType[obj.resourceType] = (stats.byType[obj.resourceType] || 0) + 1;
            }
        }

        return stats;
    }

    private async syncExistingObjects(): Promise<void> {
        const objects = await this.adapter.getAdapterObjectsAsync();

        for (const fullId of Object.keys(objects)) {
            const relativeId = this.getRelativeId(fullId);
            if (!relativeId) {
                continue;
            }

            const obj = objects[fullId];
            this.trackedObjects.set(relativeId, {
                id: relativeId,
                type: obj.type as 'channel' | 'state',
                lastSeen: this.currentPollTimestamp,
                isStatic: this.staticObjectIds.has(relativeId),
            });
        }

        this.adapter.log.debug(`Synchronized ${this.trackedObjects.size} existing objects`);
    }

    private async fixExistingChannelNames(): Promise<void> {
        const objects = await this.adapter.getAdapterObjectsAsync();
        let updatedCount = 0;
        let checkedCount = 0;

        for (const fullId of Object.keys(objects)) {
            const relativeId = this.getRelativeId(fullId);
            if (!relativeId) {
                continue;
            }

            const obj = objects[fullId];
            if (obj.type !== 'channel') {
                continue;
            }

            const parts = relativeId.split('.');
            let newName: string | null = null;

            // Determine the correct name for dynamic resource channels
            if (relativeId.startsWith('docker.containers.') && parts.length === 3) {
                // Extract the container name
                newName = parts[2];
                checkedCount++;
            } else if (relativeId.startsWith('shares.') && parts.length === 2) {
                // Extract the share name
                newName = parts[1];
                checkedCount++;
            } else if (relativeId.startsWith('vms.') && parts.length === 2) {
                // Extract the VM name
                newName = parts[1];
                checkedCount++;
            } else if (relativeId.startsWith('array.disks.') && parts.length === 3) {
                newName = `Disk ${parts[2]}`;
                checkedCount++;
            } else if (relativeId.startsWith('array.parities.') && parts.length === 3) {
                newName = `Parity ${parts[2]}`;
                checkedCount++;
            } else if (relativeId.startsWith('array.caches.') && parts.length === 3) {
                newName = `Cache ${parts[2]}`;
                checkedCount++;
            } else if (relativeId.startsWith('metrics.cpu.cores.') && parts.length === 4) {
                newName = `Core ${parts[3]}`;
                checkedCount++;
            } else if (relativeId.startsWith('metrics.cpu.packages.') && parts.length === 4) {
                newName = `Package ${parts[3]}`;
                checkedCount++;
            }

            // Update the channel name if it's different
            if (newName && obj.common?.name !== newName) {
                // Use setObject to update the name
                const updatedObj = {
                    ...obj,
                    common: {
                        ...obj.common,
                        name: newName,
                    },
                };
                await this.adapter.setObjectAsync(relativeId, updatedObj);
                updatedCount++;
                this.adapter.log.debug(`Updated channel name for ${relativeId} to "${newName}"`);
            }
        }

        if (checkedCount > 0) {
            if (updatedCount > 0) {
                this.adapter.log.info(`Fixed ${updatedCount} of ${checkedCount} dynamic channel names`);
            } else {
                this.adapter.log.debug(`All ${checkedCount} dynamic channel names are correct`);
            }
        }
    }

    private getRelativeId(fullId: string): string | null {
        const prefix = `${this.adapter.namespace}.`;
        if (fullId.startsWith(prefix)) {
            return fullId.slice(prefix.length);
        }
        return null;
    }

    private getResourcePrefix(
        resourceType: 'cpu' | 'cpuPackage' | 'disk' | 'docker' | 'share' | 'vm' | 'temperature',
    ): string {
        switch (resourceType) {
            case 'cpu':
                return 'metrics.cpu.cores';
            case 'cpuPackage':
                return 'metrics.cpu.packages';
            case 'disk':
                return 'array.disks';
            case 'docker':
                return 'docker.containers';
            case 'share':
                return 'shares';
            case 'vm':
                return 'vms';
            case 'temperature':
                return 'metrics.temperature.board';
        }
    }

    private collectStaticObjectIds(definitions: readonly DomainDefinition[]): Set<string> {
        const ids = new Set<string>();

        const addPrefixes = (identifier: string): void => {
            const parts = identifier.split('.');
            for (let index = 1; index <= parts.length; index += 1) {
                ids.add(parts.slice(0, index).join('.'));
            }
        };

        for (const definition of definitions) {
            addPrefixes(definition.id);
            for (const state of definition.states) {
                addPrefixes(state.id);
            }
        }

        return ids;
    }

    private describeError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
