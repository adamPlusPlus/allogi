import React, { useState, useEffect } from 'react';
import '../styles/InstrumentationPage.css';

interface InstrumentationConfig {
  enabled: boolean;
  defaultLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
  components: {
    allogEngine: ComponentConfig;
    allogManager: ComponentConfig;
    allogCoordinator: ComponentConfig;
    recursiveLogsManager: ComponentConfig;
    server: ComponentConfig;
  };
  methods: {
    logMethodCalls: boolean;
    logMethodParameters: boolean;
    logMethodReturns: boolean;
    logMethodTiming: boolean;
    logMethodErrors: boolean;
  };
  state: {
    logVariableChanges: boolean;
    logConfigurationChanges: boolean;
    logBufferOperations: boolean;
    logModuleStateChanges: boolean;
    logServerCommunication: boolean;
  };
  dataFlow: {
    logDataTransformation: boolean;
    logDataRouting: boolean;
    logDataFiltering: boolean;
    logDataSerialization: boolean;
  };
  performance: {
    logExecutionTime: boolean;
    logMemoryUsage: boolean;
    logBufferStats: boolean;
    logServerLatency: boolean;
  };
}

interface ComponentConfig {
  enabled: boolean;
  level: 'none' | 'basic' | 'detailed' | 'comprehensive';
  methods: string[];
  excludeMethods: string[];
}

interface DynamicModule {
  name: string;
  scriptId: string;
  type: string;
  enabled: boolean;
  level: string;
  methods: string[];
  lastSeen: string;
  logCount: number;
  status: string;
}

interface MonitoringData {
  modules: Record<string, DynamicModule>;
  stats: {
    totalModules: number;
    totalScripts: number;
    totalVariables: number;
    totalStates: number;
    totalFunctions: number;
    totalProperties: number;
    totalEvents: number;
    lastUpdate: string;
  };
}

