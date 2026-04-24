import { ApolloClient, InMemoryCache, split, HttpLink, gql } from '@apollo/client/core';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import type { ClientOptions } from 'ws';
import WebSocket from 'ws';
import { fetch, Agent } from 'undici';
import type { AdapterInterface } from './types/adapter-types';
import type { Capabilities } from './shared/capabilities';
import { allCapabilitiesEnabled } from './shared/capabilities';

/**
 * Configuration options for the Unraid Apollo GraphQL client
 */
export interface ApolloClientOptions {
    /** Base URL of the Unraid server (e.g., https://192.168.1.100) */
    baseUrl: string;
    /** API token for authentication with Unraid */
    apiToken: string;
    /** Whether to allow self-signed SSL certificates (default: false) */
    allowSelfSigned?: boolean;
    /** ioBroker adapter logger instance */
    logger: AdapterInterface['log'];
}

/**
 * Apollo GraphQL client wrapper for Unraid server communication.
 * Handles both HTTP queries/mutations and WebSocket subscriptions.
 */
export class UnraidApolloClient {
    /** Apollo Client instance for GraphQL operations */
    private client: ApolloClient;
    /** WebSocket client for subscription support */
    private wsClient: ReturnType<typeof createClient>;
    /** Base URL of the Unraid server */
    private readonly baseUrl: string;
    /** API token for authentication */
    private readonly apiToken: string;
    /** Logger instance for structured logging */
    private readonly logger: AdapterInterface['log'];

