# Allog Server - Quick Start

## 🚀 Connect to Allog Server

**Server URL:** `http://localhost:3002`

## 📡 Essential Endpoints

### Send Logs
```bash
POST /logs
Content-Type: application/json
X-Source-ID: your-app-name

{
  "message": "Your log message",
  "level": "info",
  "scriptId": "service-name"
}
```

### Get Logs
```bash
GET /logs
GET /logs?limit=50&offset=0
GET /logs?level=error
```

### Clear Logs
```bash
DELETE /logs
```

## 🔧 Quick Test

```bash
# Test connection
curl http://localhost:3002/

# Send a test log
curl -X POST http://localhost:3002/logs \
  -H "Content-Type: application/json" \
  -H "X-Source-ID: test-app" \
  -d '{"message": "Hello Allog!", "level": "info"}'
```

## 📚 Full Documentation

See `CONNECTION_GUIDE.md` for complete examples in Node.js, Python, and TypeScript.

## 🧪 Test Client

Run the included test client:
```bash
cd server
node test-client.js
```

---

**That's it! Your app can now send logs to Allog! 🎉**
