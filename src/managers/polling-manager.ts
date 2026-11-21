import type { AdapterInterface } from '../types/adapter-types';
import type { UnraidApolloClient } from '../apollo-client';
import type { DomainDefinition } from '../shared/unraid-domains';
import { EXPENSIVE_FIELD_INTERVAL_MS } from '../shared/unraid-domains';
import type { Capabilities } from '../shared/capabilities';
import { CAPABILITY_FIELDS } from '../shared/capabilities';
import { GraphQLSelectionBuilder } from '../graphql/selection-builder';

/**
 * Manages polling cycles and GraphQL queries
 */
export class PollingManager {
    private pollTimer?: ioBroker.Timeout;
    private stopRequested = false;
    private currentDefinitions: readonly DomainDefinition[] = [];
    private reportedMissingFields = new Set<string>();
    /** True while a poll request is running */
    private pollRunning = false;
    /** A poll was requested while another one was running */
    private pollPending = false;
    /** Last reported error (used to log repeated failures only once) */
    private lastError?: string;
    /** Time of the last successful poll that included the expensive fields (0 = never) */
    private lastExpensivePoll = 0;

    /**
     * Create a new polling manager
     *
     * @param adapter - Adapter interface for logging and timers
     * @param apolloClient - Apollo client for GraphQL queries
     * @param capabilities - Mutable capability flags; updated on runtime fallback
     * @param onDataReceived - Callback function when data is received
     * @param onConnectionChange - Callback with the result of every poll (true = server answered)
     */
    constructor(
        private readonly adapter: AdapterInterface,
        private readonly apolloClient: UnraidApolloClient,
        private readonly capabilities: Capabilities,
        private readonly onDataReceived: (data: Record<string, unknown>) => Promise<void>,
        private readonly onConnectionChange: (connected: boolean) => Promise<void> = async () => {},
    ) {}

    /**
     * Start polling with the given interval
     *
     * @param pollIntervalMs - Polling interval in milliseconds
     * @param definitions - Array of domain definitions to poll
     */
    start(pollIntervalMs: number, definitions: readonly DomainDefinition[]): void {
        if (this.stopRequested) {
            return;
        }

        this.currentDefinitions = definitions;

        // Execute first poll immediately
        void this.pollOnce(definitions).finally(() => {
            this.scheduleNextPoll(pollIntervalMs, definitions);
        });
    }

    /**
     * Trigger a manual poll (e.g., after a control action)
     */
    poll(): void {
        if (this.currentDefinitions.length === 0) {
            this.adapter.log.debug('Cannot poll - no definitions available');
            return;
        }

        void this.pollOnce(this.currentDefinitions);
    }

