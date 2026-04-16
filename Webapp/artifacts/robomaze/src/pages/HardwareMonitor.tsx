import React, { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { RetroPanel, RetroStat, LiveIndicator } from '@/components/ui/RetroComponents';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

function MotorColumn({ label, speed, target, pwm, ticks }: { label: string; speed: number; target: number; pwm: number; ticks: number }) {
  return (
    <div>
      <h3 className="font-display text-[10px] text-primary mb-3 flex items-center gap-2">
        {label}
        {pwm !== 0 && <span className="live-dot live-dot-success" />}
      </h3>
      <div className="space-y-2.5 font-body text-[12px]">
        <div className="flex justify-between items-baseline">
          <span className="text-muted-foreground">SPEED</span>
          <span className={cn("text-lg font-display tabular-nums", speed !== 0 && "text-success")}>{speed.toFixed(1)} <span className="text-[10px] text-muted-foreground">RPM</span></span>
        </div>
        <div className="flex justify-between"><span className="text-muted-foreground">TARGET</span><span className="tabular-nums">{target}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">PWM</span><span className="tabular-nums">{pwm}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">TICKS</span><span className="tabular-nums">{ticks}</span></div>
      </div>
    </div>
  );
}

function SensorCell({ value, index, threshold }: { value: number; index: number; threshold: number }) {
  const isActive = value > threshold;
  const pct = Math.min(100, (value / 1023) * 100);
  return (
    <div className={cn("pixel-border-soft p-2 text-center transition-colors", isActive && "bg-success/5")}>
      <div className="font-display text-[9px] text-muted-foreground mb-1">CH{index + 1}</div>
      <div className={cn("font-display text-sm tabular-nums", isActive ? 'text-success' : 'text-muted-foreground')}>{Math.round(value)}</div>
      <div className="w-full h-1.5 bg-background mt-1.5 relative">
        <div className={cn("h-full transition-all duration-200", isActive ? 'bg-success' : 'bg-muted/40')} style={{ width: `${pct}%` }} />
      </div>
      <div className="font-body text-[9px] mt-1 text-muted-foreground">{isActive ? 'BLK' : 'WHT'}</div>
    </div>
  );
}

export default function HardwareMonitor() {
  const [now, setNow] = useState(Date.now());
  const pwmL = useAppStore(s => s.telemetry.pwmL);
  const pwmR = useAppStore(s => s.telemetry.pwmR);
  const freshness = useAppStore(s => s.telemetry.freshness);
  const systemState = useAppStore(s => s.status.systemState);
  const connStatus = useAppStore(s => s.status.connectionStatus);
  const connectedAt = useAppStore(s => s.connectedAt);

  const s0 = useAppStore(s => s.telemetry.sensors[0]);
  const s1 = useAppStore(s => s.telemetry.sensors[1]);
  const s2 = useAppStore(s => s.telemetry.sensors[2]);
  const s3 = useAppStore(s => s.telemetry.sensors[3]);
  const s4 = useAppStore(s => s.telemetry.sensors[4]);
  const sensors = useMemo(() => [s0, s1, s2, s3, s4], [s0, s1, s2, s3, s4]);

  const threshold = useAppStore(s => s.settings.sensor.threshold);
  const confidence = useAppStore(s => s.telemetry.confidence);
  const lineLost = useAppStore(s => s.telemetry.lineLost);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const telemetryAge = now - freshness;
  const isStale = freshness === 0 || telemetryAge > 500;
  const isConnected = connStatus === 'connected';

  const uptimeSeconds = connectedAt ? Math.floor((now - connectedAt) / 1000) : 0;
  const uptimeMin = Math.floor(uptimeSeconds / 60);
  const uptimeSec = uptimeSeconds % 60;

  const issues = useMemo(() => {
    const a: { level: 'error' | 'warning'; message: string }[] = [];
    if (lineLost) a.push({ level: 'error', message: 'Line lost — sensor below threshold' });
    if (isStale && isConnected) a.push({ level: 'warning', message: `Telemetry stale (${(telemetryAge / 1000).toFixed(1)}s)` });
    if (!isConnected) a.push({ level: 'warning', message: 'Robot disconnected' });
    return a;
  }, [lineLost, isStale, telemetryAge, isConnected]);

  return (
    <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xl">HARDWARE DIAGNOSTICS</h2>
        <LiveIndicator status={isStale ? 'warning' : 'active'} label={isStale ? 'STALE' : 'LIVE'} />
        {issues.length > 0 && (
          <span className="ml-auto font-display text-[10px] text-warning flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {issues.length} ISSUE{issues.length > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {issues.map((issue, i) => (
            <div key={i} className={cn("flex items-center gap-2 px-3 py-1.5 font-body text-[11px] border",
              issue.level === 'error' ? 'border-destructive/50 text-destructive bg-destructive/5' : 'border-warning/50 text-warning bg-warning/5'
            )}>
              <span className="font-display text-[9px]">{issue.level === 'error' ? '✕' : '⚠'}</span>
              {issue.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RetroPanel title="MOTORS & ENCODERS" className="p-4 pt-5">
          <div className="grid grid-cols-2 gap-6">
            <MotorColumn label="LEFT DRIVE" speed={0} target={0} pwm={pwmL} ticks={0} />
            <MotorColumn label="RIGHT DRIVE" speed={0} target={0} pwm={pwmR} ticks={0} />
          </div>
        </RetroPanel>

        <div className="flex flex-col gap-4">
          <RetroPanel title="RAW SENSOR DUMP" className="p-4 pt-5">
            <div className="grid grid-cols-5 gap-1.5">
              {sensors.map((v, i) => <SensorCell key={i} value={v} index={i} threshold={threshold} />)}
            </div>
            <div className="mt-3 pt-2 border-t border-border-soft font-body text-[11px] flex justify-between items-center">
              <span className="text-muted-foreground">THRESH: <span className="text-foreground">{threshold}</span></span>
              <span className="text-muted-foreground">CONF: <span className={cn("tabular-nums", confidence > 0.7 ? 'text-success' : 'text-warning')}>{(confidence * 100).toFixed(0)}%</span></span>
            </div>
          </RetroPanel>

          <RetroPanel title="SYSTEM HEALTH" className="p-4 pt-5">
            <div className="space-y-2 font-body text-[12px]">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">BATTERY</span>
                <span className="text-warning tabular-nums">N/A</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">STATE</span><span className="text-primary">{systemState}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">UPTIME</span><span className="tabular-nums">{isConnected ? `${uptimeMin}m ${uptimeSec}s` : '—'}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">CONN</span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("live-dot", isConnected ? 'live-dot-success' : 'live-dot-warning')} />
                  <span className={cn(isConnected ? 'text-success' : 'text-destructive')}>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">LATENCY</span><span className="tabular-nums text-muted-foreground">—</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">TELEMETRY</span>
                <LiveIndicator status={isStale ? 'warning' : 'active'} label={isStale ? 'STALE' : 'LIVE'} />
              </div>
            </div>
          </RetroPanel>
        </div>
      </div>
    </div>
  );
}
