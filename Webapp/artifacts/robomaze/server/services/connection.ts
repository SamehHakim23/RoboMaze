import type { RobotStatus, ConnectionConfig } from '../types.js';
import type { LogService } from './logs.js';

type ConnPhase = 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'timed_out';

export class ConnectionService {
  private status: RobotStatus;
  private logService: LogService;
  private latencyInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connPhase: ConnPhase = 'idle';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(logService: LogService) {
    this.logService = logService;
    this.status = {
      mode: 'demo',
      connectionType: 'disconnected',
      connectionStatus: 'disconnected',
      robotIp: '192.168.4.1',
      emergencyStop: false,
      systemState: 'IDLE',
      missionPhase: 'STANDBY',
      provider: 'demo-simulator',
      commMode: 'none',
      latency: 0,
      lastCommandTime: null,
      lastCommand: null,
      lastCommandResult: null,
    };
  }

  getStatus(): RobotStatus & { connPhase: string; reconnectAttempts: number } {
    return {
      ...this.status,
      connPhase: this.connPhase,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  setMode(mode: 'demo' | 'live'): void {
    this.status.mode = mode;
    this.status.provider = mode === 'demo' ? 'demo-simulator' : 'live-robot';
    this.logService.add('info', 'system', `Mode switched to ${mode.toUpperCase()}`);
    if (mode === 'demo') {
      this.status.connectionType = 'disconnected';
      this.status.connectionStatus = 'disconnected';
      this.status.commMode = 'none';
      this.status.latency = 0;
      this.connPhase = 'idle';
      this.reconnectAttempts = 0;
    }
  }

  setSystemState(state: string): void {
    this.status.systemState = state;
  }

  setMissionPhase(phase: string): void {
    this.status.missionPhase = phase;
  }

  setLastCommand(cmd: string, result: RobotStatus['lastCommandResult']): void {
    this.status.lastCommand = cmd;
    this.status.lastCommandResult = result;
    this.status.lastCommandTime = Date.now();
  }

  async handleConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; devices?: any[] }> {
    if (config.action === 'connect') {
      return this.connect(config);
    } else if (config.action === 'disconnect') {
      return this.disconnect();
    } else if (config.action === 'scan') {
      return this.scan(config);
    } else if (config.action === 'test') {
      return this.testLatency();
    }
    return { success: false, message: 'Unknown action' };
  }

  private async connect(config: ConnectionConfig): Promise<{ success: boolean; message: string }> {
    this.connPhase = 'connecting';
    this.status.connectionStatus = 'connecting';
    this.status.connectionType = config.type;
    this.status.commMode = config.type;
    this.reconnectAttempts = 0;
    this.logService.add('info', 'communication', `Initiating ${config.type} connection...`);

    if (config.type === 'wifi' && config.ip) {
      this.status.robotIp = config.ip;
    }

    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    if (this.status.mode === 'demo') {
      this.connPhase = 'connected';
      this.status.connectionStatus = 'connected';
      this.status.latency = Math.floor(Math.random() * 12) + 3;
      this.startLatencySimulation();
      this.logService.add('success', 'communication', `${config.type.toUpperCase()} link established — latency: ${this.status.latency}ms`);
      return { success: true, message: `Connected to ${config.type === 'wifi' ? this.status.robotIp : 'BLE device'} (demo)` };
    } else {
      this.connPhase = 'error';
      this.status.connectionStatus = 'error';
      this.logService.add('error', 'communication', `${config.type.toUpperCase()} connection failed — no real robot found`);
      return { success: false, message: 'No real robot available. Switch to demo mode.' };
    }
  }

  private async disconnect(): Promise<{ success: boolean; message: string }> {
    this.stopLatencySimulation();
    this.clearReconnectTimer();
    this.connPhase = 'idle';
    this.status.connectionStatus = 'disconnected';
    this.status.connectionType = 'disconnected';
    this.status.commMode = 'none';
    this.status.latency = 0;
    this.reconnectAttempts = 0;
    this.logService.add('info', 'communication', 'Disconnected from robot.');
    return { success: true, message: 'Disconnected' };
  }

  private async scan(config: ConnectionConfig): Promise<{ success: boolean; message: string; devices?: any[] }> {
    this.connPhase = 'scanning';
    this.logService.add('info', 'communication', `Scanning for ${config.type} devices...`);
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

    this.connPhase = this.status.connectionStatus === 'connected' ? 'connected' : 'idle';

    if (this.status.mode === 'demo') {
      const devices = config.type === 'wifi'
        ? [
            { id: '192.168.4.1', name: 'RoboMaze-ESP32', rssi: -42 + Math.floor(Math.random() * 10) },
            { id: '192.168.4.2', name: 'RoboMaze-ESP32-B', rssi: -68 + Math.floor(Math.random() * 15) }
          ]
        : [
            { id: 'BLE:AA:BB:CC:DD', name: 'RoboMaze-BLE', rssi: -35 + Math.floor(Math.random() * 10) },
            { id: 'BLE:11:22:33:44', name: 'RoboMaze-BLE-2', rssi: -62 + Math.floor(Math.random() * 15) }
          ];
      this.logService.add('info', 'communication', `Found ${devices.length} ${config.type} devices`);
      return { success: true, message: `Found ${devices.length} devices`, devices };
    }
    return { success: true, message: 'No devices found', devices: [] };
  }

  private async testLatency(): Promise<{ success: boolean; message: string }> {
    if (this.status.connectionStatus !== 'connected') {
      return { success: false, message: 'Not connected' };
    }
    const latency = Math.floor(Math.random() * 15) + 3;
    this.status.latency = latency;
    return { success: true, message: `Latency: ${latency}ms` };
  }

  toggleEStop(): boolean {
    this.status.emergencyStop = !this.status.emergencyStop;
    if (this.status.emergencyStop) {
      this.status.systemState = 'E-STOP';
      this.logService.add('error', 'system', 'EMERGENCY STOP ACTIVATED');
    } else {
      this.status.systemState = 'IDLE';
      this.logService.add('warning', 'system', 'Emergency stop released. System idle.');
    }
    return this.status.emergencyStop;
  }

  private startLatencySimulation(): void {
    this.stopLatencySimulation();
    this.latencyInterval = setInterval(() => {
      if (this.status.connectionStatus === 'connected') {
        const jitter = Math.floor(Math.random() * 5) - 2;
        this.status.latency = Math.max(1, Math.min(50, this.status.latency + jitter));

        if (Math.random() < 0.005 && this.status.mode === 'demo') {
          this.simulateDropout();
        }
      }
    }, 2000);
  }

  private simulateDropout(): void {
    this.connPhase = 'reconnecting';
    this.status.connectionStatus = 'connecting';
    this.status.latency = 0;
    this.reconnectAttempts = 1;
    this.logService.add('warning', 'communication', 'Connection interrupted — attempting reconnect...');

    this.reconnectTimer = setTimeout(() => {
      if (this.connPhase === 'reconnecting') {
        this.connPhase = 'connected';
        this.status.connectionStatus = 'connected';
        this.status.latency = Math.floor(Math.random() * 12) + 5;
        this.reconnectAttempts = 0;
        this.logService.add('success', 'communication', `Reconnected — latency: ${this.status.latency}ms`);
      }
    }, 2000 + Math.random() * 1500);
  }

  private stopLatencySimulation(): void {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
