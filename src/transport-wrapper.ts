import  EventSource  from 'eventsource';

(global as any).EventSource = EventSource;

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "./logger.js";

export enum BridgeType {
    SSE = 'SSE',
    WEBSOCKET = 'WEBSOCKET'
}

/**
 * Custom transport wrapper to handle message translation
 */
export class TransportWrapper implements Transport {
    private transport: Transport;
    private logger: Logger;
    
    constructor(bridgeType: BridgeType, params: any) {

        this.logger = Logger.getInstance();
        this.logger.debug("Initializing TransportWrapper", params);
        if(bridgeType === BridgeType.SSE) {
            this.transport = new SSEClientTransport(new URL(params.url));
        } else if(bridgeType === BridgeType.WEBSOCKET) {
            this.transport = new WebSocketClientTransport(new URL(params.url));
        }else{
            throw new Error("Invalid bridge type");
        }
    }

    async start(): Promise<void> {
        try {
            this.logger.debug('Starting TransportWrapper...');
            await this.transport.start();
            this.logger.debug('TransportWrapper started successfully');
        } catch (error) {
            this.logger.error('Failed to start TransportWrapper. Error details:', {
                name: error instanceof Error ? error.name : 'Unknown Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                error: error
            });
            throw error;
        }
    }

    async close(): Promise<void> {
        try {
            this.logger.debug('Closing TransportWrapper...');
            await this.transport.close();
            this.logger.debug('TransportWrapper closed successfully');
        } catch (error) {
            this.logger.error('Failed to close TransportWrapper. Error details:', {
                name: error instanceof Error ? error.name : 'Unknown Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                error: error
            });
            throw error;
        }
    }

    async send(message: JSONRPCMessage): Promise<void> {
        try {
            const translatedMessage = this.translateOutgoing(message);
            this.logger.debug('Sending translated message:', translatedMessage);
            await this.transport.send(translatedMessage);
        } catch (error) {
            this.logger.error('Failed to send message. Error details:', {
                name: error instanceof Error ? error.name : 'Unknown Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                error: error,
                originalMessage: message
            });
            throw error;
        }
    }

    set onmessage(handler: ((message: JSONRPCMessage) => void) | undefined) {
        if (handler) {
            this.transport.onmessage = (message: JSONRPCMessage) => {
                try {
                    const translatedMessage = this.translateIncoming(message);
                    this.logger.debug('Received translated message:', translatedMessage);
                    handler(translatedMessage);
                } catch (error) {
                    this.logger.error('Error in onmessage handler. Error details:', {
                        name: error instanceof Error ? error.name : 'Unknown Error',
                        message: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : 'No stack trace',
                        error: error,
                        originalMessage: message
                    });
                }
            };
        } else {
            this.transport.onmessage = undefined;
        }
    }

    set onclose(handler: (() => void) | undefined) {
        if (handler) {
            this.transport.onclose = () => {
                this.logger.debug('Transport closed');
                handler();
            };
        } else {
            this.transport.onclose = undefined;
        }
    }

    set onerror(handler: ((error: Error) => void) | undefined) {
        if (handler) {
            this.transport.onerror = (error: Error) => {
                this.logger.error('Transport error. Error details:', {
                    name: error instanceof Error ? error.name : 'Unknown Error',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : 'No stack trace',
                    error: error
                });
                process.exit(1);
            };
        } else {
            this.transport.onerror = undefined;
        }
    }

    private translateIncoming(message: JSONRPCMessage): JSONRPCMessage {
        const translatedMessage = { ...message };

        if ('method' in translatedMessage && translatedMessage.params) {
            switch (translatedMessage.method) {
                case 'resource/updated':
                    if (typeof translatedMessage.params.content === 'string') {
                        translatedMessage.params.content = Buffer.from(
                            translatedMessage.params.content
                        ).toString('base64');
                    }
                    break;
            }
        }

        return translatedMessage;
    }

    private translateOutgoing(message: JSONRPCMessage): JSONRPCMessage {
        const translatedMessage = { ...message };

        if ('method' in translatedMessage && translatedMessage.params) {
            switch (translatedMessage.method) {
                case 'resource/read':
                case 'resource/subscribe':
                    if (typeof translatedMessage.params.uri === 'string') {
                        translatedMessage.params.uri = encodeURI(translatedMessage.params.uri);
                    }
                    break;
            }
        }

        return translatedMessage;
    }
}