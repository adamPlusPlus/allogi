# Allogi Raw Logs Guide

Allogi now supports accepting logs that are malformed, simple text, or don't follow the strict JSON format. This makes it much more robust for real-world scenarios where you might receive logs from various sources.

## 🆕 New Endpoints

### 1. Raw Logs (`/api/logs/raw`)
Accepts any data and automatically handles malformed or unstructured content.

```http
POST /api/logs/raw
Content-Type: application/json
X-Source-ID: my-app

# Any data structure - server will handle it gracefully
{
  "level": "debug",
  "data": { "someData": "test" }
  // Missing 'message' field - will create malformed log
}
```

### 2. Text Logs (`/api/logs/text`)
Accepts simple text messages with optional level.

```http
POST /api/logs/text
Content-Type: application/json
X-Source-ID: my-app

{
  "text": "This is a simple text log message",
  "level": "debug"
}
```

### 3. GET Text Logs (`GET /api/logs/text`)
Simple GET endpoint for basic integrations.

```http
GET /api/logs/text?text=Hello World&level=debug&source=my-app
```

## 🏷️ Quality Indicators

Logs are automatically categorized and marked with quality indicators:

- **📝 Raw Text** (`quality: 'raw-text'`): Simple text logs without structured data
- **⚠️ Malformed** (`quality: 'malformed'`): Logs that failed validation but were accepted
- **✅ Normal** (`quality: 'normal'`): Properly formatted structured logs

## 🔧 API Client Methods

```typescript
import { createAllogApiClient } from './lib/allog-api-client';

const client = createAllogApiClient('http://localhost:3002');

// Send raw data (handles malformed gracefully)
await client.sendRawLog({ level: 'debug', data: { test: true } });

// Send simple text
await client.sendTextLog('Simple message', 'debug');

// Send text via GET
await client.sendTextLogGet('GET message', 'debug', 'my-app');
```

## 💡 Use Cases

### Legacy System Integration
```javascript
// Old system that just outputs text
const oldLog = "ERROR: Database connection failed at 2025-08-16 19:00:00";

fetch('/api/logs/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: oldLog, level: 'error' })
});
```

### Malformed Data Handling
```javascript
// System that sometimes sends incomplete data
const incompleteLog = {
  level: 'debug',
  timestamp: new Date().toISOString()
  // Missing 'message' field
};

fetch('/api/logs/raw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(incompleteLog)
});
```

### Simple Text Logging
```bash
# From command line or scripts
curl "http://localhost:3002/api/logs/text?text=Server started&level=info&source=startup-script"
```

## 🧪 Testing

Run the test script to see all functionality in action:

```bash
cd lib/allogi
npm run test-raw-logs
```

This will send various types of logs including malformed ones, so you can see how they're handled in the viewer.

## 🎯 Benefits

1. **Robust Integration**: Accept logs from any source, even if malformed
2. **Graceful Degradation**: Malformed logs are still captured and displayed
3. **Visual Indicators**: Clear marking of log quality in the viewer
4. **Flexible Input**: Multiple ways to send logs (POST, GET, raw data)
5. **Backward Compatibility**: Existing structured logging continues to work

## 🔍 Viewer Display

In the Allogi viewer, logs are displayed with quality indicators:

- **Raw Text logs** show with an orange 📝 badge
- **Malformed logs** show with a red ⚠️ badge  
- **Normal logs** show without any quality badge

This makes it easy to identify which logs came from structured sources vs. raw text or malformed data.
