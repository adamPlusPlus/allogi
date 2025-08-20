# Allogi

A complete standalone logging system with separated components for cross-platform log collection and viewing.

## Architecture

The system is designed with complete separation of concerns:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Device A      │    │    Device B      │    │   Device C      │
│                 │    │                  │    │                 │
│ App with        │───▶│ Intermediary     │◀───│ React Viewer    │
│ Allog Client    │    │ Server           │    │ App             │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components

### 1. Server (`/server`)
- **Purpose**: Central intermediary server that receives and stores logs
- **Files**: 
  - `intermediary-server.js` - Main server implementation
  - `package.json` - Server dependencies
- **Port**: 3002 (configurable)
- **Features**:
  - HTTP REST API for log submission
  - WebSocket for real-time streaming
  - Persistent storage
  - Rate limiting
  - Source registration

### 2. Client (`/client`)
- **Purpose**: Universal client library for any application to send logs
- **Files**:
  - `allog-client.js` - Universal client library
  - `test-client.js` - Example usage and testing
  - `package.json` - Client dependencies
- **Features**:
  - Simple API for logging
  - Automatic batching
  - Retry logic
  - WebSocket and HTTP transport

### 3. Viewer App (`/viewer-app`)
- **Purpose**: Standalone React application for viewing logs
- **Files**:
  - `src/` - React source code
  - `public/` - Static assets
  - `package.json` - React app dependencies
- **Port**: 3001 (configurable)
- **Features**:
  - Real-time log display
  - Filtering and search
  - Source management
  - Export capabilities

## Quick Start

### Option 1: Start Everything Together
```bash
cd lib/allogi
npm run install-all
npm start
```

### Option 2: Start Components Separately

**Start the intermediary server:**
```bash
cd lib/allogi/server
npm install
npm start
```

**Start the viewer app:**
```bash
cd lib/allogi/viewer-app
npm install
npm start
```

**Test the client:**
```bash
cd lib/allogi/client
npm test
```

## Configuration

### Environment Variables

**Server Configuration:**
- `ALLOG_PORT` - Server port (default: 3002)
- `ALLOG_MAX_LOGS` - Maximum logs to store (default: 10000)
- `ALLOG_WS` - Enable WebSocket (default: true)
- `ALLOG_PERSIST` - Enable persistence (default: true)
- `ALLOG_PERSIST_FILE` - Persistence file path (default: ./allog-data.json)
- `ALLOG_RATE_LIMIT` - Rate limit per minute (default: 1000)

**Viewer Configuration:**
- `ALLOG_VIEWER_PORT` - Viewer port (default: 3001)
- `ALLOG_INTERMEDIARY_URL` - Intermediary server URL (default: http://localhost:3002)
- `ALLOG_VIEWER_WS` - Enable WebSocket in viewer (default: true)

## Usage Examples

### Using the Client Library

```javascript
const AllogClient = require('./client/allog-client.js');

const client = new AllogClient({
  serverUrl: 'http://localhost:3002',
  sourceId: 'my-app',
  sourceType: 'web-app'
});

await client.init();

// Log messages
client.info('Application started');
client.warn('High memory usage detected');
client.error('Failed to connect to database', { retryCount: 3 });

// Log with structured data
client.log('User action', 'info', {
  userId: 123,
  action: 'login',
  timestamp: new Date()
});
```

### API Endpoints

**Server API (Port 3002):**
- `POST /api/register` - Register a new source
- `POST /api/logs` - Send single log
- `POST /api/logs/batch` - Send batch of logs
- `GET /api/logs` - Retrieve logs
- `GET /api/status` - Server status
- `GET /api/sources` - List sources
- `DELETE /api/logs` - Clear logs
- `GET /api/export` - Export logs

**WebSocket (Port 3002):**
- Connect to `ws://localhost:3002/ws`
- Receive real-time log updates

## Deployment

### Standalone Deployment

Each component can be deployed independently:

1. **Server**: Deploy to any Node.js hosting (Heroku, AWS, etc.)
2. **Viewer**: Build and deploy to any static hosting (Netlify, Vercel, etc.)
3. **Client**: Include in any application (browser, Node.js, etc.)

### Docker Deployment

```dockerfile
# Server
FROM node:16-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ .
EXPOSE 3002
CMD ["node", "intermediary-server.js"]
```

### Production Considerations

- Use HTTPS for all communications
- Implement proper authentication
- Set up monitoring and logging
- Configure appropriate rate limits
- Use a production database instead of file storage
- Set up proper CORS policies

## Development

### Project Structure
```
lib/allogi/
├── server/                 # Intermediary server
│   ├── intermediary-server.js
│   └── package.json
├── client/                 # Universal client library
│   ├── allog-client.js
│   ├── test-client.js
│   └── package.json
├── viewer-app/             # React viewer application
│   ├── src/
│   ├── public/
│   └── package.json
├── start-allog.js          # Startup script
├── package.json            # Main package.json
└── README.md               # This file
```

### Contributing

1. Each component is independent and can be developed separately
2. Follow the existing code style and patterns
3. Test changes in the integrated system
4. Update documentation as needed

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports via environment variables
2. **CORS errors**: Ensure proper CORS configuration on server
3. **WebSocket connection issues**: Check firewall and proxy settings
4. **Memory issues**: Adjust `ALLOG_MAX_LOGS` setting

### Logs

- Server logs are output to console
- Viewer logs are in browser console
- Client logs are in application console

## License

MIT License - see LICENSE file for details.
