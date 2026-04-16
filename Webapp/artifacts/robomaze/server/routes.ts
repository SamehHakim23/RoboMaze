import { Router } from 'express';
import type { SimulatorService } from './services/simulator.js';
import type { MazeService } from './services/maze.js';
import type { LogService } from './services/logs.js';
import type { SettingsService } from './services/settings.js';
import type { ConnectionService } from './services/connection.js';

export function createRoutes(
  simulator: SimulatorService,
  maze: MazeService,
  logs: LogService,
  settings: SettingsService,
  connection: ConnectionService,
): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const status = connection.getStatus();
    const telemetry = simulator.getTelemetry();
    const mazeStats = maze.getStats();
    res.json({
      ...status,
      battery: telemetry.battery,
      uptime: telemetry.uptime,
      mazePhase: mazeStats.explorationStatus,
      nodesDiscovered: mazeStats.nodesDiscovered,
    });
  });

  router.get('/telemetry', (_req, res) => {
    res.json(simulator.getTelemetry());
  });

  router.post('/command', (req, res) => {
    const { command, params } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Command required' });
      return;
    }
    const result = simulator.executeCommand(command, params);
    res.json(result);
  });

  router.get('/command/history', (_req, res) => {
    res.json(simulator.getCommandHistory());
  });

  router.get('/maze', (_req, res) => {
    res.json(maze.getState());
  });

  router.get('/maze/stats', (_req, res) => {
    res.json(maze.getStats());
  });

  router.post('/maze/reset', (_req, res) => {
    res.json(maze.reset());
  });

  router.get('/logs', (req, res) => {
    const { level, category, search, since, count } = req.query;
    if (count) {
      res.json(logs.getRecent(Number(count)));
      return;
    }
    res.json(logs.getAll({
      level: level as string,
      category: category as string,
      search: search as string,
      since: since ? Number(since) : undefined,
    }));
  });

  router.post('/logs/clear', (_req, res) => {
    logs.clear();
    res.json({ success: true });
  });

  router.get('/logs/export', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=robomaze-logs.txt');
    res.send(logs.export());
  });

  router.get('/settings', (_req, res) => {
    res.json(settings.get());
  });

  router.put('/settings', (req, res) => {
    const updated = settings.update(req.body);
    logs.add('info', 'system', 'Settings updated');
    res.json(updated);
  });

  router.post('/settings/reset', (_req, res) => {
    const defaults = settings.reset();
    logs.add('warning', 'system', 'Settings restored to defaults');
    res.json(defaults);
  });

  router.post('/connection', async (req, res) => {
    const result = await connection.handleConnection(req.body);
    res.json(result);
  });

  router.post('/estop', (_req, res) => {
    const isActive = connection.toggleEStop();
    if (isActive) {
      simulator.executeCommand('e-stop');
    } else {
      simulator.executeCommand('e-stop-release');
    }
    res.json({ emergencyStop: isActive });
  });

  router.post('/mode', (req, res) => {
    const { mode } = req.body;
    if (mode !== 'demo' && mode !== 'live') {
      res.status(400).json({ error: 'Mode must be demo or live' });
      return;
    }
    connection.setMode(mode);
    res.json({ mode });
  });

  return router;
}
