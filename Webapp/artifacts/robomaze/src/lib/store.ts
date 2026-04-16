import { create } from 'zustand';
import { api } from './api';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success';
  category: string;
  message: string;
}

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

export interface CommandResult {
  id: string;
  command: string;
  status: 'pending' | 'acknowledged' | 'success' | 'failed' | 'timeout';
  timestamp: number;
  message: string;
}

export interface MazeNode {
  id: number;
  x: number;
  y: number;
  exits: string[];
  visited: boolean;
  visitOrder: number;
  isSolution: boolean;
  heading: string;
  hasL: boolean;
  hasS: boolean;
  hasR: boolean;
  relLen: number;
}

export interface MazeState {
  nodes: Record<string, MazeNode>;
  edgeLengths: Record<string, number>;
  currentPosition: { x: number; y: number; dir: string };
  pathHistory: string[];
  shortestPath: string[];
  simplifiedPath: string;
  explorationStatus: string;
  nodesDiscovered: number;
  edgesDiscovered: number;
  deadEnds: number;
  backtracks: number;
  currentDepth: number;
  stackSize: number;
  startTime: number | null;
  goalX: number | null;
  goalY: number | null;
  currentDecision: {
    node: string;
    availableExits: string[];
    chosenDirection: string;
    reason: string;
    isBacktracking: boolean;
  } | null;
}

export interface RobotStatus {
  connectionType: string;
  connectionStatus: string;
  robotIp: string;
  emergencyStop: boolean;
  systemState: string;
  missionPhase: string;
  provider: string;
  commMode: string;
  latency: number;
  battery: number;
  uptime: number;
  lastCommandTime: number | null;
  lastCommand: string | null;
  lastCommandResult: string | null;
  nodesDiscovered: number;
  mazePhase: string;
}

export interface RobotConfig {
  baseSpeed: number;
  turnSpeed: number;
  minSpeed: number;
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
}

export interface Settings {
  motor: { baseSpeed: number; turnSpeed: number };
  sensor: { threshold: number };
  communication: { wifiIp: string; pollingInterval: number; reconnectPolicy: string; bleEnabled: boolean; preferredMode: string };
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

export interface AppState {
  status: RobotStatus;
  telemetry: Telemetry;
  maze: MazeState;
  logs: LogEntry[];
  settings: Settings;
  commandHistory: CommandResult[];

  toast: { message: string; type: 'info' | 'success' | 'warning' | 'error' } | null;
  isPolling: boolean;
  apiError: string | null;
  robotWsStatus: 'connected' | 'connecting' | 'disconnected';
  robotBleStatus: 'connected' | 'connecting' | 'disconnected';
  pathSummary: string | null;
  robotConfig: RobotConfig | null;
  connectedAt: number | null;

