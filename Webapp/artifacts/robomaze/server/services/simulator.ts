import type { Telemetry, CommandResult } from '../types.js';
import type { MazeService } from './maze.js';
import type { LogService } from './logs.js';
import type { ConnectionService } from './connection.js';
import type { SettingsService } from './settings.js';

const DIRECTIONS = ['N', 'E', 'S', 'W'];
const DX: Record<string, number> = { N: 0, E: 1, S: 0, W: -1 };
const DY: Record<string, number> = { N: 1, E: 0, S: -1, W: 0 };
const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };

let cmdId = 0;

export class SimulatorService {
  private telemetry: Telemetry;
  private interval: ReturnType<typeof setInterval> | null = null;
  private mazeService: MazeService;
  private logService: LogService;
  private connectionService: ConnectionService;
  private settingsService: SettingsService;
  private tick = 0;
  private explorationTick = 0;
  private commandQueue: CommandResult[] = [];
  private maxMazeY = 4;
  private maxMazeX = 4;
  private targetSpeedL = 0;
  private targetSpeedR = 0;
  private sensorBase = [150, 200, 800, 850, 200];

  constructor(maze: MazeService, logs: LogService, conn: ConnectionService, settings: SettingsService) {
    this.mazeService = maze;
    this.logService = logs;
    this.connectionService = conn;
    this.settingsService = settings;

    this.telemetry = {
      speedL: 0, speedR: 0, encL: 0, encR: 0,
      pwmL: 0, pwmR: 0, driftError: 0,
      sensors: [...this.sensorBase],
      lineCenter: 0.54, confidence: 0.88, junctionDetected: false, lineLost: false,
      battery: 88.0, uptime: 0, currentState: 'IDLE',
      targetSpeed: 0, heading: 'N', movePrimitive: 'STOP',
      turningState: 'NONE', freshness: Date.now(), paused: false,
    };
  }

