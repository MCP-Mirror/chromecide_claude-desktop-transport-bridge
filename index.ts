
import * as path from 'path';
import { setupGlobalLogger, Logger } from './logger.js';
import fetch from 'node-fetch';
import { MCPBridge } from './mcp-bridge.js';
import { BridgeType } from './transport-wrapper.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

// Setup the logger at the start
setupGlobalLogger({
    enabled: true,
    level: 'debug', // Set to 'error' in production
    outputFile: path.join(__dirname, './logs/claude-shim.log')
});

Logger.getInstance().info("Starting Claude Desktop Bridge");

//load the arguments from the command line
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: claude-desktop-bridge [SSE|WEBSOCKET] [json_stringified-args]");
    process.exit(1);
}

//parse the arguments
const bridgeType = args[0];
const bridgeArgsString = args[1];
if(bridgeArgsString === undefined) {
    console.error("Invalid arguments. Must provide bridge type and arguments as a JSON string.");
    process.exit(1);
}
const bridgeArgs = JSON.parse(bridgeArgsString);

//validate the arguments
if (bridgeType !== 'SSE' && bridgeType !== 'WEBSOCKET') {
    console.error("Invalid bridge type. Must be SSE or WEBSOCKET");
    process.exit(1);
}

if(bridgeType === 'SSE' && bridgeArgs.url === undefined) {
    console.error("Invalid arguments. Must provide a URL for the SSE bridge.");
    process.exit(1);
}

Logger.getInstance().info("BRIDGING TO", bridgeType, bridgeArgs);

// Make fetch available globally
(global as any).fetch = fetch;
(global as any).Headers = fetch.Headers;
(global as any).Request = fetch.Request;
(global as any).Response = fetch.Response;
//Logger.getInstance().debug("EventSource", EventSource);

Logger.getInstance().info("GLOBALS SET");

// Create and start the bridge
const bridge = new MCPBridge(BridgeType[bridgeType], bridgeArgs);
Logger.getInstance().info("Starting Bridge");
bridge.start();

// Handle cleanup
process.on('SIGINT', async () => {
    Logger.getInstance().info('Received SIGINT signal');
    await bridge.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    Logger.getInstance().info('Received SIGTERM signal');
    await bridge.stop();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    Logger.getInstance().error('Uncaught exception:', {
        name: error instanceof Error ? error.name : 'Unknown Error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        error: error
    });
    bridge.stop().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
    Logger.getInstance().error('Unhandled rejection:', {
        name: reason instanceof Error ? reason.name : 'Unknown Error',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : 'No stack trace',
        error: reason
    });
    bridge.stop().then(() => process.exit(1));
});