    /**
     * Stop polling
     */
    stop(): void {
        this.stopRequested = true;

        if (this.pollTimer) {
            this.adapter.clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    /**
     * Execute a single polling cycle. Never throws: errors are reported once via the log
     * and through `onConnectionChange(false)`.
     *
     * @param definitions - Array of domain definitions to poll
     */
    private async pollOnce(definitions: readonly DomainDefinition[]): Promise<void> {
        if (!definitions.length) {
            this.adapter.log.debug('Skipping poll because no domains are selected.');
            return;
        }
        if (this.pollRunning) {
            // Note: A control action triggers an extra poll; never run two requests in parallel
            this.pollPending = true;
            return;
        }

        const includeExpensive = Date.now() - this.lastExpensivePoll >= EXPENSIVE_FIELD_INTERVAL_MS;
        const query = this.buildQuery(definitions, includeExpensive);
        if (!query) {
            this.adapter.log.warn('No query could be built for the current selection.');
            return;
        }

        this.pollRunning = true;
        try {
            const data = await this.apolloClient.query<Record<string, unknown>>(query);
            if (includeExpensive) {
                this.lastExpensivePoll = Date.now();
            }
            this.logGraphQLResponse(data);
            await this.onConnectionChange(true);
            if (this.lastError) {
                this.adapter.log.info('Connection to the Unraid server restored.');
                this.lastError = undefined;
            }
            try {
                await this.onDataReceived(data);
            } catch (processingError) {
                // Server answered; a failure here is local (objects DB) and not a connection problem
                this.adapter.log.error(`Processing Unraid data failed: ${this.describeError(processingError)}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Handle "Cannot query field X on type Y" by disabling the related capability
            // and deferring a rebuilt query to the next poll cycle. Existing states are
            // preserved — no cleanup is triggered because no data was delivered.
            if (message.includes('Cannot query field')) {
                const disabled = this.degradeCapabilitiesFromError(message);
                if (disabled.length > 0) {
                    this.adapter.log.warn(
                        `GraphQL schema rejected a field; disabled capabilities ${disabled.join(', ')}. Next poll will rebuild the query.`,
                    );
                    return;
                }
            }
            if (this.stopRequested) {
                // The adapter is shutting down: the Apollo client is being disposed while this
                // request is still in flight. That is not a connection problem, and Apollo
                // minifies the message to an unhelpful "see go.apollo.dev/c/err" link.
                this.adapter.log.debug(`Poll aborted during shutdown: ${message}`);
                return;
            }
            await this.onConnectionChange(false);
            this.reportError(error);
        } finally {
            this.pollRunning = false;
            if (this.pollPending && !this.stopRequested) {
                this.pollPending = false;
                void this.pollOnce(this.currentDefinitions);
            }
        }
    }

    /**
     * Log a polling error in plain words. The same error is logged only once;
     * repetitions go to the debug log until the connection recovers.
     *
     * @param error - Error thrown by the GraphQL client
     */
    private reportError(error: unknown): void {
        const text = describePollingError(error);
        if (text === this.lastError) {
            this.adapter.log.debug(`Polling still failing: ${text}`);
            return;
        }
        this.lastError = text;
        this.adapter.log.error(text);
    }

    /**
     * Parse a "Cannot query field" error and turn off the matching capability flag.
     * Mutates the shared capabilities object so the next poll rebuilds the query.
     *
     * @param message - Full error message from Apollo/GraphQL
     * @returns Names of capabilities that were disabled
     */
    private degradeCapabilitiesFromError(message: string): string[] {
        const disabled: string[] = [];
        // Shared with the startup probe (see capabilitiesFromValidationErrors) so a new
        // capability only has to be registered in CAPABILITY_FIELDS once.
        for (const [field, capability] of Object.entries(CAPABILITY_FIELDS)) {
            const regex = new RegExp(`Cannot query field "${field}"`);
            if (regex.test(message) && this.capabilities[capability]) {
                this.capabilities[capability] = false;
                disabled.push(capability);
                if (!this.reportedMissingFields.has(field)) {
                    this.reportedMissingFields.add(field);
                }
            }
        }
        return disabled;
    }

    /**
     * Schedule the next polling cycle
     *
     * @param pollIntervalMs - Polling interval in milliseconds
     * @param definitions - Array of domain definitions to poll
     */
    private scheduleNextPoll(pollIntervalMs: number, definitions: readonly DomainDefinition[]): void {
        if (this.stopRequested) {
            return;
        }

        this.pollTimer = this.adapter.setTimeout(() => {
            void this.pollOnce(definitions).finally(() => {
                this.scheduleNextPoll(pollIntervalMs, definitions);
            });
        }, pollIntervalMs);
    }

    /**
     * Build a GraphQL query from domain definitions
     *
     * @param definitions - Array of domain definitions to build query from
     * @param includeExpensive - Include fields marked `expensive` (see EXPENSIVE_FIELD_INTERVAL_MS)
     * @returns GraphQL query or null if nothing is selected
     */
    private buildQuery(definitions: readonly DomainDefinition[], includeExpensive = true): string | null {
        const builder = new GraphQLSelectionBuilder(this.capabilities, includeExpensive);
        for (const definition of definitions) {
            builder.addSelections(definition.selection);
        }
        return builder.build();
    }

    /**
     * Log GraphQL response for debugging
     *
     * @param data - GraphQL response data to log
     */
    private logGraphQLResponse(data: Record<string, unknown>): void {
        try {
            const serialized = JSON.stringify(data);
            // The full response is several KB per poll. Writing it on every cycle made the
            // debug log unusable (tens of MB per day) while still being cut off at 3000
            // characters, so it was no good for troubleshooting either. Now: a summary on
            // debug, and the complete response — uncut — on silly.
            this.adapter.log.debug(`GraphQL response: ${PollingManager.summarizeResponse(data, serialized.length)}`);
            this.adapter.log.silly(`GraphQL response: ${serialized}`);
        } catch (error) {
            this.adapter.log.debug(
                `GraphQL response received but could not be stringified: ${this.describeError(error)}`,
            );
        }
    }

    /**
     * Build a one-line summary of a GraphQL response: size plus each root with the
     * number of entries it carries.
     *
     * @param data - GraphQL response data
     * @param byteLength - Length of the serialized response
     * @returns Summary such as "11.4 KB | array{5} docker{3} shares[15]"
     */
    static summarizeResponse(data: Record<string, unknown>, byteLength: number): string {
        const shape = (value: unknown): string => {
            if (Array.isArray(value)) {
                return `[${value.length}]`;
            }
            if (value && typeof value === 'object') {
                return `{${Object.keys(value).length}}`;
            }
            return '';
        };
        const roots = Object.entries(data).map(([key, value]) => `${key}${shape(value)}`);
        const size = byteLength >= 1024 ? `${(byteLength / 1024).toFixed(1)} KB` : `${byteLength} B`;
        return `${size} | ${roots.join(' ') || '(empty)'}`;
    }

    /**
     * Convert error to string description
     *
     * @param error - Error to describe
     */
    private describeError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}

/**
 * Turn a GraphQL/network error into a short, user-facing log message.
 *
 * @param error - Error thrown by Apollo Client or fetch
 * @returns Message for the ioBroker log
 */
export function describePollingError(error: unknown): string {
    const err = error as { message?: string; name?: string; statusCode?: number; cause?: { code?: string } };
    const message = String(err?.message ?? error);
    const status = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
    const code =
        err?.cause?.code ?? /\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|ECONNRESET)\b/.exec(message)?.[1];

    if (status === 401 || status === 403 || /\b(401|403)\b|forbidden|unauthori[sz]ed/i.test(message)) {
        return 'Unraid rejected the API key (check the key and its permissions in Unraid: Settings > Management Access > API Keys).';
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || /aborted|timeout/i.test(message)) {
        return 'Unraid did not answer in time (request timed out). Will retry with the next poll.';
    }
    if (code) {
        return `Unraid server not reachable (${code}). Check the address in the adapter settings.`;
    }
    return `Polling failed: ${message}`;
}
