# Claude Desktop Transport Bridge

A transport bridge for Claude Desktop that supports both SSE and WebSocket connections.

## Installation

Install globally from GitHub:

```bash
npm install -g github:chromecide/claude-desktop-transport-bridge
```

## Usage

For SSE connections:
```bash
claude-bridge SSE '{"url": "your-sse-url-here"}'
```

For WebSocket connections:
```bash
claude-bridge WEBSOCKET '{"url": "your-websocket-url-here"}'
```

## Requirements

- Node.js >= 20.0.0
- npm

## Development

1. Clone the repository:
```bash
git clone https://github.com/chromecide/claude-desktop-transport-bridge.git
cd claude-desktop-transport-bridge
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. For development with watch mode:
```bash
npm run watch
```

## License

MIT