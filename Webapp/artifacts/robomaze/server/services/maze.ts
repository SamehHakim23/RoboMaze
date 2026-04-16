import type { MazeState, MazeNode } from '../types.js';

export class MazeService {
  private state: MazeState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): MazeState {
    const startNode: MazeNode = {
      x: 0, y: 0, exits: [], visited: true, visitOrder: 0, isSolution: false,
    };
    return {
      nodes: { '0,0': startNode },
      currentPosition: { x: 0, y: 0, dir: 'N' },
      pathHistory: [],
      shortestPath: [],
      explorationStatus: 'idle',
      nodesDiscovered: 1,
      edgesDiscovered: 0,
      deadEnds: 0,
      backtracks: 0,
      currentDepth: 0,
      stackSize: 1,
      startTime: null,
      currentDecision: null,
    };
  }

  getState(): MazeState {
    return JSON.parse(JSON.stringify(this.state));
  }

  reset(): MazeState {
    this.state = this.createInitialState();
    return this.getState();
  }

  startExploration(): void {
    this.state.explorationStatus = 'exploring';
    this.state.startTime = Date.now();
  }

  pauseExploration(): void {
    if (this.state.explorationStatus === 'exploring') {
      this.state.explorationStatus = 'paused';
    }
  }

  resumeExploration(): void {
    if (this.state.explorationStatus === 'paused') {
      this.state.explorationStatus = 'exploring';
    }
  }

  stopExploration(): void {
    this.state.explorationStatus = 'idle';
  }

  startSolving(): void {
    this.state.explorationStatus = 'solving';
  }

  addNode(x: number, y: number, exits: string[]): MazeNode {
    const key = `${x},${y}`;
    if (!this.state.nodes[key]) {
      this.state.nodesDiscovered++;
      const node: MazeNode = {
        x, y, exits, visited: true,
        visitOrder: this.state.nodesDiscovered,
        isSolution: false,
      };
      this.state.nodes[key] = node;

      exits.forEach(exit => {
        this.state.edgesDiscovered++;
      });

      if (exits.length === 1) {
        this.state.deadEnds++;
      }
    }
    return this.state.nodes[key];
  }

  moveRobot(x: number, y: number, dir: string, moveDir: string): void {
    this.state.currentPosition = { x, y, dir };
    this.state.pathHistory.push(moveDir);
    this.state.currentDepth = this.state.pathHistory.length;
  }

  setDecision(decision: MazeState['currentDecision']): void {
    this.state.currentDecision = decision;
  }

  backtrack(): void {
    this.state.backtracks++;
    if (this.state.pathHistory.length > 0) {
      this.state.pathHistory.pop();
    }
  }

  setSolvedPath(path: string[]): void {
    this.state.shortestPath = path;
    this.state.explorationStatus = 'solved';

    Object.values(this.state.nodes).forEach(n => n.isSolution = false);

    let cx = 0, cy = 0;
    this.state.nodes['0,0'].isSolution = true;
    for (const dir of path) {
      if (dir === 'N') cy++;
      if (dir === 'S') cy--;
      if (dir === 'E') cx++;
      if (dir === 'W') cx--;
      const key = `${cx},${cy}`;
      if (this.state.nodes[key]) {
        this.state.nodes[key].isSolution = true;
      }
    }
  }

  getStats() {
    return {
      nodesDiscovered: this.state.nodesDiscovered,
      edgesDiscovered: this.state.edgesDiscovered,
      deadEnds: this.state.deadEnds,
      backtracks: this.state.backtracks,
      currentDepth: this.state.currentDepth,
      stackSize: this.state.stackSize,
      pathLength: this.state.pathHistory.length,
      shortestPathLength: this.state.shortestPath.length,
      explorationStatus: this.state.explorationStatus,
      elapsedTime: this.state.startTime ? Date.now() - this.state.startTime : 0,
    };
  }
}
