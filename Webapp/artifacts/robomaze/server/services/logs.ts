import type { LogEntry } from '../types.js';

let idCounter = 0;

export class LogService {
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  add(level: LogEntry['level'], category: LogEntry['category'], message: string): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${++idCounter}`,
      timestamp: Date.now(),
      level,
      category,
      message,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    return entry;
  }

  getAll(filters?: { level?: string; category?: string; search?: string; since?: number }): LogEntry[] {
    let result = this.logs;
    if (filters?.since) {
      result = result.filter(l => l.timestamp > filters.since!);
    }
    if (filters?.level) {
      result = result.filter(l => l.level === filters.level);
    }
    if (filters?.category) {
      result = result.filter(l => l.category === filters.category);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(l => l.message.toLowerCase().includes(q));
    }
    return result;
  }

  getRecent(count: number = 10): LogEntry[] {
    return this.logs.slice(-count);
  }

  clear(): void {
    this.logs = [];
  }

  export(): string {
    return this.logs.map(l => {
      const time = new Date(l.timestamp).toISOString().substr(11, 12);
      return `[${time}] [${l.level.toUpperCase().padEnd(7)}] [${l.category.toUpperCase().padEnd(13)}] ${l.message}`;
    }).join('\n');
  }
}
