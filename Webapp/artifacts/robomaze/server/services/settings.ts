import fs from 'fs';
import path from 'path';
import type { Settings } from '../types.js';

const CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.json');

const DEFAULT_SETTINGS: Settings = {
  motor: {
    baseSpeed: 170,
    turnSpeed: 130,
  },
  sensor: {
    threshold: 500,
  },
  communication: {
    wifiIp: '172.20.10.9',
    pollingInterval: 100,
    reconnectPolicy: 'auto',
    bleEnabled: false,
    preferredMode: 'wifi',
  },
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

export class SettingsService {
  private settings: Settings;

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          motor: { ...DEFAULT_SETTINGS.motor, ...parsed.motor },
          sensor: { ...DEFAULT_SETTINGS.sensor, ...parsed.sensor },
          communication: { ...DEFAULT_SETTINGS.communication, ...parsed.communication },
          advanced: { ...DEFAULT_SETTINGS.advanced, ...parsed.advanced },
        };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  get(): Settings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  update(partial: Partial<Settings>): Settings {
    if (partial.motor) this.settings.motor = { ...this.settings.motor, ...partial.motor };
    if (partial.sensor) this.settings.sensor = { ...this.settings.sensor, ...partial.sensor };
    if (partial.communication) this.settings.communication = { ...this.settings.communication, ...partial.communication };
    if (partial.advanced) this.settings.advanced = { ...this.settings.advanced, ...partial.advanced };
    this.save();
    return this.get();
  }

  reset(): Settings {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.save();
    return this.get();
  }

  private save(): void {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }
}
