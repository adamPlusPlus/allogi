import React, { useState, useEffect } from 'react';
import { AllogApiClient, createAllogApiClient } from '../lib/allog-api-client';
import viewerConfig from '../config/config-loader';
import './ConnectionConfig.css';

interface ConnectionConfigProps {
  onConfigChange: (client: AllogApiClient) => void;
  currentClient: AllogApiClient;
}

export const ConnectionConfig: React.FC<ConnectionConfigProps> = ({
  onConfigChange,
  currentClient
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{ baseUrl: string; timeout: number; retries: number}>(() => ({
    baseUrl: viewerConfig.getServerUrl(),
    timeout: viewerConfig.connectionTimeout,
    retries: viewerConfig.connectionRetries
  }));
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');

  // Check connection status on mount and when config changes
  useEffect(() => {
    checkConnection();
  }, [config.baseUrl]);

  const checkConnection = async () => {
    setIsConnecting(true);
    setErrorMessage('');
    
    try {
      const testClient = createAllogApiClient(config.baseUrl);
      const isHealthy = await testClient.healthCheck();
      
      if (isHealthy) {
        setConnectionStatus('connected');
        setErrorMessage('');
      } else {
        setConnectionStatus('error');
        setErrorMessage('Server responded but health check failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSave = () => {
    const newClient = createAllogApiClient(config.baseUrl);
    onConfigChange(newClient);
    setIsOpen(false);
  };

  const handleReset = () => {
    setConfig(currentClient.getConfig());
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return viewerConfig.getStatusColor('connected');
      case 'error': return viewerConfig.getStatusColor('error');
      default: return viewerConfig.getStatusColor('neutral');
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'error': return 'Connection Error';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="connection-config">
      <button 
        className="config-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="status-indicator" style={{ backgroundColor: getStatusColor() }}></span>
        {getStatusText()}
        {isConnecting && <span className="connecting-spinner">⟳</span>}
      </button>

      {isOpen && (
        <div className="config-panel">
          <h3>Allog System Connection</h3>
          
          <div className="config-field">
            <label htmlFor="baseUrl">Server URL:</label>
            <input
              id="baseUrl"
              type="url"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder={viewerConfig.defaultServerUrl}
            />
          </div>

          <div className="config-field">
            <label htmlFor="timeout">Timeout (ms):</label>
            <input
              id="timeout"
              type="number"
              value={config.timeout}
              onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) || viewerConfig.connectionTimeout })}
              min={viewerConfig.minTimeout}
              max={viewerConfig.maxTimeout}
            />
          </div>

          <div className="config-field">
            <label htmlFor="retries">Retries:</label>
            <input
              id="retries"
              type="number"
              value={config.retries}
              onChange={(e) => setConfig({ ...config, retries: parseInt(e.target.value) || viewerConfig.connectionRetries })}
              min="0"
              max="10"
            />
          </div>

          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}

          <div className="config-actions">
            <button 
              className="test-connection"
              onClick={checkConnection}
              disabled={isConnecting}
            >
              {isConnecting ? 'Testing...' : 'Test Connection'}
            </button>
            
            <button 
              className="save-config"
              onClick={handleSave}
              disabled={connectionStatus === 'error'}
            >
              Save & Connect
            </button>
            
            <button 
              className="reset-config"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>

          <div className="preset-configs">
            <h4>Quick Presets:</h4>
             <button onClick={() => setConfig({ ...config, baseUrl: viewerConfig.defaultServerUrl })}>
              Local Development
            </button>
            <button onClick={() => setConfig({ ...config, baseUrl: viewerConfig.alternativeServerUrl })}>
              Alternative Port
            </button>
            <button onClick={() => setConfig({ ...config, baseUrl: viewerConfig.productionServerUrl })}>
              Production API
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 