# Allog Server Connection Guide

This guide explains how to connect your application to the Allog Intermediary Server for centralized logging and monitoring.

## 🚀 Quick Start

The Allog server is running on **port 3002** and provides a simple REST API for sending logs and retrieving data.

### Basic Connection

```bash
# Test server connection
curl http://localhost:3002/

# Expected response:
{
  "service": "Allog Intermediary Server",
  "version": "1.0.0",
  "status": "running",
  "sources": 0,
  "logs": 0,
  "connections": 0
}
```

## 📡 API Endpoints

### 1. Send Logs - POST `/logs`

The main endpoint for sending logs from your application.

#### Structured Logs
```bash
curl -X POST http://localhost:3002/logs \
  -H "Content-Type: application/json" \
  -H "X-Source-ID: your-app-name" \
  -d '{
    "message": "User login successful",
    "level": "info",
    "scriptId": "auth-service",
    "userId": 123,
    "action": "login"
  }'
```

#### Text Logs
```bash
curl -X POST http://localhost:3002/logs \
  -H "Content-Type: application/json" \
  -H "X-Source-ID: your-app-name" \
  -d '{
    "text": "Simple text message",
    "level": "warn"
  }'
```

#### Raw Text
```bash
curl -X POST http://localhost:3002/logs \
  -H "Content-Type: text/plain" \
  -H "X-Source-ID: your-app-name" \
  -d "Raw text log entry"
```

### 2. Retrieve Logs - GET `/logs`

Get logs with optional filtering and pagination.

```bash
# Get all logs (default limit: 100)
curl http://localhost:3002/logs

# Get logs with pagination
curl "http://localhost:3002/logs?limit=50&offset=100"

# Filter by level
curl "http://localhost:3002/logs?level=error"

# Filter by source
curl "http://localhost:3002/logs?sourceId=your-app-name"

# Filter by script
curl "http://localhost:3002/logs?scriptId=auth-service"
```

### 3. Clear Logs - DELETE `/logs`

Clear all logs and reset the server state.

```bash
curl -X DELETE http://localhost:3002/logs
```

## 🔧 Client Implementation Examples

### Node.js Client

```javascript
class AllogClient {
  constructor(serverUrl = 'http://localhost:3002', sourceId = 'default-app') {
    this.serverUrl = serverUrl;
    this.sourceId = sourceId;
  }

  async sendLog(message, level = 'info', additionalData = {}) {
    const logEntry = {
      message,
      level,
      scriptId: 'main',
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    const response = await fetch(`${this.serverUrl}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-ID': this.sourceId
      },
      body: JSON.stringify(logEntry)
    });

    return response.json();
  }

  async getLogs(limit = 100, offset = 0) {
    const response = await fetch(
      `${this.serverUrl}/logs?limit=${limit}&offset=${offset}`
    );
    return response.json();
  }

  async clearLogs() {
    const response = await fetch(`${this.serverUrl}/logs`, {
      method: 'DELETE'
    });
    return response.json();
  }
}

// Usage
const client = new AllogClient('http://localhost:3002', 'my-application');

// Send a log
await client.sendLog('User action completed', 'info', { userId: 123 });

// Get logs
const logs = await client.getLogs(50, 0);
console.log(`Retrieved ${logs.logs.length} logs`);
```

### Python Client

```python
import requests
import json
from datetime import datetime

class AllogClient:
    def __init__(self, server_url="http://localhost:3002", source_id="default-app"):
        self.server_url = server_url
        self.source_id = source_id
        self.headers = {
            'Content-Type': 'application/json',
            'X-Source-ID': source_id
        }
    
    def send_log(self, message, level="info", **additional_data):
        log_entry = {
            "message": message,
            "level": level,
            "scriptId": "main",
            "timestamp": datetime.utcnow().isoformat(),
            **additional_data
        }
        
        response = requests.post(
            f"{self.server_url}/logs",
            headers=self.headers,
            json=log_entry
        )
        
        return response.json()
    
    def get_logs(self, limit=100, offset=0):
        params = {"limit": limit, "offset": offset}
        response = requests.get(f"{self.server_url}/logs", params=params)
        return response.json()
    
    def clear_logs(self):
        response = requests.delete(f"{self.server_url}/logs")
        return response.json()

# Usage
client = AllogClient("http://localhost:3002", "my-python-app")

