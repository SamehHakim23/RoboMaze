export interface Telemetry {
  speedL: number;
  speedR: number;
  encL: number;
  encR: number;
  pwmL: number;
  pwmR: number;
  driftError: number;
  sensors: number[];
  lineCenter: number;
  confidence: number;
  junctionDetected: boolean;
  lineLost: boolean;
  battery: number;
  uptime: number;
  currentState: string;
  targetSpeed: number;
  heading: string;
  movePrimitive: string;
  turningState: string;
  freshness: number;
  paused: boolean;
}

export interface MazeNode {
  x: number;
  y: number;
  exits: string[];
  visited: boolean;
  visitOrder: number;
  isSolution: boolean;
}

export interface MazeState {
  nodes: Record<string, MazeNode>;
  currentPosition: { x: number; y: number; dir: string };
  pathHistory: string[];
  shortestPath: string[];
  explorationStatus: 'idle' | 'exploring' | 'paused' | 'complete' | 'solving' | 'solved';
  nodesDiscovered: number;
  edgesDiscovered: number;
  deadEnds: number;
  backtracks: number;
  currentDepth: number;
  stackSize: number;
  startTime: number | null;
  currentDecision: {
    node: string;
    availableExits: string[];
    chosenDirection: string;
    reason: string;
    isBacktracking: boolean;
  } | null;
}

export interface RobotStatus {
  mode: 'demo' | 'live';
  connectionType: 'wifi' | 'bluetooth' | 'disconnected';
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  robotIp: string;
  emergencyStop: boolean;
  systemState: string;
  missionPhase: string;
  provider: string;
  commMode: string;
  latency: number;
  lastCommandTime: number | null;
  lastCommand: string | null;
  lastCommandResult: 'pending' | 'success' | 'failed' | 'timeout' | null;
}

export interface CommandResult {
  id: string;
  command: string;
  status: 'pending' | 'acknowledged' | 'success' | 'failed' | 'timeout';
  timestamp: number;
  message: string;
  duration?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success';
  category: 'system' | 'communication' | 'movement' | 'sensors' | 'algorithm' | 'warnings' | 'errors';
  message: string;
}

export interface Settings {
  motor: {
    baseSpeed: number;
    turnSpeed: number;
  };
  sensor: {
    threshold: number;
  };
  communication: {
    wifiIp: string;
    pollingInterval: number;
    reconnectPolicy: 'auto' | 'manual';
    bleEnabled: boolean;
    preferredMode: 'wifi' | 'bluetooth';
  };
  advanced: {
    settleTime: number;
    junctionCreep: number;
    forcedTurn: number;
    searchTimeout: number;
    peekCreep: number;
    goalCreep: number;
    corrT1: number;
    corrT2: number;
    corrT3: number;
    corrT4: number;
  };
}

export interface ConnectionConfig {
  type: 'wifi' | 'bluetooth';
  action: 'connect' | 'disconnect' | 'scan' | 'test';
  ip?: string;
  deviceId?: string;
}
