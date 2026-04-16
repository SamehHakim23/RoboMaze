import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { RetroPanel, RetroButton, RetroBadge, LiveIndicator } from '@/components/ui/RetroComponents';
import { Trash2, Download, Search, ArrowDown, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Logs() {
  const logs = useAppStore(s => s.logs);
  const showToast = useAppStore(s => s.showToast);
  const endOfLogsRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilter, categoryFilter, searchText]);

  const stats = useMemo(() => ({
    total: logs.length,
    warnings: logs.filter(l => l.level === 'warning').length,
    errors: logs.filter(l => l.level === 'error').length,
  }), [logs]);

  useEffect(() => {
    if (autoScroll) {
      endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs.length, autoScroll]);

  const jumpToLatest = () => {
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const levelColors: Record<string, string> = {
    info: 'text-foreground',
    warning: 'text-warning',
    error: 'text-destructive',
    success: 'text-success',
  };

  const categoryColors: Record<string, string> = {
    system: 'bg-panel-alt text-muted-foreground',
    communication: 'bg-primary/10 text-primary',
    movement: 'bg-warning/10 text-warning',
    algorithm: 'bg-[hsl(180,100%,50%)]/10 text-[hsl(180,100%,50%)]',
    sensors: 'bg-success/10 text-success',
  };

  const handleClear = () => {
    useAppStore.getState().setLogs([]);
    showToast('Logs cleared', 'info');
  };

  const handleExport = () => {
    const text = logs.map(l => {
      const time = new Date(l.timestamp).toISOString();
      return `${time} [${l.level.toUpperCase()}] [${l.category}] ${l.message}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'robomaze-mission-log.txt'; a.click();
    URL.revokeObjectURL(url);
    showToast('Logs exported', 'success');
  };

  const levels = ['all', 'info', 'warning', 'error', 'success'];
  const categories = ['all', 'system', 'communication', 'movement', 'sensors', 'algorithm'];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl">MISSION LOG</h2>
          <LiveIndicator status="active" label="LIVE" />
        </div>
        <div className="flex gap-2 items-center">
          {stats.errors > 0 && <RetroBadge variant="destructive">{stats.errors} ERR</RetroBadge>}
          {stats.warnings > 0 && <RetroBadge variant="warning">{stats.warnings} WARN</RetroBadge>}
          <RetroButton size="sm" onClick={handleClear} aria-label="Clear logs"><Trash2 className="w-3 h-3" /></RetroButton>
          <RetroButton variant="primary" size="sm" onClick={handleExport} aria-label="Export logs"><Download className="w-3 h-3" /></RetroButton>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-background pb-2 space-y-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          {levels.map(l => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={cn("px-2 py-1 text-[9px] font-display border transition-all",
                levelFilter === l ? 'border-primary text-primary bg-primary/10' : 'border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {l.toUpperCase()}
            </button>
          ))}
          <span className="w-px h-4 bg-border mx-1" />
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={cn("px-2 py-1 text-[9px] font-display border transition-all",
                categoryFilter === c ? 'border-warning text-warning bg-warning/10' : 'border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2 border border-border/60 px-2 flex-1 min-w-[120px]">
            <Search className="w-3 h-3 text-muted-foreground" />
            <input
              type="text" placeholder="Search logs..." value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="bg-transparent text-foreground font-body text-[11px] py-1.5 outline-none w-full"
            />
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn("px-2 py-1 text-[9px] font-display border transition-all shrink-0",
              autoScroll ? 'border-success text-success' : 'border-border/60 text-muted-foreground'
            )}
          >
            AUTO-SCROLL
          </button>
          {!autoScroll && (
            <RetroButton size="sm" className="py-1" onClick={jumpToLatest}>
              <ArrowDown className="w-3 h-3" />
            </RetroButton>
          )}
        </div>
      </div>

      <RetroPanel className="flex-1 overflow-hidden p-0" style={{ minHeight: '350px' }}>
        <div ref={scrollContainerRef} className="overflow-y-auto p-3 font-body text-[11px] space-y-0" style={{ maxHeight: '60vh' }}>
          {filteredLogs.length === 0 && <div className="text-muted-foreground text-center mt-10">No matching log entries.</div>}
          {filteredLogs.map(log => {
            const time = new Date(log.timestamp).toISOString().substr(11, 8);
            return (
              <div key={log.id} className={cn("grid grid-cols-[auto_5.5rem_1fr] gap-x-2 py-0.5 items-baseline border-b border-border/10 hover:bg-panel-alt/50", levelColors[log.level] || 'text-foreground')}>
                <span className="opacity-40 tabular-nums text-[10px]">{time}</span>
                <span className={cn("font-display text-[8px] px-1 py-0.5 uppercase text-center truncate",
                  categoryColors[log.category] ||
                  (log.level === 'error' ? 'bg-destructive/15 text-destructive' :
                  log.level === 'warning' ? 'bg-warning/15 text-warning' :
                  log.level === 'success' ? 'bg-success/15 text-success' :
                  'bg-panel-alt text-muted-foreground')
                )}>{log.category}</span>
                <span className="break-words min-w-0">{log.message}</span>
              </div>
            );
          })}
          <div ref={endOfLogsRef} />
        </div>
      </RetroPanel>

      <div className="mt-2 font-body text-[11px] text-muted-foreground flex justify-between items-center">
        <span className="tabular-nums">{filteredLogs.length} / {logs.length} entries</span>
        <span className="flex items-center gap-1.5">
          <span className="live-dot live-dot-success" />
          Real-time
        </span>
      </div>
    </div>
  );
}
