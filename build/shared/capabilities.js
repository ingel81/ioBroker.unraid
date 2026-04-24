"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_CAPABILITIES_DISABLED = void 0;
exports.allCapabilitiesEnabled = allCapabilitiesEnabled;
exports.ALL_CAPABILITIES_DISABLED = {
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
function allCapabilitiesEnabled() {
    return {
        temperatureMetrics: true,
        dockerUpdateFlag: true,
        dockerContainerUpdateStatuses: true,
        dockerPause: true,
        dockerUnpause: true,
        dockerUpdate: true,
    };
}
//# sourceMappingURL=capabilities.js.map