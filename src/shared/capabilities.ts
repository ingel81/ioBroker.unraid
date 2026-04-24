/**
 * Capability flags for Unraid API features that may not exist on older servers.
 * Detected once at adapter startup via GraphQL introspection; referenced by query
 * builder and control manager to gate feature-specific fields and mutations.
 */
export interface Capabilities {
    /** Metrics.temperature endpoint with sensor array */
    temperatureMetrics: boolean;
    /** DockerContainer.isUpdateAvailable field (nullable, may often be null) */
    dockerUpdateFlag: boolean;
    /** Docker.containerUpdateStatuses list (authoritative per-container update status) */
    dockerContainerUpdateStatuses: boolean;
    /** DockerMutations.pause */
    dockerPause: boolean;
    /** DockerMutations.unpause */
    dockerUnpause: boolean;
    /** DockerMutations.updateContainer */
    dockerUpdate: boolean;
}

export type CapabilityKey = keyof Capabilities;

export const ALL_CAPABILITIES_DISABLED: Capabilities = {
    temperatureMetrics: false,
    dockerUpdateFlag: false,
    dockerContainerUpdateStatuses: false,
    dockerPause: false,
    dockerUnpause: false,
    dockerUpdate: false,
};

/**
 * Create a capabilities object with all flags initially enabled.
 * Used as a default when introspection has not run yet.
 */
export function allCapabilitiesEnabled(): Capabilities {
    return {
        temperatureMetrics: true,
        dockerUpdateFlag: true,
        dockerContainerUpdateStatuses: true,
        dockerPause: true,
        dockerUnpause: true,
        dockerUpdate: true,
    };
}