const InstrumentationPage: React.FC = () => {
  const [config, setConfig] = useState<InstrumentationConfig | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  // Fetch current configuration and monitoring data
  const fetchConfig = async () => {
    try {
      setLoading(true);
      
      // First try to load from active profile
      const profileConfig = loadActiveProfile();
      
      // Fetch both config and monitoring data in parallel
      const [configResponse, monitoringResponse] = await Promise.all([
        fetch('/api/instrumentation/config'),
        fetch('/api/monitoring')
      ]);
      
      if (configResponse.ok) {
        const configData = await configResponse.json();
        // Use profile config if available, otherwise use server config
        const finalConfig = profileConfig || configData.config;
        setConfig(finalConfig);
        
        // If we used profile config, sync it to server
        if (profileConfig) {
          await fetch('/api/instrumentation/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: profileConfig }),
          });
        }
      } else {
        // If server fails but we have profile config, use that
        if (profileConfig) {
          setConfig(profileConfig);
        } else {
          setError('Failed to fetch instrumentation configuration');
        }
      }
      
      if (monitoringResponse.ok) {
        const monitoringData = await monitoringResponse.json();
        setMonitoring(monitoringData);
      } else {
        console.warn('Failed to fetch monitoring data');
      }
      
      setError(null);
    } catch (err) {
      // Try to load from profile even if network fails
      const profileConfig = loadActiveProfile();
      if (profileConfig) {
        setConfig(profileConfig);
        setError(null);
      } else {
        setError('Network error while fetching data');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load profile from localStorage
  const loadActiveProfile = () => {
    try {
      const savedData = localStorage.getItem('allog-save-system');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.activeProfile) {
          const profileId = parsed.activeProfile;
          const profile = parsed.items?.find((item: any) => item.id === profileId);
          if (profile) {
            setActiveProfile(profile);
            // Load instrumentation settings from profile
            const profileSettings = parsed.items?.find((item: any) => 
              item.type === 'profile-settings' && item.parentId === profileId
            );
            if (profileSettings?.metadata?.data?.instrumentation) {
              return profileSettings.metadata.data.instrumentation;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load profile instrumentation settings:', error);
    }
    return null;
  };

  // Save configuration to both server and profile
  const saveConfig = async (newConfig: InstrumentationConfig) => {
    try {
      setSaving(true);
      
      // Save to server
      const response = await fetch('/api/instrumentation/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: newConfig }),
      });
      
      if (response.ok) {
        setConfig(newConfig);
        
        // Auto-save to active profile
        await saveToProfile(newConfig);
        
        setError(null);
      } else {
        setError('Failed to save instrumentation configuration');
      }
    } catch (err) {
      setError('Network error while saving configuration');
    } finally {
      setSaving(false);
    }
  };

  // Save instrumentation settings to active profile
  const saveToProfile = async (instrumentationConfig: InstrumentationConfig) => {
    try {
      const savedData = localStorage.getItem('allog-save-system');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.activeProfile) {
          const profileId = parsed.activeProfile;
          let profileSettings = parsed.items?.find((item: any) => 
            item.type === 'profile-settings' && item.parentId === profileId
          );
          
          if (profileSettings) {
            // Update existing profile settings
            profileSettings.metadata.data.instrumentation = instrumentationConfig;
            profileSettings.metadata.updatedAt = new Date().toISOString();
          } else {
            // Create new profile settings
            profileSettings = {
              id: `profile-settings-${profileId}`,
              name: 'Profile Settings',
              type: 'profile-settings',
              parentId: profileId,
              metadata: {
                description: `Settings for profile`,
                tags: ['profile', 'settings', 'system'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                data: {
                  theme: 'dark',
                  autoSave: true,
                  notifications: true,
                  defaultView: 'logs',
                  instrumentation: instrumentationConfig
                }
              }
            };
            parsed.items = parsed.items || [];
            parsed.items.push(profileSettings);
          }
          
          // Save back to localStorage
          localStorage.setItem('allog-save-system', JSON.stringify(parsed));
        }
      }
    } catch (error) {
      console.warn('Failed to save to profile:', error);
    }
  };

  // Quick preset functions
  const applyPreset = async (preset: string) => {
    if (!config) return;
    
    let newConfig = { ...config };
    
    switch (preset) {
      case 'comprehensive':
        newConfig.enabled = true;
        newConfig.defaultLevel = 'comprehensive';
        Object.keys(newConfig.components).forEach(key => {
          newConfig.components[key as keyof typeof newConfig.components].enabled = true;
          newConfig.components[key as keyof typeof newConfig.components].level = 'comprehensive';
        });
        Object.keys(newConfig.methods).forEach(key => {
          newConfig.methods[key as keyof typeof newConfig.methods] = true;
        });
        Object.keys(newConfig.state).forEach(key => {
          newConfig.state[key as keyof typeof newConfig.state] = true;
        });
        Object.keys(newConfig.dataFlow).forEach(key => {
          newConfig.dataFlow[key as keyof typeof newConfig.dataFlow] = true;
        });
        Object.keys(newConfig.performance).forEach(key => {
          newConfig.performance[key as keyof typeof newConfig.performance] = true;
        });
        break;
        
      case 'detailed':
        newConfig.enabled = true;
        newConfig.defaultLevel = 'detailed';
        Object.keys(newConfig.components).forEach(key => {
          newConfig.components[key as keyof typeof newConfig.components].enabled = true;
          newConfig.components[key as keyof typeof newConfig.components].level = 'detailed';
        });
        newConfig.methods.logMethodCalls = true;
        newConfig.methods.logMethodParameters = true;
        newConfig.methods.logMethodReturns = true;
        newConfig.methods.logMethodTiming = false;
        newConfig.methods.logMethodErrors = true;
        newConfig.state.logVariableChanges = true;
        newConfig.state.logConfigurationChanges = true;
        newConfig.state.logBufferOperations = true;
        newConfig.state.logModuleStateChanges = false;
        newConfig.state.logServerCommunication = true;
        newConfig.dataFlow.logDataTransformation = true;
        newConfig.dataFlow.logDataRouting = true;
        newConfig.dataFlow.logDataFiltering = true;
        newConfig.dataFlow.logDataSerialization = false;
        newConfig.performance.logExecutionTime = true;
        newConfig.performance.logMemoryUsage = false;
        newConfig.performance.logBufferStats = true;
        newConfig.performance.logServerLatency = false;
        break;
        
      case 'basic':
        newConfig.enabled = true;
        newConfig.defaultLevel = 'basic';
        Object.keys(newConfig.components).forEach(key => {
          newConfig.components[key as keyof typeof newConfig.components].enabled = true;
          newConfig.components[key as keyof typeof newConfig.components].level = 'basic';
        });
        newConfig.methods.logMethodCalls = true;
        newConfig.methods.logMethodParameters = false;
        newConfig.methods.logMethodReturns = false;
        newConfig.methods.logMethodTiming = false;
        newConfig.methods.logMethodErrors = true;
        newConfig.state.logVariableChanges = false;
        newConfig.state.logConfigurationChanges = true;
        newConfig.state.logBufferOperations = false;
        newConfig.state.logModuleStateChanges = false;
        newConfig.state.logServerCommunication = false;
        newConfig.dataFlow.logDataTransformation = false;
        newConfig.dataFlow.logDataRouting = false;
        newConfig.dataFlow.logDataFiltering = false;
        newConfig.dataFlow.logDataSerialization = false;
        newConfig.performance.logExecutionTime = false;
        newConfig.performance.logMemoryUsage = false;
        newConfig.performance.logBufferStats = false;
        newConfig.performance.logServerLatency = false;
        break;
        
      case 'none':
        newConfig.enabled = false;
        newConfig.defaultLevel = 'none';
        Object.keys(newConfig.components).forEach(key => {
          newConfig.components[key as keyof typeof newConfig.components].enabled = false;
          newConfig.components[key as keyof typeof newConfig.components].level = 'none';
        });
        Object.keys(newConfig.methods).forEach(key => {
          newConfig.methods[key as keyof typeof newConfig.methods] = false;
        });
        Object.keys(newConfig.state).forEach(key => {
          newConfig.state[key as keyof typeof newConfig.state] = false;
        });
        Object.keys(newConfig.dataFlow).forEach(key => {
          newConfig.dataFlow[key as keyof typeof newConfig.dataFlow] = false;
        });
        Object.keys(newConfig.performance).forEach(key => {
          newConfig.performance[key as keyof typeof newConfig.performance] = false;
        });
        break;
    }
    
    await saveConfig(newConfig);
  };

  // Update individual settings
  const updateConfig = async (path: string, value: any) => {
    if (!config) return;
    
    const newConfig = { ...config };
    const keys = path.split('.');
    let current: any = newConfig;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    await saveConfig(newConfig);
  };

  // Update dynamic module level
  const updateModuleLevel = async (moduleName: string, level: string) => {
    if (!monitoring) return;
    
    const updatedModules = { ...monitoring.modules };
    updatedModules[moduleName] = { ...updatedModules[moduleName], level };
    
    setMonitoring({ ...monitoring, modules: updatedModules });
    
    // Update the actual instrumentation config
    if (config) {
      const newConfig = { ...config };
      if (!newConfig.components) newConfig.components = {} as any;
      if (!newConfig.components[moduleName as keyof typeof newConfig.components]) {
        (newConfig.components as any)[moduleName] = {
          enabled: true,
          level,
          methods: [],
          excludeMethods: []
        };
      } else {
        (newConfig.components as any)[moduleName].level = level;
      }
      await saveConfig(newConfig);
    }
  };

  // Update dynamic module enabled state
  const updateModuleEnabled = async (moduleName: string, enabled: boolean) => {
    if (!monitoring) return;
    
    const updatedModules = { ...monitoring.modules };
    updatedModules[moduleName] = { ...updatedModules[moduleName], enabled };
    
    setMonitoring({ ...monitoring, modules: updatedModules });
    
    // Update the actual instrumentation config
    if (config) {
      const newConfig = { ...config };
      if (!newConfig.components) newConfig.components = {} as any;
      if (!newConfig.components[moduleName as keyof typeof newConfig.components]) {
        (newConfig.components as any)[moduleName] = {
          enabled,
          level: 'detailed',
          methods: [],
          excludeMethods: []
        };
      } else {
        (newConfig.components as any)[moduleName].enabled = enabled;
      }
      await saveConfig(newConfig);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  if (loading) {
    return (
      <div className="instrumentation-page">
        <div className="loading">Loading instrumentation configuration...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="instrumentation-page">
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={fetchConfig}>Retry</button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="instrumentation-page">
        <div className="error">No configuration available</div>
      </div>
    );
  }

  return (
    <div className="instrumentation-page">
      <div className="instrumentation-header">
        <h2>🔧 Instrumentation Controls</h2>
        <p>Configure what gets logged in the Allog system</p>
        {activeProfile && (
          <div className="profile-indicator">
            <span className="profile-badge">
              📁 Settings auto-saved to profile: <strong>{activeProfile.name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="preset-section">
        <h3>Quick Presets</h3>
        <div className="preset-buttons">
          <button 
            className="preset-btn comprehensive"
            onClick={() => applyPreset('comprehensive')}
            disabled={saving}
          >
            🔍 Comprehensive
          </button>
          <button 
            className="preset-btn detailed"
            onClick={() => applyPreset('detailed')}
            disabled={saving}
          >
            📊 Detailed
          </button>
          <button 
            className="preset-btn basic"
            onClick={() => applyPreset('basic')}
            disabled={saving}
          >
            📝 Basic
          </button>
          <button 
            className="preset-btn none"
            onClick={() => applyPreset('none')}
            disabled={saving}
          >
            🚫 None
          </button>
        </div>
      </div>

      {/* Global Settings */}
      <div className="config-section">
        <h3>Global Settings</h3>
        <div className="config-grid">
          <div className="config-item">
            <label>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => updateConfig('enabled', e.target.checked)}
                disabled={saving}
              />
              Enable Instrumentation
            </label>
          </div>
          <div className="config-item">
            <label>Default Level:</label>
            <select
              value={config.defaultLevel}
              onChange={(e) => updateConfig('defaultLevel', e.target.value)}
              disabled={saving}
            >
              <option value="none">None</option>
              <option value="basic">Basic</option>
              <option value="detailed">Detailed</option>
              <option value="comprehensive">Comprehensive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dynamic Component Table */}
      <div className="config-section">
        <h3>Active Components ({monitoring?.stats.totalModules || 0} discovered)</h3>
        {monitoring && monitoring.modules && Object.keys(monitoring.modules).length > 0 ? (
          <div className="components-table">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Scripts</th>
                  <th>Variables</th>
                  <th>States</th>
                  <th>Functions</th>
                  <th>Properties</th>
                  <th>Events</th>
                  <th>Last Update</th>
                  <th>Level</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(monitoring.modules).map(([moduleId, moduleData]) => {
                  const scriptCount = Object.keys(moduleData.scripts || {}).length;
                  let totalVariables = 0, totalStates = 0, totalFunctions = 0, totalProperties = 0, totalEvents = 0;
                  
                  // Count totals across all scripts in this module
                  Object.values(moduleData.scripts || {}).forEach((script: any) => {
                    totalVariables += Object.keys(script.variables || {}).length;
                    totalStates += Object.keys(script.states || {}).length;
                    totalFunctions += Object.keys(script.functions || {}).length;
                    totalProperties += Object.keys(script.properties || {}).length;
                    totalEvents += Object.keys(script.events || {}).length;
                  });

                  // Get the module configuration from config (default values if not found)
                  const moduleConfig = config.components && config.components[moduleId] ? config.components[moduleId] : {
                    enabled: true,
                    level: config.defaultLevel || 'detailed'
                  };

                  return (
                    <tr key={moduleId} className="module-row">
                      <td className="module-name">
                        <span className="module-icon">📦</span>
                        {moduleId}
                      </td>
                      <td className="module-scripts">{scriptCount}</td>
                      <td className="module-variables">{totalVariables}</td>
                      <td className="module-states">{totalStates}</td>
                      <td className="module-functions">{totalFunctions}</td>
                      <td className="module-properties">{totalProperties}</td>
                      <td className="module-events">{totalEvents}</td>
                      <td className="module-last-update">
                        {moduleData.lastUpdate ? new Date(moduleData.lastUpdate).toLocaleString() : 'Never'}
                      </td>
                      <td className="module-level">
                        <select
                          value={moduleConfig.level}
                          onChange={(e) => updateModuleLevel(moduleId, e.target.value)}
                          disabled={saving}
                          className="level-select"
                        >
                          <option value="none">None</option>
                          <option value="basic">Basic</option>
                          <option value="detailed">Detailed</option>
                          <option value="comprehensive">Comprehensive</option>
                        </select>
                      </td>
                      <td className="module-enabled">
                        <input
                          type="checkbox"
                          checked={moduleConfig.enabled}
                          onChange={(e) => updateModuleEnabled(moduleId, e.target.checked)}
                          disabled={saving}
                          className="enabled-checkbox"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-components">
            <p>No active components detected. Components will appear here as they send logs.</p>
            <button onClick={fetchConfig} disabled={loading}>
              🔄 Refresh Discovery
            </button>
          </div>
        )}
      </div>

      {/* Method Settings */}
      <div className="config-section">
        <h3>Method Logging</h3>
        <div className="config-grid">
          {Object.entries(config.methods || {}).map(([methodName, enabled]) => (
            <div key={methodName} className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => updateConfig(`methods.${methodName}`, e.target.checked)}
                  disabled={saving}
                />
                {methodName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* State Settings */}
      <div className="config-section">
        <h3>State Logging</h3>
        <div className="config-grid">
          {Object.entries(config.state || {}).map(([stateName, enabled]) => (
            <div key={stateName} className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => updateConfig(`state.${stateName}`, e.target.checked)}
                  disabled={saving}
                />
                {stateName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Data Flow Settings */}
      <div className="config-section">
        <h3>Data Flow Logging</h3>
        <div className="config-grid">
          {Object.entries(config.dataFlow || {}).map(([flowName, enabled]) => (
            <div key={flowName} className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => updateConfig(`dataFlow.${flowName}`, e.target.checked)}
                  disabled={saving}
                />
                {flowName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Settings */}
      <div className="config-section">
        <h3>Performance Logging</h3>
        <div className="config-grid">
          {Object.entries(config.performance || {}).map(([perfName, enabled]) => (
            <div key={perfName} className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => updateConfig(`performance.${perfName}`, e.target.checked)}
                  disabled={saving}
                />
                {perfName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
            </div>
          ))}
        </div>
      </div>

      {saving && (
        <div className="saving-indicator">
          Saving configuration...
        </div>
      )}
    </div>
  );
};

export default InstrumentationPage; 