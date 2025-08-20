# 📊 Data Management Interface Guide

## Overview

The Allog viewer now includes a comprehensive data management interface accessible through the **Settings** button in the main viewer. This interface provides full control over all data management optimizations previously only available via CLI.

## 🗂️ **Accessing the Interface**

1. **Open the Allog viewer** (http://localhost:3001)
2. **Click the ⚙️ Settings button** in the top right
3. **Navigate between tabs** for different management options

---

## 🗄️ **Database Tab**

### **View Current Configuration**
- **Backend Type**: FILE / SQLITE / POSTGRESQL  
- **Connection Status**: Connected/Disconnected indicators
- **Capabilities**: Shows available features (indexed queries, transactions, advanced filtering)

### **Database Statistics**
- **Total Logs**: Current log count
- **Monitoring Entries**: Variable/state tracking entries  
- **Data Sources**: Number of connected applications
- **Index Sizes**: Memory index optimization stats

### **Database Types Supported**
| Type | Performance | Features | Setup Required |
|------|------------|----------|----------------|
| **FILE** | Good for <10K logs | Simple JSON storage | None (default) |
| **SQLITE** | Good for <1M logs | ACID, indexes, WAL mode | `npm install sqlite3` |
| **POSTGRESQL** | Good for >1M logs | Enterprise features, JSONB | Database setup required |

---

## 📁 **Archives Tab**

### **Manual Log Rotation**
- **🔄 Trigger Log Rotation** button
- Manually archive current logs and start fresh
- Useful for creating clean snapshots

### **Archive Management**
- **View all archive files** with creation dates and sizes
- **📥 Download archives** individually
- **Archive directory location** and total size information

### **Archive File Format**
Archives contain:
```json
{
  "metadata": {
    "archivedAt": "2025-01-17T12:00:00Z",
    "rotationInterval": "daily",
    "originalLogCount": 15420
  },
  "logs": [...],
  "monitoringData": [...],
  "sources": [...]
}
```

---

## 🔧 **Maintenance Tab**

### **Data Export Options**

#### **Export Logs**
- **JSON Format**: Full structured data
- **CSV Format**: Spreadsheet-compatible

#### **Export Monitoring Data**  
- **JSON Format**: Complete variable/state tracking
- **CSV Format**: Tabular monitoring data

#### **Full System Backup**
- **📦 Complete Backup**: Everything in one file
- Includes logs, monitoring, sources, and configuration
- Perfect for system migration or disaster recovery

### **System Overview**
- **Database Summary**: Current data volumes
- **Archive Summary**: Historical data storage
- **Real-time Statistics**: Updated automatically

---

## 📊 **Recipients Tab**

### **Active Data Sources**
- **View all connected applications** sending data to Allog
- **Status indicators**: 🟢 Active / ⚪ Inactive / 🔴 Error
- **Log counts and activity** for each source
- **Save logs directories** for each recipient

### **Source Types**
- **🖥️ Server**: Backend services
- **📱 Client**: Frontend applications  
- **✨ Feature**: Specific features (FormHub, ClauseSight)
- **📚 Library**: Shared libraries and utilities

---

## 🚀 **Advanced Features**

### **Automatic Processes**
All running in the background:
- **Memory Cleanup**: Every 5 minutes
- **Log Rotation**: Based on configured interval (daily/weekly/monthly)
- **Index Rebuilding**: When fragmentation detected
- **Archive Cleanup**: Removes old archives beyond retention limit

### **Performance Optimization**
- **Real-time Indexing**: Fast searches and filtering
- **Memory Management**: Automatic cleanup of old data
- **Database Optimization**: Leverages SQL indexes when available
- **Compression**: Archive files are compressed for space savings

### **Data Retention Policies**
Configurable in `server/config.json`:
```json
{
  "retentionHours": {
    "logs": 24,        // Keep logs for 24 hours
    "monitoring": 48,  // Keep monitoring for 48 hours  
    "sources": 12      // Keep source info for 12 hours
  }
}
```

---

## 🔧 **Configuration Management**

### **Server Configuration**
Update `lib/allogi/server/config.json`:

```json
{
  "storage": {
    "backend": {
      "type": "sqlite",  // file | sqlite | postgresql
      "options": {
        "sqlite": {
          "filename": "./allog-data.db",
          "enableWAL": true
        }
      }
    },
    "rotation": {
      "enabled": true,
      "rotationInterval": "daily",  // hourly | daily | weekly | monthly
      "maxArchiveFiles": 30
    }
  }
}
```

### **Viewer Settings**
- **Auto-refresh**: Enable/disable automatic data updates
- **Refresh Interval**: Configure update frequency
- **Notification Settings**: Success/error message display

---

## 🎯 **Use Cases**

### **Development**
- Monitor application logs in real-time
- Export specific data for debugging
- Archive logs before major deployments

### **Production**
- Set up PostgreSQL for high-volume logging
- Configure automatic log rotation
- Export backups for compliance

### **Testing**
- Clear logs between test runs
- Export test results as CSV
- Monitor variable changes during tests

### **Maintenance**
- Regular system backups
- Database optimization monitoring
- Archive management and cleanup

---

## ⚡ **Quick Actions**

| Task | Steps |
|------|-------|
| **Backup everything** | Settings → Maintenance → 📦 Complete Backup |
| **Clear current logs** | Settings → Archives → 🔄 Trigger Log Rotation |
| **Switch to SQLite** | Update config.json → Restart server |
| **Download archive** | Settings → Archives → 📥 Download |
| **Export for Excel** | Settings → Maintenance → CSV export |
| **Check database stats** | Settings → Database → View statistics |

---

## 🔍 **Troubleshooting**

### **Database Connection Issues**
1. Check **Database tab** for connection status
2. Verify database dependencies are installed
3. Check server logs for detailed errors

### **Archive Management**
1. Ensure archive directory permissions
2. Check available disk space
3. Monitor rotation frequency vs. data volume

### **Performance Issues**
1. Review **Database Statistics** for data volumes
2. Consider upgrading to SQLite/PostgreSQL
3. Adjust retention policies to reduce memory usage

---

**All data management operations are now accessible through the intuitive viewer interface! 🎉**
