"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlManager = void 0;
const mutations_1 = require("../graphql/mutations");
/**
 * Manages control operations for Docker containers and VMs
 * Handles button state changes and executes GraphQL mutations
 */
class ControlManager {
    adapter;
    apolloClient;
    capabilities;
    triggerPoll;
    /**
     * Create a new control manager
     *
     * @param adapter - Adapter interface for logging and state management
     * @param apolloClient - Apollo client for GraphQL mutations
     * @param capabilities - Detected Unraid API capabilities (mutated at runtime on fallback)
     * @param triggerPoll - Callback that triggers an immediate poll cycle so that
     *   post-mutation state changes become visible without waiting for the next interval
     */
    constructor(adapter, apolloClient, capabilities, triggerPoll) {
        this.adapter = adapter;
        this.apolloClient = apolloClient;
        this.capabilities = capabilities;
        this.triggerPoll = triggerPoll;
    }
    /**
     * Skip a control action when the required capability is missing.
     * Logs once per (action, capability) combination.
     */
    unsupportedActions = new Set();
    isSupported(capability, label) {
        if (this.capabilities[capability]) {
            return true;
        }
        const key = `${capability}:${label}`;
        if (!this.unsupportedActions.has(key)) {
            this.unsupportedActions.add(key);
            this.adapter.log.warn(`${label} is not supported by this Unraid server (missing API feature). Action ignored.`);
        }
        return false;
    }
    /**
     * Handle state changes for control buttons
     *
     * @param id - State ID that changed
     * @param state - New state value
     */
    async handleStateChange(id, state) {
        // Ignore acknowledged states, deletions, or false values
        if (!state || state.ack || !state.val) {
            return;
        }
        // Check if this is a control button
        if (!id.includes('.commands.')) {
            return;
        }
        this.adapter.log.info(`Processing control action for ${id}`);
        try {
            const mutationResult = await this.executeControlAction(id);
            // Docker mutations return the mutated container (id, state, status).
            // Apply that result directly so the object tree reflects the new state
            // without waiting for the next poll cycle — Docker's API is synchronous,
            // so the returned values are already the authoritative post-mutation state.
            if (mutationResult) {
                await this.applyDockerMutationResult(id, mutationResult);
            }
            await this.resetButton(id);
            // Additionally trigger a re-poll so that fields which are not part of the
            // mutation response (e.g. isUpdateAvailable after `update`) get refreshed.
            this.triggerPoll();
        }
        catch (error) {
            const message = this.describeError(error);
            // Docker daemon returns 409/500 when the requested action is a no-op
            // (e.g. pause on an already paused container, or resume on a running one).
            // That's not really an error — the container is already in the desired
            // state (or has moved past it). Log as warning and refresh the tree so
            // the mismatch gets corrected on the next poll.
            if (/\b(?:is not (?:paused|running)|already (?:paused|running|stopped))\b/i.test(message)) {
                this.adapter.log.warn(`Docker action skipped (container state already reconciled): ${message}`);
                this.triggerPoll();
            }
            else {
                this.adapter.log.error(`Failed to execute control action: ${message}`);
            }
            await this.resetButton(id);
        }
    }
    /**
     * Apply the state/status from a Docker mutation response to the corresponding
     * container object. Makes the new state visible instantly.
     *
     * @param buttonStateId - Full state id of the command button (e.g. `unraid.0.docker.containers.radarr.commands.pause`)
     * @param result - Parsed mutation result with state/status
     * @param result.state - New container state (RUNNING, PAUSED, EXITED)
     * @param result.status - New container status text
     */
    async applyDockerMutationResult(buttonStateId, result) {
        // unraid.0.docker.containers.<name>.commands.<action>
        // strip the trailing `.commands.<action>` to get the container prefix
        const parts = buttonStateId.split('.');
        if (parts.length < 4) {
            return;
        }
        const containerPrefix = parts.slice(0, -2).join('.');
        if (result.state !== null) {
            await this.adapter.setStateAsync(`${containerPrefix}.state`, result.state, true);
        }
        if (result.status !== null) {
            await this.adapter.setStateAsync(`${containerPrefix}.status`, result.status, true);
        }
    }
    /**
     * Execute the control action based on the button pressed
     *
     * @param stateId - The control button state ID
     * @returns Mutation result for Docker actions (state/status), null for VM actions
     */
    async executeControlAction(stateId) {
        const obj = await this.adapter.getObjectAsync(stateId);
        if (!obj || !obj.native) {
            throw new Error(`No object found for control state ${stateId}`);
        }
        const { resourceType, resourceId, action } = obj.native;
        this.adapter.log.info(`Executing ${action} for ${resourceType} ${resourceId}`);
        switch (resourceType) {
            case 'docker':
                return await this.executeDockerAction(resourceId, action);
            case 'vm':
                await this.executeVmAction(resourceId, action);
                return null;
            default:
                throw new Error(`Unknown resource type: ${resourceType}`);
        }
    }
    /**
     * Parse a Docker mutation payload into state/status fields.
     * Docker mutations return `{ docker: { <action>: { id, state, status } } }`.
     *
     * @param payload - Raw GraphQL mutation response
     * @param action - Mutation field name (e.g. "pause", "unpause", "updateContainer")
     */
    parseDockerMutationResult(payload, action) {
        const docker = payload?.docker;
        const result = docker?.[action];
        return {
            state: typeof result?.state === 'string' ? result.state : null,
            status: typeof result?.status === 'string' ? result.status : null,
        };
    }
    /**
     * Execute Docker container control actions
     *
     * @param containerId - Docker container ID (PrefixedID format)
     * @param action - Action to perform (start, stop, pause, resume, update)
     */
    async executeDockerAction(containerId, action) {
        this.adapter.log.info(`Executing Docker action: ${action} on container ${containerId}`);
        switch (action) {
            case 'start': {
                const startResult = await this.apolloClient.mutate(mutations_1.DOCKER_START_MUTATION, { id: containerId });
                this.adapter.log.debug(`Docker start mutation result: ${JSON.stringify(startResult)}`);
                return this.parseDockerMutationResult(startResult, 'start');
            }
            case 'stop': {
                const stopResult = await this.apolloClient.mutate(mutations_1.DOCKER_STOP_MUTATION, { id: containerId });
                this.adapter.log.debug(`Docker stop mutation result: ${JSON.stringify(stopResult)}`);
                return this.parseDockerMutationResult(stopResult, 'stop');
            }
            case 'pause': {
                if (!this.isSupported('dockerPause', 'Docker pause')) {
                    return null;
                }
                const pauseResult = await this.apolloClient.mutate(mutations_1.DOCKER_PAUSE_MUTATION, { id: containerId });
                this.adapter.log.debug(`Docker pause mutation result: ${JSON.stringify(pauseResult)}`);
                return this.parseDockerMutationResult(pauseResult, 'pause');
            }
            case 'resume': {
                if (!this.isSupported('dockerUnpause', 'Docker resume')) {
                    return null;
                }
                const resumeResult = await this.apolloClient.mutate(mutations_1.DOCKER_UNPAUSE_MUTATION, { id: containerId });
                this.adapter.log.debug(`Docker resume mutation result: ${JSON.stringify(resumeResult)}`);
                return this.parseDockerMutationResult(resumeResult, 'unpause');
            }
            case 'update': {
                if (!this.isSupported('dockerUpdate', 'Docker update')) {
                    return null;
                }
                const updateResult = await this.apolloClient.mutate(mutations_1.DOCKER_UPDATE_MUTATION, { id: containerId });
                this.adapter.log.debug(`Docker update mutation result: ${JSON.stringify(updateResult)}`);
                return this.parseDockerMutationResult(updateResult, 'updateContainer');
            }
            default:
                throw new Error(`Unknown Docker action: ${action}`);
        }
    }
    /**
     * Execute VM control actions
     *
     * @param vmId - Virtual machine ID (PrefixedID format)
     * @param action - Action to perform (start, stop, pause, resume, forceStop, reboot, reset)
     */
    async executeVmAction(vmId, action) {
        this.adapter.log.info(`Executing VM action: ${action} on VM ${vmId}`);
        switch (action) {
            case 'start': {
                const startResult = await this.apolloClient.mutate(mutations_1.VM_START_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM start mutation result: ${JSON.stringify(startResult)}`);
                break;
            }
            case 'stop': {
                const stopResult = await this.apolloClient.mutate(mutations_1.VM_STOP_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM stop mutation result: ${JSON.stringify(stopResult)}`);
                break;
            }
            case 'pause': {
                const pauseResult = await this.apolloClient.mutate(mutations_1.VM_PAUSE_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM pause mutation result: ${JSON.stringify(pauseResult)}`);
                break;
            }
            case 'resume': {
                const resumeResult = await this.apolloClient.mutate(mutations_1.VM_RESUME_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM resume mutation result: ${JSON.stringify(resumeResult)}`);
                break;
            }
            case 'forceStop': {
                const forceStopResult = await this.apolloClient.mutate(mutations_1.VM_FORCE_STOP_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM forceStop mutation result: ${JSON.stringify(forceStopResult)}`);
                break;
            }
            case 'reboot': {
                const rebootResult = await this.apolloClient.mutate(mutations_1.VM_REBOOT_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM reboot mutation result: ${JSON.stringify(rebootResult)}`);
                break;
            }
            case 'reset': {
                const resetResult = await this.apolloClient.mutate(mutations_1.VM_RESET_MUTATION, { id: vmId });
                this.adapter.log.debug(`VM reset mutation result: ${JSON.stringify(resetResult)}`);
                break;
            }
            default:
                throw new Error(`Unknown VM action: ${action}`);
        }
    }
    /**
     * Reset button state back to false
     *
     * @param stateId - Button state ID to reset
     */
    async resetButton(stateId) {
        await this.adapter.setStateAsync(stateId, { val: false, ack: true });
    }
    /**
     * Convert error to string for logging
     *
     * @param error - Error to describe
     * @returns Error message string
     */
    describeError(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
exports.ControlManager = ControlManager;
//# sourceMappingURL=control-manager.js.map