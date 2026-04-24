"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicResourceManager = void 0;
const data_transformers_1 = require("../utils/data-transformers");
const unraid_domains_1 = require("../shared/unraid-domains");
const state_names_json_1 = __importDefault(require("../translations/state-names.json"));
/**
 * Manages dynamic resource detection and state creation
 * for CPU cores, array disks, Docker containers, shares, and VMs
 */
class DynamicResourceManager {
    adapter;
    stateManager;
    // Dynamic CPU core tracking
    cpuCoresDetected = false;
    cpuCoreCount = 0;
    // Dynamic CPU package tracking
    cpuPackagesDetected = false;
    cpuPackageCount = 0;
    // Dynamic array disk tracking
    arrayDisksDetected = false;
    diskCount = 0;
    parityCount = 0;
    cacheCount = 0;
    // Dynamic docker container tracking
    dockerContainersDetected = false;
    containerNames = new Set();
    // Dynamic shares tracking
    sharesDetected = false;
    shareNames = new Set();
    // Dynamic VM tracking
    vmsDetected = false;
    vmUuids = new Set();
    // Dynamic temperature board sensor tracking
    temperatureBoardDetected = false;
    temperatureSensorIds = new Set();
    // Docker updates summary tracking
    dockerUpdatesSummaryCreated = false;
    // Docker isUpdateAvailable field creation tracking per container
    dockerIsUpdateAvailableCreated = new Set();
    // Tracks the Docker container ID per container name so we can refresh
    // control button metadata when the ID changes (e.g. after updateContainer
    // recreates the container with a new hash).
    containerIdByName = new Map();
    objectManager;
    /**
     * Create a new dynamic resource manager
     *
     * @param adapter - Adapter interface for logging and state management
     * @param stateManager - State manager instance for creating/updating states
     */
    constructor(adapter, stateManager) {
        this.adapter = adapter;
        this.stateManager = stateManager;
    }
    /**
     * Set the object manager for tracking dynamic resources
     *
     * @param objectManager - The ObjectManager instance for resource tracking
     */
    setObjectManager(objectManager) {
        this.objectManager = objectManager;
    }
    /**
     * Reset tracking for deselected domains
     *
     * @param selectedDomains - Set of selected domain IDs
     */
    resetTracking(selectedDomains) {
        if (!selectedDomains.has('metrics.cpu')) {
            this.cpuCoresDetected = false;
            this.cpuCoreCount = 0;
            this.cpuPackagesDetected = false;
            this.cpuPackageCount = 0;
        }
        if (!selectedDomains.has('array.disks') &&
            !selectedDomains.has('array.parities') &&
            !selectedDomains.has('array.caches')) {
            this.arrayDisksDetected = false;
            this.diskCount = 0;
            this.parityCount = 0;
            this.cacheCount = 0;
        }
        if (!selectedDomains.has('docker.containers')) {
            this.dockerContainersDetected = false;
            this.containerNames.clear();
            this.containerIdByName.clear();
        }
        if (!selectedDomains.has('shares.list')) {
            this.sharesDetected = false;
            this.shareNames.clear();
        }
        if (!selectedDomains.has('vms.list')) {
            this.vmsDetected = false;
            this.vmUuids.clear();
        }
        if (!selectedDomains.has('metrics.temperature.board')) {
            this.temperatureBoardDetected = false;
            this.temperatureSensorIds.clear();
        }
        if (!selectedDomains.has('docker.updates')) {
            this.dockerUpdatesSummaryCreated = false;
        }
        if (!selectedDomains.has('docker.containers')) {
            this.dockerIsUpdateAvailableCreated.clear();
        }
    }
    /**
     * Handle dynamic CPU core state creation and updates
     *
     * @param data - Unraid data containing CPU metrics
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicCpuCores(data, selectedDomains) {
        if (!selectedDomains.has('metrics.cpu')) {
            return;
        }
        const metrics = data.metrics;
        if (!metrics?.cpu?.cpus) {
            return;
        }
        const cores = metrics.cpu.cpus;
        const coreCount = Array.isArray(cores) ? cores.length : 0;
        // Create CPU core states on first detection or if core count changed
        if (!this.cpuCoresDetected || this.cpuCoreCount !== coreCount) {
            this.cpuCoreCount = coreCount;
            this.cpuCoresDetected = true;
            this.adapter.log.info(`Detected ${coreCount} CPU cores, creating states...`);
            // Create core count state
            await this.stateManager.writeState('metrics.cpu.cores.count', { type: 'number', role: 'value', unit: '' }, coreCount);
            // Create states for each CPU core
            for (let i = 0; i < coreCount; i++) {
                const corePrefix = `metrics.cpu.cores.${i}`;
                await this.stateManager.writeState(`${corePrefix}.percentTotal`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${corePrefix}.percentUser`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${corePrefix}.percentSystem`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${corePrefix}.percentNice`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${corePrefix}.percentIdle`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${corePrefix}.percentIrq`, { type: 'number', role: 'value.percent', unit: '%' }, null);
            }
        }
        // Update CPU core values
        for (let i = 0; i < cores.length; i++) {
            const core = cores[i];
            const corePrefix = `metrics.cpu.cores.${i}`;
            await this.stateManager.updateState(`${corePrefix}.percentTotal`, (0, data_transformers_1.toNumberOrNull)(core.percentTotal));
            await this.stateManager.updateState(`${corePrefix}.percentUser`, (0, data_transformers_1.toNumberOrNull)(core.percentUser));
            await this.stateManager.updateState(`${corePrefix}.percentSystem`, (0, data_transformers_1.toNumberOrNull)(core.percentSystem));
            await this.stateManager.updateState(`${corePrefix}.percentNice`, (0, data_transformers_1.toNumberOrNull)(core.percentNice));
            await this.stateManager.updateState(`${corePrefix}.percentIdle`, (0, data_transformers_1.toNumberOrNull)(core.percentIdle));
            await this.stateManager.updateState(`${corePrefix}.percentIrq`, (0, data_transformers_1.toNumberOrNull)(core.percentIrq));
        }
        // Sync with ObjectManager
        if (this.objectManager) {
            const resourceMap = new Map();
            for (let i = 0; i < cores.length; i++) {
                resourceMap.set(String(i), { index: i });
            }
            await this.objectManager.handleDynamicResources('cpu', resourceMap);
        }
    }
    /**
     * Handle dynamic CPU package state creation and updates
     *
     * @param data - Unraid data containing CPU package metrics
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicCpuPackages(data, selectedDomains) {
        if (!selectedDomains.has('metrics.cpu')) {
            return;
        }
        // packages data comes from info.cpu.packages (not metrics.cpu)
        const info = data.info;
        if (!info?.cpu?.packages) {
            return;
        }
        const packages = info.cpu.packages;
        const powerArray = Array.isArray(packages.power) ? packages.power : [];
        const tempArray = Array.isArray(packages.temp) ? packages.temp : [];
        const packageCount = Math.max(powerArray.length, tempArray.length);
        // Create CPU package states on first detection or if package count changed
        if (!this.cpuPackagesDetected || this.cpuPackageCount !== packageCount) {
            this.cpuPackageCount = packageCount;
            this.cpuPackagesDetected = true;
            this.adapter.log.info(`Detected ${packageCount} CPU packages, creating states...`);
            // Create package count state
            await this.stateManager.writeState('metrics.cpu.packages.count', { type: 'number', role: 'value', unit: '' }, packageCount);
            // Create total power state
            await this.stateManager.writeState('metrics.cpu.packages.totalPower', { type: 'number', role: 'value.power', unit: 'W' }, null);
            // Create states for each CPU package
            for (let i = 0; i < packageCount; i++) {
                const packagePrefix = `metrics.cpu.packages.${i}`;
                await this.stateManager.writeState(`${packagePrefix}.power`, { type: 'number', role: 'value.power', unit: 'W' }, null);
                await this.stateManager.writeState(`${packagePrefix}.temp`, { type: 'number', role: 'value.temperature', unit: '°C' }, null);
            }
        }
        // Update CPU package values
        await this.stateManager.updateState('metrics.cpu.packages.totalPower', (0, data_transformers_1.toNumberOrNull)(packages.totalPower));
        for (let i = 0; i < packageCount; i++) {
            const packagePrefix = `metrics.cpu.packages.${i}`;
            await this.stateManager.updateState(`${packagePrefix}.power`, (0, data_transformers_1.toNumberOrNull)(powerArray[i]));
            await this.stateManager.updateState(`${packagePrefix}.temp`, (0, data_transformers_1.toNumberOrNull)(tempArray[i]));
        }
        // Sync with ObjectManager
        if (this.objectManager) {
            const resourceMap = new Map();
            for (let i = 0; i < packageCount; i++) {
                resourceMap.set(String(i), { index: i });
            }
            await this.objectManager.handleDynamicResources('cpuPackage', resourceMap);
        }
    }
    /**
     * Handle dynamic array disk state creation and updates
     *
     * @param data - Unraid data containing array disk information
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicArrayDisks(data, selectedDomains) {
        const hasDisks = selectedDomains.has('array.disks');
        const hasParities = selectedDomains.has('array.parities');
        const hasCaches = selectedDomains.has('array.caches');
        if (!hasDisks && !hasParities && !hasCaches) {
            return;
        }
        const array = data.array;
        if (!array) {
            return;
        }
        const disks = hasDisks && Array.isArray(array.disks) ? array.disks : [];
        const parities = hasParities && Array.isArray(array.parities) ? array.parities : [];
        const caches = hasCaches && Array.isArray(array.caches) ? array.caches : [];
        const diskCount = hasDisks ? disks.length : this.diskCount;
        const parityCount = hasParities ? parities.length : this.parityCount;
        const cacheCount = hasCaches ? caches.length : this.cacheCount;
        // Create or update disk states if needed
        if (!this.arrayDisksDetected ||
            (hasDisks && this.diskCount !== diskCount) ||
            (hasParities && this.parityCount !== parityCount) ||
            (hasCaches && this.cacheCount !== cacheCount)) {
            if (hasDisks) {
                this.diskCount = diskCount;
            }
            if (hasParities) {
                this.parityCount = parityCount;
            }
            if (hasCaches) {
                this.cacheCount = cacheCount;
            }
            this.arrayDisksDetected = true;
            this.adapter.log.info(`Detected array configuration: ${diskCount} data disks, ${parityCount} parity disks, ${cacheCount} cache disks`);
            // Create count states only for selected domains
            if (hasDisks) {
                await this.stateManager.writeState('array.disks.count', { type: 'number', role: 'value', unit: '' }, diskCount);
                await this.createDiskStates('array.disks', disks);
            }
            if (hasParities) {
                await this.stateManager.writeState('array.parities.count', { type: 'number', role: 'value', unit: '' }, parityCount);
                await this.createDiskStates('array.parities', parities);
            }
            if (hasCaches) {
                await this.stateManager.writeState('array.caches.count', { type: 'number', role: 'value', unit: '' }, cacheCount);
                await this.createDiskStates('array.caches', caches);
            }
        }
        // Update disk values only for selected domains
        if (hasDisks && disks.length > 0) {
            await this.updateDiskValues('array.disks', disks);
        }
        if (hasParities && parities.length > 0) {
            await this.updateDiskValues('array.parities', parities);
        }
        if (hasCaches && caches.length > 0) {
            await this.updateDiskValues('array.caches', caches);
        }
        // Sync with ObjectManager
        if (this.objectManager) {
            const diskMap = new Map();
            for (const disk of disks) {
                const d = disk;
                const idx = (0, data_transformers_1.toStringOrNull)(d.idx) ?? String(disks.indexOf(disk));
                diskMap.set(idx, { name: d.name, device: d.device });
            }
            await this.objectManager.handleDynamicResources('disk', diskMap);
        }
    }
    /**
     * Handle dynamic Docker container state creation and updates
     *
     * @param data - Unraid data containing Docker container information
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicDockerContainers(data, selectedDomains) {
        if (!selectedDomains.has('docker.containers') && !selectedDomains.has('docker.updates')) {
            return;
        }
        const docker = data.docker;
        if (!docker?.containers) {
            return;
        }
        const containers = Array.isArray(docker.containers) ? docker.containers : [];
        const containerNames = new Set();
        // Build a lookup map from the authoritative per-container update status list.
        // Unraid's DockerContainer.isUpdateAvailable is nullable and often null;
        // Docker.containerUpdateStatuses is the source used by the Unraid UI.
        const updateStatusByName = new Map();
        if (Array.isArray(docker.containerUpdateStatuses)) {
            for (const entry of docker.containerUpdateStatuses) {
                const item = entry;
                const itemName = (0, data_transformers_1.toStringOrNull)(item.name);
                const itemStatus = (0, data_transformers_1.toStringOrNull)(item.updateStatus);
                if (itemName && itemStatus) {
                    updateStatusByName.set(itemName.replace(/^\//, ''), itemStatus);
                }
            }
        }
        const resolveIsUpdateAvailable = (name, containerField) => {
            const status = updateStatusByName.get(name);
            if (status) {
                return status === 'UPDATE_AVAILABLE';
            }
            return (0, data_transformers_1.toBooleanOrNull)(containerField);
        };
        const wantsContainers = selectedDomains.has('docker.containers');
        const wantsUpdates = selectedDomains.has('docker.updates');
        for (const container of containers) {
            const c = container;
            const names = c.names;
            if (names && Array.isArray(names) && names.length > 0) {
                const name = names[0].replace(/^\//, '');
                containerNames.add(name);
            }
        }
        const needsUpdate = !this.dockerContainersDetected ||
            containerNames.size !== this.containerNames.size ||
            ![...containerNames].every(name => this.containerNames.has(name));
        if (wantsContainers && needsUpdate) {
            this.containerNames = containerNames;
            this.dockerContainersDetected = true;
            this.adapter.log.info(`Detected ${containerNames.size} Docker containers`);
            await this.stateManager.writeState('docker.containers.count', { type: 'number', role: 'value', unit: '' }, containerNames.size);
            for (const container of containers) {
                const c = container;
                const names = c.names;
                if (!names || !Array.isArray(names) || names.length === 0) {
                    continue;
                }
                const name = names[0].replace(/^\//, '');
                const sanitizedName = (0, data_transformers_1.sanitizeResourceName)(name);
                const containerPrefix = `docker.containers.${sanitizedName}`;
                await this.stateManager.writeState(`${containerPrefix}.name`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${containerPrefix}.image`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${containerPrefix}.state`, { type: 'string', role: 'indicator.status' }, null);
                await this.stateManager.writeState(`${containerPrefix}.status`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${containerPrefix}.autoStart`, { type: 'boolean', role: 'indicator' }, null);
                await this.stateManager.writeState(`${containerPrefix}.sizeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
                // Create control buttons for container
                await this.createDockerControlButtons(containerPrefix, c.id);
            }
        }
        // Ensure isUpdateAvailable state exists per container when either the container
        // field is present in the API response OR the update-status list covers the container.
        if (wantsContainers) {
            for (const container of containers) {
                const c = container;
                const names = c.names;
                if (!names || !Array.isArray(names) || names.length === 0) {
                    continue;
                }
                const name = names[0].replace(/^\//, '');
                const hasDirectField = 'isUpdateAvailable' in c;
                const hasStatusEntry = updateStatusByName.has(name);
                if (!hasDirectField && !hasStatusEntry) {
                    continue;
                }
                const sanitizedName = (0, data_transformers_1.sanitizeResourceName)(name);
                const containerPrefix = `docker.containers.${sanitizedName}`;
                if (!this.dockerIsUpdateAvailableCreated.has(containerPrefix)) {
                    await this.stateManager.writeState(`${containerPrefix}.isUpdateAvailable`, { type: 'boolean', role: 'indicator' }, null);
                    this.dockerIsUpdateAvailableCreated.add(containerPrefix);
                }
            }
        }
        // Update container values (only when docker.containers is selected)
        if (wantsContainers) {
            for (const container of containers) {
                const c = container;
                const names = c.names;
                if (!names || !Array.isArray(names) || names.length === 0) {
                    continue;
                }
                const name = names[0].replace(/^\//, '');
                if (!this.containerNames.has(name)) {
                    continue;
                }
                const sanitizedName = (0, data_transformers_1.sanitizeResourceName)(name);
                const containerPrefix = `docker.containers.${sanitizedName}`;
                await this.stateManager.updateState(`${containerPrefix}.name`, name);
                await this.stateManager.updateState(`${containerPrefix}.image`, (0, data_transformers_1.toStringOrNull)(c.image));
                await this.stateManager.updateState(`${containerPrefix}.state`, (0, data_transformers_1.toStringOrNull)(c.state));
                await this.stateManager.updateState(`${containerPrefix}.status`, (0, data_transformers_1.toStringOrNull)(c.status));
                await this.stateManager.updateState(`${containerPrefix}.autoStart`, (0, data_transformers_1.toBooleanOrNull)(c.autoStart));
                await this.stateManager.updateState(`${containerPrefix}.sizeGb`, (0, data_transformers_1.bytesToGigabytes)(c.sizeRootFs));
                if (this.dockerIsUpdateAvailableCreated.has(containerPrefix)) {
                    await this.stateManager.updateState(`${containerPrefix}.isUpdateAvailable`, resolveIsUpdateAvailable(name, c.isUpdateAvailable));
                }
                // Refresh control-button metadata if the container ID changed.
                // This covers the case where `updateContainer` recreates the container
                // under the same name but assigns a fresh Docker hash; without the refresh
                // subsequent pause/stop/update calls would fail with "No such container".
                const currentId = (0, data_transformers_1.toStringOrNull)(c.id);
                if (currentId) {
                    const previousId = this.containerIdByName.get(name);
                    if (previousId !== currentId) {
                        if (previousId !== undefined) {
                            this.adapter.log.info(`Container "${name}" id changed; refreshing control button metadata`);
                            await this.refreshDockerControlMetadata(containerPrefix, currentId);
                        }
                        this.containerIdByName.set(name, currentId);
                    }
                }
            }
        }
        // Aggregate docker.updates summary (only when the summary domain is selected)
        if (wantsUpdates) {
            let availableCount = 0;
            let seenAny = false;
            for (const container of containers) {
                const c = container;
                const names = c.names;
                if (!names || !Array.isArray(names) || names.length === 0) {
                    continue;
                }
                const name = names[0].replace(/^\//, '');
                const hasDirect = 'isUpdateAvailable' in c;
                const hasStatus = updateStatusByName.has(name);
                if (!hasDirect && !hasStatus) {
                    continue;
                }
                seenAny = true;
                if (resolveIsUpdateAvailable(name, c.isUpdateAvailable) === true) {
                    availableCount += 1;
                }
            }
            if (!this.dockerUpdatesSummaryCreated) {
                await this.stateManager.writeState('docker.updates.availableCount', { type: 'number', role: 'value', unit: '' }, null);
                await this.stateManager.writeState('docker.updates.hasUpdates', { type: 'boolean', role: 'indicator' }, null);
                this.dockerUpdatesSummaryCreated = true;
            }
            if (seenAny) {
                await this.stateManager.updateState('docker.updates.availableCount', availableCount);
                await this.stateManager.updateState('docker.updates.hasUpdates', availableCount > 0);
            }
            else {
                // Field not delivered by this Unraid version; keep previous values untouched to
                // avoid falsely reporting "no updates" when the capability is simply missing.
                this.adapter.log.debug('docker.updates selected, but isUpdateAvailable not present in response. Summary values left unchanged.');
            }
        }
        // Sync with ObjectManager — only when docker.containers is selected so we do not
        // orphan-clean container objects when only the docker.updates summary is active.
        if (wantsContainers && this.objectManager) {
            const resourceMap = new Map();
            for (const name of containerNames) {
                const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
                resourceMap.set(sanitizedName, { name });
            }
            await this.objectManager.handleDynamicResources('docker', resourceMap);
        }
    }
    /**
     * Handle dynamic share state creation and updates
     *
     * @param data - Unraid data containing share information
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicShares(data, selectedDomains) {
        if (!selectedDomains.has('shares.list')) {
            return;
        }
        const shares = data.shares;
        if (!shares || !Array.isArray(shares)) {
            return;
        }
        const shareNames = new Set();
        for (const share of shares) {
            const s = share;
            const name = s.name;
            if (name) {
                shareNames.add(name);
            }
        }
        const needsUpdate = !this.sharesDetected ||
            shareNames.size !== this.shareNames.size ||
            ![...shareNames].every(name => this.shareNames.has(name));
        if (needsUpdate) {
            this.shareNames = shareNames;
            this.sharesDetected = true;
            this.adapter.log.info(`Detected ${shareNames.size} shares`);
            await this.stateManager.writeState('shares.count', { type: 'number', role: 'value', unit: '' }, shareNames.size);
            for (const share of shares) {
                const s = share;
                const name = s.name;
                if (!name) {
                    continue;
                }
                const sanitizedName = (0, data_transformers_1.sanitizeResourceName)(name);
                const sharePrefix = `shares.${sanitizedName}`;
                await this.stateManager.writeState(`${sharePrefix}.name`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${sharePrefix}.freeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
                await this.stateManager.writeState(`${sharePrefix}.usedGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
                await this.stateManager.writeState(`${sharePrefix}.sizeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
                await this.stateManager.writeState(`${sharePrefix}.usedPercent`, { type: 'number', role: 'value.percent', unit: '%' }, null);
                await this.stateManager.writeState(`${sharePrefix}.comment`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${sharePrefix}.allocator`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${sharePrefix}.cow`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${sharePrefix}.color`, { type: 'string', role: 'text' }, null);
            }
        }
        // Update share values
        for (const share of shares) {
            const s = share;
            const name = s.name;
            if (!name || !this.shareNames.has(name)) {
                continue;
            }
            const sharePrefix = `shares.${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            await this.stateManager.updateState(`${sharePrefix}.name`, name);
            await this.stateManager.updateState(`${sharePrefix}.freeGb`, (0, data_transformers_1.kilobytesToGigabytes)(s.free));
            await this.stateManager.updateState(`${sharePrefix}.usedGb`, (0, data_transformers_1.kilobytesToGigabytes)(s.used));
            await this.stateManager.updateState(`${sharePrefix}.sizeGb`, (0, data_transformers_1.kilobytesToGigabytes)(s.size));
            // Calculate usage percent
            const usedKb = (0, data_transformers_1.toNumberOrNull)(s.used);
            const freeKb = (0, data_transformers_1.toNumberOrNull)(s.free);
            let usedPercent = null;
            if (usedKb !== null && freeKb !== null && usedKb + freeKb > 0) {
                usedPercent = Math.round((usedKb / (usedKb + freeKb)) * 10000) / 100;
            }
            await this.stateManager.updateState(`${sharePrefix}.usedPercent`, usedPercent);
            await this.stateManager.updateState(`${sharePrefix}.comment`, (0, data_transformers_1.toStringOrNull)(s.comment));
            await this.stateManager.updateState(`${sharePrefix}.allocator`, (0, data_transformers_1.toStringOrNull)(s.allocator));
            await this.stateManager.updateState(`${sharePrefix}.cow`, (0, data_transformers_1.toStringOrNull)(s.cow));
            await this.stateManager.updateState(`${sharePrefix}.color`, (0, data_transformers_1.toStringOrNull)(s.color));
        }
        // Sync with ObjectManager
        if (this.objectManager) {
            const resourceMap = new Map();
            for (const name of shareNames) {
                const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
                resourceMap.set(sanitizedName, { name });
            }
            await this.objectManager.handleDynamicResources('share', resourceMap);
        }
    }
    /**
     * Handle dynamic VM state creation and updates
     *
     * @param data - Unraid data containing VM information
     * @param selectedDomains - Set of selected domain IDs
     */
    async handleDynamicVms(data, selectedDomains) {
        if (!selectedDomains.has('vms.list')) {
            return;
        }
        const vms = data.vms;
        if (!vms?.domains) {
            return;
        }
        const domains = Array.isArray(vms.domains) ? vms.domains : [];
        const vmUuids = new Set();
        for (const vm of domains) {
            const v = vm;
            const uuid = v.uuid;
            if (uuid) {
                vmUuids.add(uuid);
            }
        }
        const needsUpdate = !this.vmsDetected ||
            vmUuids.size !== this.vmUuids.size ||
            ![...vmUuids].every(uuid => this.vmUuids.has(uuid));
        if (needsUpdate) {
            this.vmUuids = vmUuids;
            this.vmsDetected = true;
            this.adapter.log.info(`Detected ${vmUuids.size} VMs`);
            await this.stateManager.writeState('vms.count', { type: 'number', role: 'value', unit: '' }, vmUuids.size);
            for (const vm of domains) {
                const v = vm;
                const name = v.name;
                const uuid = v.uuid;
                if (!name || !uuid) {
                    continue;
                }
                const sanitizedName = (0, data_transformers_1.sanitizeResourceName)(name);
                const vmPrefix = `vms.${sanitizedName}`;
                await this.stateManager.writeState(`${vmPrefix}.name`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${vmPrefix}.state`, { type: 'string', role: 'indicator.status' }, null);
                await this.stateManager.writeState(`${vmPrefix}.uuid`, { type: 'string', role: 'text' }, null);
                // Create control buttons for VM
                // Use the full prefixed ID for VM control
                const vmId = v.id;
                this.adapter.log.debug(`Creating VM control buttons for ${name}, using id: ${vmId}`);
                await this.createVmControlButtons(vmPrefix, vmId);
            }
        }
        // Update VM values
        for (const vm of domains) {
            const v = vm;
            const name = v.name;
            const uuid = v.uuid;
            if (!name || !uuid || !this.vmUuids.has(uuid)) {
                continue;
            }
            const vmPrefix = `vms.${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            await this.stateManager.updateState(`${vmPrefix}.name`, name);
            await this.stateManager.updateState(`${vmPrefix}.state`, (0, data_transformers_1.toStringOrNull)(v.state));
            await this.stateManager.updateState(`${vmPrefix}.uuid`, uuid);
        }
        // Sync with ObjectManager
        if (this.objectManager) {
            const resourceMap = new Map();
            for (const vm of domains) {
                const v = vm;
                const name = v.name;
                const uuid = v.uuid;
                if (name && uuid && this.vmUuids.has(uuid)) {
                    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    resourceMap.set(sanitizedName, { name, uuid });
                }
            }
            await this.objectManager.handleDynamicResources('vm', resourceMap);
        }
    }
    /**
     * Handle dynamic mainboard temperature sensors.
     * Filters sensors to CHIPSET/AMBIENT/VRM/GPU/MOTHERBOARD/CUSTOM types
     * (CPU package, CPU cores, and disk sensors are covered by other domains).
     *
     * @param data - Unraid polling response
     * @param selectedDomains - Currently selected domain IDs
     */
    async handleDynamicTemperatureBoardSensors(data, selectedDomains) {
        if (!selectedDomains.has('metrics.temperature.board')) {
            return;
        }
        const metrics = data.metrics;
        const sensors = metrics?.temperature?.sensors;
        if (!Array.isArray(sensors)) {
            // API response missing the temperature field (capability not available or
            // introspection flagged it off). Do NOT run the orphan cleanup so existing
            // channels are preserved until the next successful poll.
            this.adapter.log.debug('metrics.temperature.board selected but no temperature.sensors in response. Skipping update.');
            return;
        }
        const BOARD_TYPES = new Set(['CHIPSET', 'AMBIENT', 'VRM', 'GPU', 'MOTHERBOARD', 'CUSTOM']);
        const usedIds = new Set();
        const boardSensors = [];
        for (const raw of sensors) {
            const sensor = raw;
            const typeValue = (0, data_transformers_1.toStringOrNull)(sensor.type);
            if (!typeValue || !BOARD_TYPES.has(typeValue.toUpperCase())) {
                continue;
            }
            const idValue = (0, data_transformers_1.toStringOrNull)(sensor.id) ?? (0, data_transformers_1.toStringOrNull)(sensor.name);
            if (!idValue) {
                continue;
            }
            let resourceId = (0, data_transformers_1.sanitizeResourceName)(idValue);
            if (!resourceId) {
                resourceId = 'sensor';
            }
            // Collision handling: append numeric suffix if sanitized id already used
            if (usedIds.has(resourceId)) {
                let counter = 2;
                while (usedIds.has(`${resourceId}_${counter}`)) {
                    counter += 1;
                }
                this.adapter.log.warn(`Board sensor id collision after sanitization: "${idValue}" -> using suffix _${counter}`);
                resourceId = `${resourceId}_${counter}`;
            }
            usedIds.add(resourceId);
            const current = sensor.current;
            boardSensors.push({
                resourceId,
                name: (0, data_transformers_1.toStringOrNull)(sensor.name) ?? idValue,
                temp: (0, data_transformers_1.toNumberOrNull)(current?.value),
                tempStatus: (0, data_transformers_1.toStringOrNull)(current?.status),
            });
        }
        const currentIds = new Set(boardSensors.map(s => s.resourceId));
        const idsChanged = !this.temperatureBoardDetected ||
            currentIds.size !== this.temperatureSensorIds.size ||
            [...currentIds].some(id => !this.temperatureSensorIds.has(id));
        if (idsChanged) {
            this.temperatureSensorIds = currentIds;
            this.temperatureBoardDetected = true;
            this.adapter.log.info(`Detected ${boardSensors.length} mainboard temperature sensors`);
            await this.stateManager.writeState('metrics.temperature.board.count', { type: 'number', role: 'value', unit: '' }, boardSensors.length);
            for (const sensor of boardSensors) {
                const prefix = `metrics.temperature.board.${sensor.resourceId}`;
                await this.stateManager.writeState(`${prefix}.name`, { type: 'string', role: 'text' }, null);
                await this.stateManager.writeState(`${prefix}.temp`, { type: 'number', role: 'value.temperature', unit: '°C' }, null);
                await this.stateManager.writeState(`${prefix}.tempStatus`, { type: 'string', role: 'text' }, null);
                // Remove sub-states from earlier pre-release iterations (type/tempWarning/tempCritical).
                // Idempotent: delObjectAsync on a non-existing id just resolves without error.
                for (const obsolete of ['type', 'tempWarning', 'tempCritical']) {
                    try {
                        await this.adapter.delObjectAsync(`${prefix}.${obsolete}`);
                    }
                    catch {
                        // State did not exist — no cleanup needed.
                    }
                }
            }
        }
        else {
            // Count might stay stable but we still want it fresh
            await this.stateManager.updateState('metrics.temperature.board.count', boardSensors.length);
        }
        for (const sensor of boardSensors) {
            const prefix = `metrics.temperature.board.${sensor.resourceId}`;
            await this.stateManager.updateState(`${prefix}.name`, sensor.name);
            await this.stateManager.updateState(`${prefix}.temp`, sensor.temp);
            await this.stateManager.updateState(`${prefix}.tempStatus`, sensor.tempStatus);
        }
        if (this.objectManager) {
            const resourceMap = new Map();
            for (const sensor of boardSensors) {
                resourceMap.set(sensor.resourceId, { id: sensor.resourceId });
            }
            await this.objectManager.handleDynamicResources('temperature', resourceMap);
        }
    }
    async createDiskStates(prefix, disks) {
        for (let i = 0; i < disks.length; i++) {
            const disk = disks[i];
            const rawIdx = disk.idx;
            const diskIndex = rawIdx !== undefined && rawIdx !== null ? ((0, data_transformers_1.toStringOrNull)(rawIdx) ?? String(i)) : String(i);
            const diskPrefix = `${prefix}.${diskIndex}`;
            // Basic info states
            await this.stateManager.writeState(`${diskPrefix}.name`, { type: 'string', role: 'text' }, null);
            await this.stateManager.writeState(`${diskPrefix}.device`, { type: 'string', role: 'text' }, null);
            await this.stateManager.writeState(`${diskPrefix}.status`, { type: 'string', role: 'indicator.status' }, null);
            await this.stateManager.writeState(`${diskPrefix}.temp`, { type: 'number', role: 'value.temperature', unit: '°C' }, null);
            await this.stateManager.writeState(`${diskPrefix}.type`, { type: 'string', role: 'text' }, null);
            // Size states
            await this.stateManager.writeState(`${diskPrefix}.sizeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
            await this.stateManager.writeState(`${diskPrefix}.fsSizeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
            await this.stateManager.writeState(`${diskPrefix}.fsUsedGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
            await this.stateManager.writeState(`${diskPrefix}.fsFreeGb`, { type: 'number', role: 'value', unit: 'GB' }, null);
            await this.stateManager.writeState(`${diskPrefix}.fsUsedPercent`, { type: 'number', role: 'value.percent', unit: '%' }, null);
            // File system info
            await this.stateManager.writeState(`${diskPrefix}.fsType`, { type: 'string', role: 'text' }, null);
            await this.stateManager.writeState(`${diskPrefix}.isSpinning`, { type: 'boolean', role: 'indicator' }, null);
            // Performance counters
            await this.stateManager.writeState(`${diskPrefix}.numReads`, { type: 'number', role: 'value' }, null);
            await this.stateManager.writeState(`${diskPrefix}.numWrites`, { type: 'number', role: 'value' }, null);
            await this.stateManager.writeState(`${diskPrefix}.numErrors`, { type: 'number', role: 'value' }, null);
            // Temperature thresholds
            await this.stateManager.writeState(`${diskPrefix}.warning`, { type: 'number', role: 'value.temperature', unit: '°C' }, null);
            await this.stateManager.writeState(`${diskPrefix}.critical`, { type: 'number', role: 'value.temperature', unit: '°C' }, null);
            // Additional info
            await this.stateManager.writeState(`${diskPrefix}.rotational`, { type: 'boolean', role: 'indicator' }, null);
            await this.stateManager.writeState(`${diskPrefix}.transport`, { type: 'string', role: 'text' }, null);
        }
    }
    async updateDiskValues(prefix, disks) {
        for (const disk of disks) {
            const d = disk;
            const rawIdx = d.idx;
            const diskIndex = rawIdx !== undefined && rawIdx !== null
                ? ((0, data_transformers_1.toStringOrNull)(rawIdx) ?? String(disks.indexOf(disk)))
                : String(disks.indexOf(disk));
            const diskPrefix = `${prefix}.${diskIndex}`;
            await this.stateManager.updateState(`${diskPrefix}.name`, (0, data_transformers_1.toStringOrNull)(d.name));
            await this.stateManager.updateState(`${diskPrefix}.device`, (0, data_transformers_1.toStringOrNull)(d.device));
            await this.stateManager.updateState(`${diskPrefix}.status`, (0, data_transformers_1.toStringOrNull)(d.status));
            await this.stateManager.updateState(`${diskPrefix}.temp`, (0, data_transformers_1.toNumberOrNull)(d.temp));
            await this.stateManager.updateState(`${diskPrefix}.type`, (0, data_transformers_1.toStringOrNull)(d.type));
            await this.stateManager.updateState(`${diskPrefix}.sizeGb`, (0, data_transformers_1.kilobytesToGigabytes)(d.size));
            await this.stateManager.updateState(`${diskPrefix}.fsSizeGb`, (0, data_transformers_1.kilobytesToGigabytes)(d.fsSize));
            await this.stateManager.updateState(`${diskPrefix}.fsUsedGb`, (0, data_transformers_1.kilobytesToGigabytes)(d.fsUsed));
            await this.stateManager.updateState(`${diskPrefix}.fsFreeGb`, (0, data_transformers_1.kilobytesToGigabytes)(d.fsFree));
            const fsUsedPercent = (0, data_transformers_1.calculateUsagePercent)(d.fsUsed, d.fsSize);
            await this.stateManager.updateState(`${diskPrefix}.fsUsedPercent`, fsUsedPercent);
            await this.stateManager.updateState(`${diskPrefix}.fsType`, (0, data_transformers_1.toStringOrNull)(d.fsType));
            await this.stateManager.updateState(`${diskPrefix}.isSpinning`, (0, data_transformers_1.toBooleanOrNull)(d.isSpinning));
            await this.stateManager.updateState(`${diskPrefix}.numReads`, (0, data_transformers_1.bigIntToNumber)(d.numReads));
            await this.stateManager.updateState(`${diskPrefix}.numWrites`, (0, data_transformers_1.bigIntToNumber)(d.numWrites));
            await this.stateManager.updateState(`${diskPrefix}.numErrors`, (0, data_transformers_1.bigIntToNumber)(d.numErrors));
            await this.stateManager.updateState(`${diskPrefix}.warning`, (0, data_transformers_1.toNumberOrNull)(d.warning));
            await this.stateManager.updateState(`${diskPrefix}.critical`, (0, data_transformers_1.toNumberOrNull)(d.critical));
            await this.stateManager.updateState(`${diskPrefix}.rotational`, (0, data_transformers_1.toBooleanOrNull)(d.rotational));
            await this.stateManager.updateState(`${diskPrefix}.transport`, (0, data_transformers_1.toStringOrNull)(d.transport));
        }
    }
    /**
     * Refresh the `native` metadata of existing Docker control buttons without
     * touching the current state value. Used when a container's Docker ID changes
     * after `updateContainer` recreates the container under the same name.
     *
     * @param containerPrefix - The state prefix for the container
     * @param containerId - The updated container ID for mutations
     */
    async refreshDockerControlMetadata(containerPrefix, containerId) {
        for (const control of unraid_domains_1.DOCKER_CONTROL_STATES) {
            const stateId = `${containerPrefix}.${control.id}`;
            const translations = state_names_json_1.default[control.id];
            const name = translations || control.common.name;
            await this.adapter.setObjectAsync(stateId, {
                type: 'state',
                common: {
                    type: control.common.type,
                    role: control.common.role,
                    read: control.common.read ?? true,
                    write: control.common.write ?? true,
                    def: control.common.def ?? false,
                    name,
                    desc: control.common.desc,
                    custom: {},
                },
                native: {
                    resourceType: 'docker',
                    resourceId: containerId,
                    action: control.id.split('.').pop(),
                },
            });
        }
    }
    /**
     * Create control buttons for a Docker container
     *
     * @param containerPrefix - The state prefix for the container
     * @param containerId - The container ID for mutations
     */
    async createDockerControlButtons(containerPrefix, containerId) {
        if (!containerId) {
            this.adapter.log.warn(`Container at ${containerPrefix} has no ID, skipping control buttons`);
            return;
        }
        for (const control of unraid_domains_1.DOCKER_CONTROL_STATES) {
            const stateId = `${containerPrefix}.${control.id}`;
            // Get translation object or use control.common.name as fallback
            const translations = state_names_json_1.default[control.id];
            const name = translations || control.common.name;
            // Always use setObjectAsync to ensure translations are updated
            await this.adapter.setObjectAsync(stateId, {
                type: 'state',
                common: {
                    type: control.common.type,
                    role: control.common.role,
                    read: control.common.read ?? true,
                    write: control.common.write ?? true,
                    def: control.common.def ?? false,
                    name,
                    desc: control.common.desc,
                    custom: {},
                },
                native: {
                    resourceType: 'docker',
                    resourceId: containerId,
                    action: control.id.split('.').pop(),
                },
            });
            // Initialize button state to false
            await this.adapter.setStateAsync(stateId, false, true);
        }
    }
    /**
     * Create control buttons for a VM
     *
     * @param vmPrefix - The state prefix for the VM
     * @param vmId - The VM ID for mutations
     */
    async createVmControlButtons(vmPrefix, vmId) {
        if (!vmId) {
            this.adapter.log.warn(`VM at ${vmPrefix} has no ID, skipping control buttons`);
            return;
        }
        for (const control of unraid_domains_1.VM_CONTROL_STATES) {
            const stateId = `${vmPrefix}.${control.id}`;
            // Get translation object or use control.common.name as fallback
            const translations = state_names_json_1.default[control.id];
            const name = translations || control.common.name;
            // Always use setObjectAsync to ensure translations are updated
            await this.adapter.setObjectAsync(stateId, {
                type: 'state',
                common: {
                    type: control.common.type,
                    role: control.common.role,
                    read: control.common.read ?? true,
                    write: control.common.write ?? true,
                    def: control.common.def ?? false,
                    name,
                    desc: control.common.desc,
                    custom: {},
                },
                native: {
                    resourceType: 'vm',
                    resourceId: vmId,
                    action: control.id.split('.').pop(),
                },
            });
            // Initialize button state to false
            await this.adapter.setStateAsync(stateId, false, true);
        }
    }
}
exports.DynamicResourceManager = DynamicResourceManager;
//# sourceMappingURL=dynamic-resource-manager.js.map