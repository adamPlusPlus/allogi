import React from 'react';
import { AllogApiClient } from '../lib/allog-api-client';
import './ConnectionConfig.css';
interface ConnectionConfigProps {
    onConfigChange: (client: AllogApiClient) => void;
    currentClient: AllogApiClient;
}
export declare const ConnectionConfig: React.FC<ConnectionConfigProps>;
export {};