  setStatus: (s: RobotStatus) => void;
  setTelemetry: (t: Telemetry) => void;
  setMaze: (m: MazeState) => void;
  setLogs: (l: LogEntry[]) => void;
  setSettings: (s: Settings) => void;
  setCommandHistory: (h: CommandResult[]) => void;
  showToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  clearToast: () => void;
  setApiError: (e: string | null) => void;
  setRobotWsStatus: (s: 'connected' | 'connecting' | 'disconnected') => void;
  setRobotBleStatus: (s: 'connected' | 'connecting' | 'disconnected') => void;
  addLocalLog: (level: 'info' | 'warning' | 'error' | 'success', category: string, message: string) => void;
  setPathSummary: (s: string | null) => void;
  handleRobotMessage: (data: any) => void;
}

const defaultTelemetry: Telemetry = {
  speedL: 0, speedR: 0, encL: 0, encR: 0, pwmL: 0, pwmR: 0,
  driftError: 0, sensors: [0, 0, 0, 0, 0],
  lineCenter: 0.5, confidence: 0, junctionDetected: false, lineLost: false,
  battery: 0, uptime: 0, currentState: 'INIT', targetSpeed: 0,
  heading: 'N', movePrimitive: 'STOP', turningState: 'NONE', freshness: 0,
  paused: false,
};

const defaultStatus: RobotStatus = {
  connectionType: 'wifi', connectionStatus: 'disconnected',
  robotIp: '172.20.10.9', emergencyStop: false, systemState: 'INIT',
  missionPhase: 'STANDBY', provider: 'esp32', commMode: 'wifi',
  latency: 0, battery: 0, uptime: 0, lastCommandTime: null, lastCommand: null,
  lastCommandResult: null, nodesDiscovered: 0, mazePhase: 'idle',
};

const defaultMaze: MazeState = {
  nodes: {}, edgeLengths: {}, currentPosition: { x: 0, y: 0, dir: 'N' },
  pathHistory: [], shortestPath: [], simplifiedPath: '', explorationStatus: 'idle',
  nodesDiscovered: 0, edgesDiscovered: 0, deadEnds: 0, backtracks: 0,
  currentDepth: 0, stackSize: 0, startTime: null, goalX: null, goalY: null,
  currentDecision: null,
};

const defaultSettings: Settings = {
  motor: { baseSpeed: 170, turnSpeed: 130 },
  sensor: { threshold: 500 },
  communication: { wifiIp: '172.20.10.9', pollingInterval: 100, reconnectPolicy: 'auto', bleEnabled: false, preferredMode: 'wifi' },
  advanced: {
    settleTime: 600,
    junctionCreep: 275,
    forcedTurn: 310,
    searchTimeout: 1700,
    peekCreep: 150,
    goalCreep: 150,
    corrT1: 50,
    corrT2: 55,
    corrT3: 60,
    corrT4: 65,
  },
};

let logIdCounter = 0;
function makeLogId() { return `log-${Date.now()}-${logIdCounter++}`; }

const headingMap: Record<string, string> = { '0': 'N', '1': 'E', '2': 'S', '3': 'W', 'N': 'N', 'E': 'E', 'S': 'S', 'W': 'W' };
function normalizeHeading(h: any): string { return headingMap[String(h)] || String(h); }

export const useAppStore = create<AppState>((set, get) => ({
  status: defaultStatus,
  telemetry: defaultTelemetry,
  maze: defaultMaze,
  logs: [],
  settings: defaultSettings,
  commandHistory: [],
  toast: null,
  isPolling: false,
  apiError: null,
  robotWsStatus: 'disconnected',
  robotBleStatus: 'disconnected',
  pathSummary: null,
  robotConfig: null,
  connectedAt: null,

  setStatus: (s) => set({ status: s }),
  setTelemetry: (t) => set({ telemetry: t }),
  setMaze: (m) => set({ maze: m }),
  setLogs: (l) => set({ logs: l }),
  setSettings: (s) => set({ settings: s }),
  setCommandHistory: (h) => set({ commandHistory: h }),
  showToast: (message, type) => set({ toast: { message, type } }),
  clearToast: () => set({ toast: null }),
  setApiError: (e) => set({ apiError: e }),
  setRobotWsStatus: (s) => set((state) => ({
    robotWsStatus: s,
    connectedAt: s === 'connected' ? (state.connectedAt ?? Date.now()) : (s === 'disconnected' ? null : state.connectedAt),
    status: {
      ...state.status,
      connectionStatus: s,
      connectionType: s === 'connected' ? 'wifi' : state.status.connectionType,
    },
  })),
  setRobotBleStatus: (s) => set((state) => ({
    robotBleStatus: s,
    connectedAt: s === 'connected' ? (state.connectedAt ?? Date.now()) : (s === 'disconnected' && state.robotWsStatus !== 'connected' ? null : state.connectedAt),
    status: {
      ...state.status,
      connectionStatus: s === 'connected' ? s : state.status.connectionStatus,
      connectionType: s === 'connected' ? 'bluetooth' : state.status.connectionType,
    },
  })),
  setPathSummary: (s) => set({ pathSummary: s }),

  addLocalLog: (level, category, message) => set((state) => ({
    logs: [...state.logs.slice(-199), {
      id: makeLogId(),
      timestamp: Date.now(),
      level,
      category,
      message,
    }],
  })),

  handleRobotMessage: (data: any) => {
    const state = get();
    const type = data.type;

    if (type === 'config_state') {
      const cfg: RobotConfig = {
        baseSpeed: data.baseSpeed ?? 170,
        turnSpeed: data.turnSpeed ?? 130,
        minSpeed: data.minSpeed ?? 0,
        settleTime: data.settleTime ?? 600,
        junctionCreep: data.junctionCreep ?? 275,
        forcedTurn: data.forcedTurn ?? 310,
        searchTimeout: data.searchTimeout ?? 1700,
        peekCreep: data.peekCreep ?? 150,
        goalCreep: data.goalCreep ?? 150,
        corrT1: data.corrT1 ?? 50,
        corrT2: data.corrT2 ?? 55,
        corrT3: data.corrT3 ?? 60,
        corrT4: data.corrT4 ?? 65,
      };
      set({
        robotConfig: cfg,
        settings: {
          ...state.settings,
          motor: { baseSpeed: cfg.baseSpeed, turnSpeed: cfg.turnSpeed },
          advanced: {
            settleTime: cfg.settleTime,
            junctionCreep: cfg.junctionCreep,
            forcedTurn: cfg.forcedTurn,
            searchTimeout: cfg.searchTimeout,
            peekCreep: cfg.peekCreep,
            goalCreep: cfg.goalCreep,
            corrT1: cfg.corrT1,
            corrT2: cfg.corrT2,
            corrT3: cfg.corrT3,
            corrT4: cfg.corrT4,
          },
        },
      });
      state.addLocalLog('info', 'system', 'Received robot config state');
      return;
    }

    if (type === 'telemetry') {
      const sensors = Array.isArray(data.sensors)
        ? data.sensors.map((v: number) => v * 1023)
        : state.telemetry.sensors;

      const activeCount = sensors.filter((v: number) => v > state.settings.sensor.threshold).length;
      let weightedSum = 0, totalWeight = 0;
      sensors.forEach((val: number, i: number) => {
        if (val > state.settings.sensor.threshold) {
          weightedSum += i * val;
          totalWeight += val;
        }
      });
      const lineCenter = totalWeight > 0 ? weightedSum / (totalWeight * (sensors.length - 1)) : 0.5;
      const confidence = Math.min(1.0, activeCount / 3);

      const heading = normalizeHeading(data.heading);
      const robotState = data.state ?? state.telemetry.currentState;
      const pwmL = data.pwmL ?? state.telemetry.pwmL;
      const pwmR = data.pwmR ?? state.telemetry.pwmR;
      const movePrimitive = (pwmL === 0 && pwmR === 0) ? 'STOP' : 'MOVING';
      const paused = data.paused === true;

      const phaseMap: Record<string, string> = {
        'LHR': 'EXPLORING',
        'WAITING_BACK': 'AWAITING CMD',
        'RETURNING': 'RETURNING',
        'WAITING_RUN2': 'AWAITING CMD',
        'RUN2': 'SOLVING',
        'WAITING_BACK2': 'AWAITING CMD',
        'BACK2': 'RETURNING',
      };
      const missionPhase = phaseMap[robotState] || robotState || state.status.missionPhase;

      set({
        telemetry: {
          ...state.telemetry,
          sensors,
          pwmL,
          pwmR,
          heading,
          currentState: robotState,
          movePrimitive,
          lineCenter,
          confidence,
          junctionDetected: activeCount >= 4,
          lineLost: activeCount === 0,
          freshness: Date.now(),
          paused,
        },
        maze: {
          ...state.maze,
          currentPosition: {
            x: data.x ?? state.maze.currentPosition.x,
            y: data.y ?? state.maze.currentPosition.y,
            dir: heading,
          },
        },
        status: {
          ...state.status,
          systemState: robotState,
          missionPhase,
        },
      });
    } else if (type === 'junction') {
      const junctionId = typeof data.id === 'number' ? data.id : Object.keys(state.maze.nodes).length;
      const idKey = `${junctionId}`;
      const junctionHeading = normalizeHeading(data.heading || state.maze.currentPosition.dir);
      const hasL = data.hasL === true;
      const hasS = data.hasS === true;
      const hasR = data.hasR === true;

      const relToAbs: Record<string, Record<string, string>> = {
        N: { L: 'W', S: 'N', R: 'E', B: 'S' },
        E: { L: 'N', S: 'E', R: 'S', B: 'W' },
        S: { L: 'E', S: 'S', R: 'W', B: 'N' },
        W: { L: 'S', S: 'W', R: 'N', B: 'E' },
      };
      const absMap = relToAbs[junctionHeading] || relToAbs['N'];
      const exits: string[] = [absMap['B']];
      if (hasL) exits.push(absMap['L']);
      if (hasS) exits.push(absMap['S']);
      if (hasR) exits.push(absMap['R']);

      const existingNode = state.maze.nodes[idKey];
      const visitOrder = existingNode ? existingNode.visitOrder : Object.keys(state.maze.nodes).length + 1;

      if (existingNode) {
        const merged = new Set([...existingNode.exits, ...exits]);
        exits.length = 0;
        exits.push(...merged);
      }

      const decision = data.decision ? String(data.decision).toUpperCase() : null;
      const isDeadEnd = decision === 'B';
      const relLen = typeof data.relLen === 'number' ? data.relLen : 1.0;

      const newEdgeLengths = { ...state.maze.edgeLengths };
      if (junctionId > 0 && state.maze.nodes[`${junctionId - 1}`]) {
        newEdgeLengths[`${junctionId - 1}|${junctionId}`] = relLen;
      }

      set({
        maze: {
          ...state.maze,
          nodes: {
            ...state.maze.nodes,
            [idKey]: {
              id: junctionId,
              x: data.x,
              y: data.y,
              exits,
              visited: true,
              visitOrder,
              isSolution: existingNode?.isSolution ?? false,
              heading: junctionHeading,
              hasL,
              hasS,
              hasR,
              relLen,
            },
          },
          edgeLengths: newEdgeLengths,
          nodesDiscovered: Object.keys(state.maze.nodes).length + (existingNode ? 0 : 1),
          deadEnds: state.maze.deadEnds + (isDeadEnd && !existingNode ? 1 : 0),
          backtracks: state.maze.backtracks + (isDeadEnd && !existingNode ? 1 : 0),
          currentPosition: {
            x: data.x,
            y: data.y,
            dir: junctionHeading,
          },
        },
        status: {
          ...state.status,
          nodesDiscovered: Object.keys(state.maze.nodes).length + (existingNode ? 0 : 1),
        },
      });

      if (decision) {
        set({
          maze: {
            ...get().maze,
            pathHistory: [...get().maze.pathHistory, decision],
          },
        });
      }

      state.addLocalLog('info', 'movement', `Junction #${junctionId} at (${data.x},${data.y}) — exits: ${exits.join(', ')}${decision ? ' → ' + decision : ''}`);
    } else if (type === 'goal_node') {
      const gx = data.x;
      const gy = data.y;
      if (gx != null && gy != null) {
        set({
          maze: {
            ...get().maze,
            goalX: gx,
            goalY: gy,
          },
        });
        state.addLocalLog('success', 'system', `Goal node at (${gx},${gy})`);
      }
    } else if (type === 'event') {
      const eventName = data.event || '';
      let level: 'info' | 'warning' | 'error' | 'success' = 'info';
      let category = 'system';
      if (eventName === 'GOAL_REACHED' || eventName === 'RUN2_GOAL') {
        level = 'success';
        category = 'system';
      } else if (eventName === 'ESTOP' || eventName === 'PAUSED') {
        level = 'warning';
        category = 'system';
      } else if (eventName === 'WAITING_BACK' || eventName === 'WAITING_RUN2' || eventName === 'WAITING_BACK2') {
        level = 'info';
        category = 'system';
      }
      if (eventName === 'RESET') {
        set({
          maze: { ...defaultMaze },
          status: { ...get().status, nodesDiscovered: 0 },
        });
      }

      if (eventName === 'GOAL_REACHED' || eventName === 'WAITING_BACK') {
        const currentMaze = get().maze;
        const gx = currentMaze.goalX;
        const gy = currentMaze.goalY;
        if (gx != null && gy != null) {
          set({
            maze: {
              ...get().maze,
              currentPosition: {
                ...get().maze.currentPosition,
                x: gx,
                y: gy,
              },
            },
          });
        }
      }

      const message = data.message || data.msg || eventName || JSON.stringify(data);
      state.addLocalLog(level, category, message);
    } else if (type === 'log') {
      const level = data.level === 'error' ? 'error' : data.level === 'warn' || data.level === 'warning' ? 'warning' : data.level === 'success' ? 'success' : 'info';
      const message = data.message || data.msg || JSON.stringify(data);
      state.addLocalLog(level as any, 'system', message);
    } else if (type === 'summary') {
      const summary = data.message || data.summary || JSON.stringify(data);
      set({ pathSummary: summary });

      let formattedMsg = `Path summary: ${summary}`;
      if (data.lhrPath || data.run2Path || data.backPath || data.back2Path) {
        const parts = [];
        if (data.lhrPath) parts.push(`LHR: ${data.lhrPath}`);
        if (data.backPath) parts.push(`BACK: ${data.backPath}`);
        if (data.run2Path) parts.push(`RUN2: ${data.run2Path}`);
        if (data.back2Path) parts.push(`BACK2: ${data.back2Path}`);
        formattedMsg = `Summary — ${parts.join(' | ')}`;
      }
      state.addLocalLog('success', 'algorithm', formattedMsg);
      state.showToast(summary, 'success');
    } else if (type === 'path') {
      const pathStr = typeof data.path === 'string' ? data.path : '';
      const pathName = data.name || data.pathType || '';

      if (pathStr && (pathName === 'back' || pathName === 'back2' || pathName === 'run2')) {
        set({
          maze: {
            ...state.maze,
            simplifiedPath: pathStr,
          },
        });

        const nodeKeys = Object.keys(state.maze.nodes);
        if (nodeKeys.length > 0) {
          const updatedNodes = { ...state.maze.nodes };
          nodeKeys.forEach(k => {
            updatedNodes[k] = { ...updatedNodes[k], isSolution: true };
          });
          set({
            maze: {
              ...get().maze,
              nodes: updatedNodes,
            },
          });
        }
      }

      const pathDirs = Array.isArray(data.path) ? data.path.map((d: any) => normalizeHeading(d)) : [];
      if (pathDirs.length > 0) {
        set({
          maze: {
            ...get().maze,
            shortestPath: pathDirs,
          },
        });
      }

      state.addLocalLog('info', 'algorithm', `Path received (${pathName}): ${pathStr || pathDirs.join(' → ')}`);
    } else if (type === 'connected') {
      state.addLocalLog('success', 'communication', data.message || 'Robot connected');
    }
  },
}));

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs = 2000) {
  if (pollInterval) return;

  const startTime = Date.now();

  async function poll() {
    try {
      const settings = await api.getSettings();
      const store = useAppStore.getState();
      store.setSettings({
        ...store.settings,
        communication: {
          ...store.settings.communication,
          wifiIp: settings.communication?.wifiIp ?? store.settings.communication.wifiIp,
          pollingInterval: settings.communication?.pollingInterval ?? store.settings.communication.pollingInterval,
          reconnectPolicy: settings.communication?.reconnectPolicy ?? store.settings.communication.reconnectPolicy,
          bleEnabled: settings.communication?.bleEnabled ?? store.settings.communication.bleEnabled,
          preferredMode: settings.communication?.preferredMode ?? store.settings.communication.preferredMode,
        },
      });
      store.setApiError(null);
    } catch (e: any) {
      if (Date.now() - startTime > 5000) {
        useAppStore.getState().setApiError(e.message || 'API connection lost');
      }
    }
  }

  poll();
  pollInterval = setInterval(poll, intervalMs);
}

