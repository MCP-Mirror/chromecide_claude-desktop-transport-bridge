import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Logger } from './logger.js';

import { 
    ServerNotification,
    ServerRequest,
    ServerResult,
    ClientRequest,
    ClientNotification,
    ClientResult,
    Implementation,
    ServerCapabilities,
    CallToolRequest,
    CallToolRequestSchema,
    SubscribeRequest,
    SubscribeRequestSchema,
    ResourceUpdatedNotification,
    ReadResourceRequest,
    ReadResourceRequestSchema,
    ListToolsRequest,
    ListToolsRequestSchema,
    ListResourcesRequest,
    ListResourcesRequestSchema,
    ResourceUpdatedNotificationSchema,
    ResourceListChangedNotificationSchema,
    ToolListChangedNotificationSchema,
    Request,
    Notification,
    Result,
    JSONRPCMessage
} from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { TransportWrapper, BridgeType } from './transport-wrapper.js';

// Define implementation info
const bridgeInfo: Implementation = {
    name: "Claude MCP Bridge",
    version: "1.0.0"
};

// Define capabilities
const capabilities: ServerCapabilities = {
    tools: {
        listChanged: true
    },
    resources: {
        subscribe: true,
        listChanged: true
    },
    prompts: {
        listChanged: true
    },
    logging: {},
    experimental: {
        vscode: {
            textDocument: true,
            workspace: true,
            languages: true
        }
    }
};

interface ErrorWithDetails extends Error {
    code?: string | number;
    details?: unknown;
}

/**
 * Bridge class to handle stdio-to-SSE communication
 */
export class MCPBridge {
    private stdioServer: Server;
    private bridgeClient: Client;
    private clientTransport: Transport;
    private resourceSubscriptions: Map<string, string> = new Map();
    private logger: Logger;

    constructor(bridgeType: BridgeType, bridgeArgs: any) {
        this.logger = Logger.getInstance();
        this.logger.info("Initializing Bridge");
        // Initialize stdio server
        this.stdioServer = new Server(bridgeInfo, {
            capabilities
        });
        this.logger.info("Initialized stdio server");

        // Initialize SSE client
        this.bridgeClient = new Client(bridgeInfo, {
            capabilities: {
                tools: {},
                resources: {
                    subscribe: true
                },
                prompts: {},
                logging: {},
                experimental: {
                    vscode: {
                        textDocument: true,
                        workspace: true,
                        languages: true
                    }
                }
            }
        });
        this.logger.info("Initialized client");
        try{
            this.clientTransport = new TransportWrapper(bridgeType, bridgeArgs);
            this.logger.info("Initialized transport");
        }catch(e){
            this.logger.error("Error initializing transport", e);
            throw e;
        }
        this.setupEventHandlers();
    }

    private setupEventHandlers() {
        // Handle tool calls
        this.stdioServer.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
            try {
                this.logger.debug('Tool call request received:', request);
                return await this.bridgeClient.callTool(request.params);
            } catch (error) {
                this.logger.error('Tool call error:', error);
                throw error;
            }
        });

        // Handle resource subscriptions
        this.stdioServer.setRequestHandler(SubscribeRequestSchema, async (request: SubscribeRequest) => {
            try {
                const result = await this.bridgeClient.subscribeResource(request.params);
                this.resourceSubscriptions.set(request.params.uri, request.params.uri);
                this.logger.debug('Resource subscribed:', request.params.uri);
                return result;
            } catch (error) {
                this.logger.error('Resource subscription error:', error);
                throw error;
            }
        });

        // Handle resource reads
        this.stdioServer.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
            try {
                return await this.bridgeClient.readResource(request.params);
            } catch (error) {
                this.logger.error('Resource read error:', error);
                throw error;
            }
        });

        // Handle listing tools
        this.stdioServer.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
            try {
                return await this.bridgeClient.listTools(request.params);
            } catch (error) {
                this.logger.error('List tools error:', error);
                throw error;
            }
        });

        // Handle listing resources
        this.stdioServer.setRequestHandler(ListResourcesRequestSchema, async (request: ListResourcesRequest) => {
            try {
                return await this.bridgeClient.listResources(request.params);
            } catch (error) {
                this.logger.error('List resources error:', error);
                throw error;
            }
        });

        // Forward resource update notifications
        this.bridgeClient.setNotificationHandler(ResourceUpdatedNotificationSchema, 
            async (notification: ResourceUpdatedNotification) => {
                try {
                    await this.stdioServer.sendResourceUpdated(notification.params);
                } catch (error) {
                    this.logger.error('Resource update notification error:', error);
                }
            }
        );

        // Forward resource list changed notifications
        this.bridgeClient.setNotificationHandler(ResourceListChangedNotificationSchema, 
            async () => {
                try {
                    await this.stdioServer.sendResourceListChanged();
                } catch (error) {
                    this.logger.error('Resource list changed notification error:', error);
                }
            }
        );

        // Forward tool list changed notifications
        this.bridgeClient.setNotificationHandler(ToolListChangedNotificationSchema,
            async () => {
                try {
                    await this.stdioServer.sendToolListChanged();
                } catch (error) {
                    this.logger.error('Tool list changed notification error:', error);
                }
            }
        );
    }

    async start() {
        try {
            

            // Connect to SSE server using the wrapper
            
            //const sseTransport = new TransportWrapper(new URL('http://localhost:8808/'));
            await this.bridgeClient.connect(this.clientTransport);
            this.logger.debug('Connected to SSE server');

            // Start stdio server
            const stdioTransport = new StdioServerTransport();
            await this.stdioServer.connect(stdioTransport);
            this.logger.debug('Stdio server started');

            // Log server capabilities
            const serverCapabilities = this.bridgeClient.getServerCapabilities();
            this.logger.debug('SSE Server capabilities:', serverCapabilities);
        } catch (error) {
            this.logger.error('Failed to start bridge:', {
                name: error instanceof Error ? error.name : 'Unknown Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                error: error
            });
            process.exit(1);
        }
    }

    async stop() {
        try {
            // Unsubscribe from all resources
            for (const [uri] of this.resourceSubscriptions) {
                await this.bridgeClient.unsubscribeResource({ uri });
                this.logger.debug('Unsubscribed from resource:', uri);
            }
            this.resourceSubscriptions.clear();

            // Close connections
            await this.bridgeClient.close();
            await this.stdioServer.close();
            this.logger.debug('Bridge stopped successfully');
        } catch (error) {
            this.logger.error('Error during shutdown:', {
                name: error instanceof Error ? error.name : 'Unknown Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                error: error
            });
        }
    }
}