    /**
     * Creates a new Unraid Apollo client instance
     *
     * @param options - Configuration options for the client
     */
    constructor(options: ApolloClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.apiToken = options.apiToken;
        this.logger = options.logger;

        // Create custom fetch for self-signed certificates if needed
        const customFetch =
            options.allowSelfSigned && this.baseUrl.startsWith('https://')
                ? (url: any, init?: any): any => {
                      return fetch(url, {
                          ...init,
                          dispatcher: new Agent({
                              connect: {
                                  rejectUnauthorized: false,
                              },
                          }),
                      });
                  }
                : undefined;

        // Create WebSocket client for subscriptions
        const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/graphql`;

        // Create a custom WebSocket class that includes our options
        class CustomWebSocket extends WebSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                const wsOptions: ClientOptions = {
                    rejectUnauthorized: !options.allowSelfSigned,
                    headers: {
                        'x-api-key': options.apiToken,
                    },
                };
                super(url, protocols, wsOptions);
            }
        }

        this.wsClient = createClient({
            url: wsUrl,
            webSocketImpl: CustomWebSocket,
            connectionParams: {
                'x-api-key': this.apiToken,
            },
            retryAttempts: 5,
            shouldRetry: () => true,
            keepAlive: 30000,
        });

        // Create HTTP link for queries and mutations
        const httpLink = new HttpLink({
            uri: `${this.baseUrl}/graphql`,
            headers: {
                'x-api-key': this.apiToken,
            },
            fetch: customFetch,
        });

        // Create WebSocket link for subscriptions
        const wsLink = new GraphQLWsLink(this.wsClient);

        // Split link based on operation type
        const splitLink = split(
            ({ query }) => {
                const definition = getMainDefinition(query);
                return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
            },
            wsLink,
            httpLink,
        );

        // Create Apollo Client
        this.client = new ApolloClient({
            link: splitLink,
            cache: new InMemoryCache(),
            defaultOptions: {
                watchQuery: {
                    fetchPolicy: 'no-cache',
                },
                query: {
                    fetchPolicy: 'no-cache',
                },
            },
        });
    }

    /**
     * Execute a GraphQL query against the Unraid server
     *
     * @param query - The GraphQL query string
     * @returns Promise resolving to the query result data
     * @template T - Type of the expected query result
     */
    async query<T = unknown>(query: string): Promise<T> {
        const result = await this.client.query<T>({
            query: gql(query),
        });
        return result.data as T;
    }

    /**
     * Execute a GraphQL mutation against the Unraid server
     *
     * @param mutation - The GraphQL mutation string
     * @param variables - Optional variables for the mutation
     * @returns Promise resolving to the mutation result data
     * @template T - Type of the expected mutation result
     */
    async mutate<T = unknown>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
        try {
            const result = await this.client.mutate<T>({
                mutation: gql(mutation),
                variables,
            });
            return result.data as T;
        } catch (error: any) {
            // Log more details about GraphQL errors
            if (error.graphQLErrors?.length > 0) {
                this.logger.error(`GraphQL Errors in mutation: ${JSON.stringify(error.graphQLErrors, null, 2)}`);
            }
            if (error.networkError) {
                this.logger.error(`Network Error in mutation: ${error.networkError.message}`);
                if (error.networkError.result) {
                    this.logger.debug(`Server Response: ${JSON.stringify(error.networkError.result, null, 2)}`);
                }
            }
            throw error;
        }
    }

    /**
     * Subscribe to a GraphQL subscription for real-time updates
     *
     * @param subscription - The GraphQL subscription string
     * @param variables - Optional variables for the subscription
     * @returns Observable that emits subscription results
     * @template T - Type of the expected subscription result
     */
    subscribe<T = unknown>(
        subscription: string,
        variables?: Record<string, unknown>,
    ): ReturnType<typeof this.client.subscribe<T>> {
        return this.client.subscribe<T>({
            query: gql(subscription),
            variables,
        });
    }

    /**
     * Probe the Unraid GraphQL schema for optional features.
     * Falls back to "all enabled" on errors so established installations
     * do not lose functionality if introspection is rate-limited or blocked.
     *
     * @returns Promise resolving to detected capability flags
     */
    async introspectCapabilities(): Promise<Capabilities> {
        const probeQuery = `
            query UnraidCapabilityProbe {
                metricsType: __type(name: "Metrics") { fields { name } }
                dockerType: __type(name: "Docker") { fields { name } }
                dockerContainerType: __type(name: "DockerContainer") { fields { name } }
                dockerMutationsType: __type(name: "DockerMutations") { fields { name } }
            }
        `;

        try {
            type ProbeResult = {
                metricsType?: { fields?: Array<{ name: string }> } | null;
                dockerType?: { fields?: Array<{ name: string }> } | null;
                dockerContainerType?: { fields?: Array<{ name: string }> } | null;
                dockerMutationsType?: { fields?: Array<{ name: string }> } | null;
            };

            const result = await this.query<ProbeResult>(probeQuery);
            const has = (fields: Array<{ name: string }> | undefined, name: string): boolean =>
                Array.isArray(fields) && fields.some(f => f.name === name);

            const metricsFields = result?.metricsType?.fields;
            const dockerFields = result?.dockerType?.fields;
            const containerFields = result?.dockerContainerType?.fields;
            const mutationFields = result?.dockerMutationsType?.fields;

            const capabilities: Capabilities = {
                temperatureMetrics: has(metricsFields, 'temperature'),
                dockerUpdateFlag: has(containerFields, 'isUpdateAvailable'),
                dockerContainerUpdateStatuses: has(dockerFields, 'containerUpdateStatuses'),
                dockerPause: has(mutationFields, 'pause'),
                dockerUnpause: has(mutationFields, 'unpause'),
                dockerUpdate: has(mutationFields, 'updateContainer'),
            };

            this.logger.info(
                `Unraid capabilities: temperature=${capabilities.temperatureMetrics}, ` +
                    `dockerUpdateFlag=${capabilities.dockerUpdateFlag}, ` +
                    `dockerUpdateStatuses=${capabilities.dockerContainerUpdateStatuses}, ` +
                    `pause=${capabilities.dockerPause}, unpause=${capabilities.dockerUnpause}, ` +
                    `update=${capabilities.dockerUpdate}`,
            );
            return capabilities;
        } catch (error) {
            this.logger.warn(
                `Capability introspection failed, assuming all features are available: ${error instanceof Error ? error.message : String(error)}`,
            );
            return allCapabilitiesEnabled();
        }
    }

    /**
     * Run an introspection query to discover available GraphQL subscriptions.
     * Useful for debugging and discovering the Unraid API schema.
     *
     * @returns Promise resolving to subscription type information or null if failed
     */
    async introspectSubscriptions(): Promise<unknown> {
        const introspectionQuery = `
            query IntrospectionQuery {
                __schema {
                    subscriptionType {
                        name
                        fields {
                            name
                            description
                            args {
                                name
                                type {
                                    name
                                    kind
                                }
                            }
                            type {
                                name
                                kind
                            }
                        }
                    }
                }
            }
        `;

        try {
            const result = await this.query<{ __schema?: { subscriptionType?: unknown } }>(introspectionQuery);
            return result?.__schema?.subscriptionType;
        } catch (error) {
            this.logger.warn(`Failed to introspect subscriptions: ${error}`);
            return null;
        }
    }

    /**
     * Dispose the client and close all connections.
     * Should be called when the client is no longer needed.
     *
     * @returns Promise that resolves when cleanup is complete
     */
    async dispose(): Promise<void> {
        this.client.stop();
        await this.wsClient.dispose();
    }

    /**
     * Check if the WebSocket connection is established
     *
     * @returns True if WebSocket client exists, false otherwise
     */
    isConnected(): boolean {
        // This is a simplified check - you might want to implement more sophisticated logic
        return this.wsClient !== null;
    }
}

/**
 * GraphQL subscription for comprehensive system metrics.
 * Includes both CPU and memory statistics.
 */
export const METRICS_SUBSCRIPTION = `
    subscription MetricsSubscription {
        metrics {
            cpu {
                percentTotal
            }
            memory {
                percentTotal
                total
                used
                free
            }
        }
    }
`;

/**
 * GraphQL subscription for CPU metrics only.
 * Returns the total CPU usage percentage.
 */
export const CPU_SUBSCRIPTION = `
    subscription CpuSubscription {
        cpu {
            percentTotal
        }
    }
`;

/**
 * GraphQL subscription for memory metrics.
 * Includes total, used, free memory and usage percentage.
 */
export const MEMORY_SUBSCRIPTION = `
    subscription MemorySubscription {
        memory {
            percentTotal
            total
            used
            free
        }
    }
`;