  start(): void {
    if (this.interval) return;
    this.logService.add('info', 'system', 'System initialized. Simulator active.');
    this.interval = setInterval(() => this.update(), 500);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getTelemetry(): Telemetry {
    return { ...this.telemetry, sensors: [...this.telemetry.sensors], freshness: Date.now() };
  }

  executeCommand(command: string, params?: any): CommandResult {
    const id = `cmd-${++cmdId}`;
    const result: CommandResult = {
      id, command, status: 'pending', timestamp: Date.now(), message: `Executing: ${command}`,
    };
    this.commandQueue.push(result);

    const status = this.connectionService.getStatus();
    if (status.emergencyStop && command !== 'e-stop-release' && command !== 'e-stop') {
      result.status = 'failed';
      result.message = 'Blocked: Emergency stop active';
      this.logService.add('error', 'movement', `Command ${command} blocked — E-STOP active`);
      this.connectionService.setLastCommand(command, 'failed');
      return result;
    }

    const delay = 100 + Math.random() * 150;
    setTimeout(() => {
      this.processCommand(result, command, params);
    }, delay);

    this.connectionService.setLastCommand(command, 'pending');
    return result;
  }

  getCommandHistory(): CommandResult[] {
    return this.commandQueue.slice(-20);
  }

  private processCommand(result: CommandResult, command: string, params?: any): void {
    const settings = this.settingsService.get();

    switch (command) {
      case 'forward':
        this.targetSpeedL = settings.motor.baseSpeed;
        this.targetSpeedR = settings.motor.baseSpeed;
        this.telemetry.targetSpeed = settings.motor.baseSpeed;
        this.telemetry.movePrimitive = 'FORWARD';
        this.telemetry.currentState = 'MOVING';
        this.connectionService.setSystemState('MOVING');
        result.status = 'success';
        result.message = 'Moving forward';
        this.logService.add('info', 'movement', 'Command: FORWARD');
        break;

      case 'backward':
        this.targetSpeedL = -settings.motor.baseSpeed;
        this.targetSpeedR = -settings.motor.baseSpeed;
        this.telemetry.movePrimitive = 'REVERSE';
        this.telemetry.currentState = 'MOVING';
        result.status = 'success';
        result.message = 'Moving backward';
        this.logService.add('info', 'movement', 'Command: REVERSE');
        break;

      case 'rotate-left':
        this.targetSpeedL = -settings.motor.turnSpeed;
        this.targetSpeedR = settings.motor.turnSpeed;
        this.telemetry.movePrimitive = 'ROTATE_L';
        this.telemetry.turningState = 'LEFT';
        this.telemetry.currentState = 'TURNING';
        result.status = 'success';
        result.message = 'Rotating left';
        this.logService.add('info', 'movement', 'Command: ROTATE LEFT');
        this.rotateHeading(-1);
        break;

      case 'rotate-right':
        this.targetSpeedL = settings.motor.turnSpeed;
        this.targetSpeedR = -settings.motor.turnSpeed;
        this.telemetry.movePrimitive = 'ROTATE_R';
        this.telemetry.turningState = 'RIGHT';
        this.telemetry.currentState = 'TURNING';
        result.status = 'success';
        result.message = 'Rotating right';
        this.logService.add('info', 'movement', 'Command: ROTATE RIGHT');
        this.rotateHeading(1);
        break;

      case 'stop':
        this.targetSpeedL = 0;
        this.targetSpeedR = 0;
        this.telemetry.targetSpeed = 0;
        this.telemetry.movePrimitive = 'STOP';
        this.telemetry.turningState = 'NONE';
        this.telemetry.currentState = 'IDLE';
        this.connectionService.setSystemState('IDLE');
        result.status = 'success';
        result.message = 'Stopped';
        this.logService.add('info', 'movement', 'Command: STOP');
        break;

      case 'turn-left-90':
        this.telemetry.turningState = 'LEFT_90';
        this.telemetry.movePrimitive = 'TURN_L90';
        this.targetSpeedL = -settings.motor.turnSpeed;
        this.targetSpeedR = settings.motor.turnSpeed;
        result.status = 'success';
        result.message = 'Turning left 90°';
        this.logService.add('info', 'movement', 'Command: TURN LEFT 90°');
        this.rotateHeading(-1);
        setTimeout(() => {
          this.telemetry.turningState = 'NONE';
          this.telemetry.movePrimitive = 'STOP';
          this.targetSpeedL = 0;
          this.targetSpeedR = 0;
        }, 800);
        break;

      case 'turn-right-90':
        this.telemetry.turningState = 'RIGHT_90';
        this.telemetry.movePrimitive = 'TURN_R90';
        this.targetSpeedL = settings.motor.turnSpeed;
        this.targetSpeedR = -settings.motor.turnSpeed;
        result.status = 'success';
        result.message = 'Turning right 90°';
        this.logService.add('info', 'movement', 'Command: TURN RIGHT 90°');
        this.rotateHeading(1);
        setTimeout(() => {
          this.telemetry.turningState = 'NONE';
          this.telemetry.movePrimitive = 'STOP';
          this.targetSpeedL = 0;
          this.targetSpeedR = 0;
        }, 800);
        break;

      case 'rotate-180':
        this.telemetry.turningState = 'ROTATE_180';
        this.telemetry.movePrimitive = 'ROTATE_180';
        this.targetSpeedL = settings.motor.turnSpeed;
        this.targetSpeedR = -settings.motor.turnSpeed;
        result.status = 'success';
        result.message = 'Rotating 180°';
        this.logService.add('info', 'movement', 'Command: ROTATE 180°');
        this.rotateHeading(2);
        setTimeout(() => {
          this.telemetry.turningState = 'NONE';
          this.telemetry.movePrimitive = 'STOP';
          this.targetSpeedL = 0;
          this.targetSpeedR = 0;
        }, 1200);
        break;

      case 'advance-cell':
        this.telemetry.movePrimitive = 'ADVANCE_CELL';
        this.telemetry.currentState = 'MOVING';
        this.targetSpeedL = settings.motor.baseSpeed;
        this.targetSpeedR = settings.motor.baseSpeed;
        result.status = 'success';
        result.message = 'Advancing 1 cell';
        this.logService.add('info', 'movement', 'Command: ADVANCE 1 CELL');
        this.advanceCell();
        setTimeout(() => {
          this.telemetry.movePrimitive = 'STOP';
          this.telemetry.currentState = 'IDLE';
          this.targetSpeedL = 0;
          this.targetSpeedR = 0;
        }, 1500);
        break;

      case 'reverse-cell':
        this.telemetry.movePrimitive = 'REVERSE_CELL';
        this.targetSpeedL = -settings.motor.baseSpeed;
        this.targetSpeedR = -settings.motor.baseSpeed;
        result.status = 'success';
        result.message = 'Reversing 1 cell';
        this.logService.add('info', 'movement', 'Command: REVERSE 1 CELL');
        setTimeout(() => {
          this.telemetry.movePrimitive = 'STOP';
          this.targetSpeedL = 0;
          this.targetSpeedR = 0;
        }, 1500);
        break;

      case 'start-exploration':
        this.mazeService.startExploration();
        this.telemetry.currentState = 'EXPLORING';
        this.connectionService.setSystemState('EXPLORING');
        this.connectionService.setMissionPhase('EXPLORATION');
        this.explorationTick = 0;
        result.status = 'success';
        result.message = 'Exploration started';
        this.logService.add('success', 'algorithm', 'Maze exploration started (DFS)');
        break;

      case 'pause-exploration':
        this.mazeService.pauseExploration();
        this.telemetry.currentState = 'PAUSED';
        this.targetSpeedL = 0;
        this.targetSpeedR = 0;
        this.connectionService.setSystemState('PAUSED');
        result.status = 'success';
        result.message = 'Exploration paused';
        this.logService.add('warning', 'algorithm', 'Exploration paused');
        break;

      case 'resume-exploration':
        this.mazeService.resumeExploration();
        this.telemetry.currentState = 'EXPLORING';
        this.connectionService.setSystemState('EXPLORING');
        result.status = 'success';
        result.message = 'Exploration resumed';
        this.logService.add('info', 'algorithm', 'Exploration resumed');
        break;

      case 'stop-exploration':
        this.mazeService.stopExploration();
        this.telemetry.currentState = 'IDLE';
        this.targetSpeedL = 0;
        this.targetSpeedR = 0;
        this.connectionService.setSystemState('IDLE');
        this.connectionService.setMissionPhase('STANDBY');
        result.status = 'success';
        result.message = 'Exploration stopped';
        this.logService.add('warning', 'algorithm', 'Exploration stopped');
        break;

      case 'run-shortest-path':
        this.mazeService.startSolving();
        this.telemetry.currentState = 'SOLVING';
        this.connectionService.setSystemState('SOLVING');
        this.connectionService.setMissionPhase('SOLVING');
        result.status = 'success';
        result.message = 'Running shortest path';
        this.logService.add('success', 'algorithm', 'Computing shortest path...');
        setTimeout(() => this.generateSolvedPath(), 3000);
        break;

      case 'reset-maze':
        this.mazeService.reset();
        this.telemetry.currentState = 'IDLE';
        this.targetSpeedL = 0;
        this.targetSpeedR = 0;
        this.connectionService.setSystemState('IDLE');
        this.connectionService.setMissionPhase('STANDBY');
        result.status = 'success';
        result.message = 'Maze memory cleared';
        this.logService.add('warning', 'algorithm', 'Maze memory wiped');
        break;

      case 'e-stop':
        this.targetSpeedL = 0;
        this.targetSpeedR = 0;
        this.telemetry.targetSpeed = 0;
        this.telemetry.movePrimitive = 'STOP';
        this.telemetry.currentState = 'E-STOP';
        this.mazeService.stopExploration();
        result.status = 'success';
        result.message = 'Emergency stop activated';
        break;

      case 'e-stop-release':
        this.telemetry.currentState = 'IDLE';
        result.status = 'success';
        result.message = 'Emergency stop released';
        break;

      default:
        result.status = 'failed';
        result.message = `Unknown command: ${command}`;
        this.logService.add('error', 'system', `Unknown command: ${command}`);
    }

    this.connectionService.setLastCommand(command, result.status as any);
  }

  private update(): void {
    this.tick++;
    this.telemetry.uptime = Math.floor(this.tick / 2);
    this.telemetry.battery = Math.max(5, 88 - this.tick * 0.005);
    this.telemetry.freshness = Date.now();

    this.rampSpeeds();
    this.updateEncoders();
    this.updateSensors();
    this.updateLineTracking();

    const mazeState = this.mazeService.getState();
    if (mazeState.explorationStatus === 'exploring') {
      this.explorationTick++;
      this.simulateExplorationStep();
    }
  }

  private rampSpeeds(): void {
    const rampRate = 0.3;
    this.telemetry.speedL += (this.targetSpeedL - this.telemetry.speedL) * rampRate;
    this.telemetry.speedR += (this.targetSpeedR - this.telemetry.speedR) * rampRate;

    if (Math.abs(this.telemetry.speedL) < 1 && this.targetSpeedL === 0) this.telemetry.speedL = 0;
    if (Math.abs(this.telemetry.speedR) < 1 && this.targetSpeedR === 0) this.telemetry.speedR = 0;

    this.telemetry.pwmL = Math.round(this.telemetry.speedL * 1.7);
    this.telemetry.pwmR = Math.round(this.telemetry.speedR * 1.7);

    if (this.telemetry.speedL !== 0 || this.telemetry.speedR !== 0) {
      this.telemetry.driftError += (Math.random() - 0.5) * 0.3;
      this.telemetry.driftError *= 0.95;
    } else {
      this.telemetry.driftError *= 0.8;
    }
  }

  private updateEncoders(): void {
    const sl = Math.abs(this.telemetry.speedL);
    const sr = Math.abs(this.telemetry.speedR);
    if (sl > 1 || sr > 1) {
      this.telemetry.encL += Math.round(sl * 0.8 + Math.random() * 2);
      this.telemetry.encR += Math.round(sr * 0.8 + Math.random() * 2);
    }
  }

  private updateSensors(): void {
    const isMoving = Math.abs(this.telemetry.speedL) > 5 || Math.abs(this.telemetry.speedR) > 5;
    const noiseAmp = isMoving ? 40 : 20;

    const phase = this.tick * 0.15;
    const centerShift = Math.sin(phase) * 1.5;

    this.telemetry.sensors = this.sensorBase.map((base, i) => {
      const positionFactor = (i - 2 + centerShift) / 2;
      const adjustedBase = base + positionFactor * (isMoving ? 80 : 30);
      const noise = (Math.random() - 0.5) * noiseAmp;
      return Math.max(0, Math.min(1023, adjustedBase + noise));
    });
  }

  private updateLineTracking(): void {
    const threshold = this.settingsService.get().sensor.threshold;
    const sensors = this.telemetry.sensors;

    let weightedSum = 0;
    let totalWeight = 0;
    let activeCount = 0;

    sensors.forEach((val, i) => {
      if (val > threshold) {
        weightedSum += i * val;
        totalWeight += val;
        activeCount++;
      }
    });

    if (totalWeight > 0) {
      this.telemetry.lineCenter = weightedSum / (totalWeight * 7);
    } else {
      this.telemetry.lineCenter += (Math.random() - 0.5) * 0.05;
    }
    this.telemetry.lineCenter = Math.max(0, Math.min(1, this.telemetry.lineCenter));

    this.telemetry.confidence = Math.min(1.0, activeCount / 4);
    this.telemetry.confidence += (Math.random() - 0.5) * 0.08;
    this.telemetry.confidence = Math.max(0.3, Math.min(1.0, this.telemetry.confidence));

    this.telemetry.junctionDetected = activeCount >= 4;
    this.telemetry.lineLost = activeCount === 0;

    if (this.telemetry.junctionDetected && this.tick % 30 === 0) {
      this.logService.add('info', 'sensors', `Junction detected — ${activeCount} sensors active`);
    }
    if (this.telemetry.lineLost && this.tick % 20 === 0) {
      this.logService.add('warning', 'sensors', 'Line lost — no active sensors');
    }
  }

  private simulateExplorationStep(): void {
    if (this.explorationTick % 6 !== 0) return;

    const state = this.mazeService.getState();
    const pos = state.currentPosition;
    const settings = this.settingsService.get();

    const dfsPriority = ['N', 'E', 'S', 'W'];
    const possibleDirs = dfsPriority.filter(dir => {
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      return nx >= -this.maxMazeX && nx <= this.maxMazeX && ny >= -this.maxMazeY && ny <= this.maxMazeY;
    });

    const unvisitedDirs = possibleDirs.filter(dir => {
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      return !state.nodes[`${nx},${ny}`];
    });

    let chosenDir: string;
    let reason: string;
    let isBacktracking = false;

    if (unvisitedDirs.length > 0) {
      chosenDir = unvisitedDirs[Math.floor(Math.random() * unvisitedDirs.length)];
      reason = `Unvisited neighbor in direction ${chosenDir}`;
    } else if (state.pathHistory.length > 0) {
      const lastMove = state.pathHistory[state.pathHistory.length - 1];
      chosenDir = OPPOSITE[lastMove];
      reason = 'Backtracking — no unvisited neighbors';
      isBacktracking = true;
      this.mazeService.backtrack();
    } else {
      this.mazeService.stopExploration();
      this.telemetry.currentState = 'IDLE';
      this.targetSpeedL = 0;
      this.targetSpeedR = 0;
      this.connectionService.setSystemState('IDLE');
      this.connectionService.setMissionPhase('EXPLORATION_COMPLETE');
      this.logService.add('success', 'algorithm', `Exploration complete! ${state.nodesDiscovered} nodes discovered.`);
      return;
    }

    const nx = pos.x + DX[chosenDir];
    const ny = pos.y + DY[chosenDir];

    const currentKey = `${pos.x},${pos.y}`;
    const currentNode = state.nodes[currentKey];
    if (currentNode && !currentNode.exits.includes(chosenDir)) {
      const exits = [...currentNode.exits, chosenDir];
      this.mazeService.addNode(pos.x, pos.y, exits);
    }

    const randomExits = [OPPOSITE[chosenDir]];
    possibleDirs.forEach(d => {
      if (d !== OPPOSITE[chosenDir] && Math.random() > 0.4) {
        randomExits.push(d);
      }
    });
    this.mazeService.addNode(nx, ny, randomExits);

    this.mazeService.moveRobot(nx, ny, chosenDir, chosenDir);
    this.mazeService.setDecision({
      node: `${nx},${ny}`,
      availableExits: randomExits,
      chosenDirection: chosenDir,
      reason,
      isBacktracking,
    });

    this.telemetry.heading = chosenDir;
    this.targetSpeedL = settings.motor.baseSpeed;
    this.targetSpeedR = settings.motor.baseSpeed;
    this.telemetry.movePrimitive = isBacktracking ? 'BACKTRACK' : 'ADVANCE_CELL';

    if (isBacktracking) {
      this.sensorBase = this.sensorBase.map(() => Math.floor(Math.random() * 300) + 100);
    } else {
      const centerIdx = 1 + Math.floor(Math.random() * 3);
      this.sensorBase = Array.from({ length: 5 }, (_, i) => {
        const dist = Math.abs(i - centerIdx);
        return dist <= 1 ? 600 + Math.floor(Math.random() * 400) : 50 + Math.floor(Math.random() * 200);
      });
    }

    this.logService.add('info', 'algorithm', `Moved ${chosenDir} to (${nx},${ny}) — ${isBacktracking ? 'backtracking' : 'exploring'}`);

    const totalPossible = (this.maxMazeX * 2 + 1) * (this.maxMazeY * 2 + 1);
    const current = this.mazeService.getState().nodesDiscovered;
    if (current >= totalPossible * 0.6) {
      this.mazeService.stopExploration();
      this.telemetry.currentState = 'IDLE';
      this.targetSpeedL = 0;
      this.targetSpeedR = 0;
      this.connectionService.setSystemState('IDLE');
      this.connectionService.setMissionPhase('EXPLORATION_COMPLETE');
      this.logService.add('success', 'algorithm', `Exploration complete! ${current} nodes discovered in ${Math.floor(this.explorationTick / 2)}s`);
    }
  }

  private generateSolvedPath(): void {
    const state = this.mazeService.getState();
    const nodes = Object.values(state.nodes);
    if (nodes.length < 2) {
      this.logService.add('error', 'algorithm', 'Not enough nodes for path solving');
      this.telemetry.currentState = 'IDLE';
      return;
    }

    const path: string[] = [];
    let cx = 0, cy = 0;
    const target = nodes.reduce((far, n) => {
      const dist = Math.abs(n.x) + Math.abs(n.y);
      return dist > (Math.abs(far.x) + Math.abs(far.y)) ? n : far;
    }, nodes[0]);

    while (cx !== target.x || cy !== target.y) {
      if (cx < target.x) { path.push('E'); cx++; }
      else if (cx > target.x) { path.push('W'); cx--; }
      else if (cy < target.y) { path.push('N'); cy++; }
      else { path.push('S'); cy--; }
    }

    this.mazeService.setSolvedPath(path);
    this.telemetry.currentState = 'IDLE';
    this.targetSpeedL = 0;
    this.targetSpeedR = 0;
    this.connectionService.setSystemState('IDLE');
    this.connectionService.setMissionPhase('SOLVED');
    this.logService.add('success', 'algorithm', `Shortest path found! ${path.length} moves: ${path.join('')}`);
  }

  private rotateHeading(steps: number): void {
    const idx = DIRECTIONS.indexOf(this.telemetry.heading);
    const newIdx = ((idx + steps) % 4 + 4) % 4;
    this.telemetry.heading = DIRECTIONS[newIdx];
  }

  private advanceCell(): void {
    const dir = this.telemetry.heading;
    const state = this.mazeService.getState();
    const pos = state.currentPosition;
    const nx = pos.x + DX[dir];
    const ny = pos.y + DY[dir];
    this.mazeService.moveRobot(nx, ny, dir, dir);
  }
}
