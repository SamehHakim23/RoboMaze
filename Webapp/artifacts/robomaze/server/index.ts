import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRoutes } from './routes.js';
import { SettingsService } from './services/settings.js';
import { LogService } from './services/logs.js';
import { MazeService } from './services/maze.js';
import { ConnectionService } from './services/connection.js';
import { SimulatorService } from './services/simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction ? (parseInt(process.env.PORT || '4001', 10)) : 4001;

const app = express();

app.use(cors());
app.use(express.json());

const settingsService = new SettingsService();
const logService = new LogService();
const mazeService = new MazeService();
const connectionService = new ConnectionService(logService);
const simulatorService = new SimulatorService(mazeService, logService, connectionService, settingsService);

const routes = createRoutes(simulatorService, mazeService, logService, settingsService, connectionService);
app.use('/roboapi', routes);

app.get('/roboapi/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/roboapi/robot-status', (_req, res) => {
  const settings = settingsService.get();
  const ip = settings.communication.wifiIp || '172.20.10.9';
  res.json({ ip });
});

app.post('/roboapi/settings/wifi-ip', (req, res) => {
  const { ip } = req.body;
  if (!ip || typeof ip !== 'string') {
    res.status(400).json({ error: 'IP address required' });
    return;
  }
  settingsService.update({ communication: { wifiIp: ip } } as any);
  logService.add('info', 'system', `WiFi IP updated to ${ip}`);
  console.log(`[RoboMaze] WiFi IP updated to ${ip}`);
  res.json({ success: true, ip });
});

if (isProduction) {
  const staticDir = path.resolve(__dirname, '..', 'public');
  app.use(express.static(staticDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[RoboMaze API] Backend running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  console.log(`[RoboMaze API] WiFi connection is direct: browser → ws://{robotIp}:81 (no relay)`);
});