# Send a log
result = client.send_log("Database connection established", "info", db_host="localhost")

# Get logs
logs = client.get_logs(limit=50)
print(f"Retrieved {len(logs['logs'])} logs")
```

### JavaScript/TypeScript Client

```typescript
interface LogEntry {
  message: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  scriptId?: string;
  timestamp?: string;
  [key: string]: any;
}

class AllogClient {
  private serverUrl: string;
  private sourceId: string;

  constructor(serverUrl: string = 'http://localhost:3002', sourceId: string = 'default-app') {
    this.serverUrl = serverUrl;
    this.sourceId = sourceId;
  }

  async sendLog(logEntry: LogEntry): Promise<any> {
    const response = await fetch(`${this.serverUrl}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-ID': this.sourceId
      },
      body: JSON.stringify({
        ...logEntry,
        timestamp: logEntry.timestamp || new Date().toISOString()
      })
    });

    return response.json();
  }

  async getLogs(limit: number = 100, offset: number = 0): Promise<any> {
    const response = await fetch(
      `${this.serverUrl}/logs?limit=${limit}&offset=${offset}`
    );
    return response.json();
  }

  async clearLogs(): Promise<any> {
    const response = await fetch(`${this.serverUrl}/logs`, {
      method: 'DELETE'
    });
    return response.json();
  }
}

// Usage
const client = new AllogClient('http://localhost:3002', 'my-typescript-app');

// Send a log
await client.sendLog({
  message: 'API request processed',
  level: 'info',
  scriptId: 'api-gateway',
  requestId: 'req-123',
  responseTime: 150
});
```

## 🏷️ Headers

### Required Headers

- **X-Source-ID**: Unique identifier for your application/source
- **Content-Type**: `application/json` for structured data, `text/plain` for raw text

### Optional Headers

- **User-Agent**: Your application identifier
- **Authorization**: For future authentication features

## 📊 Log Entry Structure

### Standard Fields

```json
{
  "message": "Log message text",
  "level": "info",
  "scriptId": "service-name",
  "timestamp": "2025-08-28T20:26:54.372Z"
}
```

### Additional Fields

You can include any additional fields in your log entries:

```json
{
  "message": "User action completed",
  "level": "info",
  "scriptId": "user-service",
  "userId": 123,
  "action": "profile_update",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "sessionId": "sess-abc123",
    "requestId": "req-def456"
  }
}
```

## 🔍 Log Levels

Supported log levels:
- `debug` - Detailed debugging information
- `info` - General information messages
- `warn` - Warning messages
- `error` - Error messages

## 🚦 Rate Limiting

The server implements rate limiting to prevent abuse:
- Default limit: 1000 requests per minute per source
- Configurable via server configuration
- Rate limit headers included in responses

## 🔐 Security Considerations

- The server currently accepts connections from any origin (CORS enabled)
- Consider implementing authentication for production use
- Use HTTPS in production environments
- Validate and sanitize log data on the client side

## 📱 WebSocket Support

For real-time logging, the server also supports WebSocket connections:

```javascript
const ws = new WebSocket('ws://localhost:3002');

ws.onopen = () => {
  console.log('Connected to Allog server');
  
  // Send log via WebSocket
  ws.send(JSON.stringify({
    type: 'log',
    data: {
      message: 'Real-time log entry',
      level: 'info'
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

## 🧪 Testing

Use the included test client to verify your connection:

```bash
cd server
node test-client.js
```

This will run a comprehensive test of all endpoints and demonstrate proper usage.

## 🆘 Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure the server is running on port 3002
2. **404 Not Found**: Check that you're using the correct endpoint (`/logs`, not `/api/logs`)
3. **Rate Limited**: Reduce the frequency of your requests
4. **Invalid JSON**: Ensure your request body is valid JSON

### Debug Mode

Enable debug logging by setting the environment variable:
```bash
DEBUG=allog:* node intermediary-server.js
```

## 📚 Additional Resources

- Server configuration: `config.json`
- Advanced API endpoints: `/api/logs/*`
- Health monitoring: `/health`
- Metrics: `/metrics`
- Server logs: Check console output

## 🤝 Support

For issues or questions:
1. Check the server logs for error details
2. Verify your request format matches the examples
3. Test with the provided test client
4. Review the server configuration

---

**Happy Logging! 🎉**