export function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

const cmdMap: Record<string, string> = {
  'start-exploration': 'start',
  'run-shortest-path': 'run2',
  'stop': 'halt',
  'pause-exploration': 'halt',
  'stop-exploration': 'halt',
  'resume-exploration': 'start',
  'reset-maze': 'reset',
};

export async function sendRobotCommand(command: string, params?: any): Promise<CommandResult> {
  const store = useAppStore.getState();
  const { connectionManager: cm } = await import('./connection');

  const wsCmd = cmdMap[command] || command;

  const payload = params ? { cmd: wsCmd, ...params } : { cmd: wsCmd };

  store.showToast(`Sending: ${wsCmd}`, 'info');
  store.addLocalLog('info', 'movement', `Command: ${command} → ${wsCmd}`);

  if (cm.connected) {
    cm.sendRaw(JSON.stringify(payload));
    const result: CommandResult = {
      id: `cmd-${Date.now()}`,
      command: wsCmd,
      status: 'success',
      timestamp: Date.now(),
      message: `Sent: ${wsCmd}`,
    };
    store.showToast(`Sent: ${wsCmd}`, 'success');
    store.setCommandHistory([...store.commandHistory.slice(-19), result]);
    return result;
  } else {
    store.showToast('Not connected to robot', 'error');
    const result: CommandResult = {
      id: `cmd-${Date.now()}`,
      command: wsCmd,
      status: 'failed',
      timestamp: Date.now(),
      message: 'Not connected to robot',
    };
    store.setCommandHistory([...store.commandHistory.slice(-19), result]);
    return result;
  }
}
