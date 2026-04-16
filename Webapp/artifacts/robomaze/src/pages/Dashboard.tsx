import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore, sendRobotCommand } from '@/lib/store';
import { RetroPanel, RetroButton, RetroBadge } from '@/components/ui/RetroComponents';
import {
  Play, Square, Pause, RotateCcw, AlertTriangle, Zap, Undo2,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Terminal
} from 'lucide-react';
import { cn } from '@/lib/utils';

function SensorBar({ value, index, threshold }: { value: number; index: number; threshold: number }) {
  const pct = Math.min(100, (value / 1023) * 100);
  const threshPct = Math.min(100, (threshold / 1023) * 100);
  const isActive = value > threshold;
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span className={cn("font-body text-[10px] tabular-nums", isActive ? "text-success" : "text-muted-foreground")}>{Math.round(value)}</span>
      <div className="w-full h-16 bg-background/50 pixel-border-soft relative">
        <div className="absolute left-0 right-0 border-t border-dashed border-warning/40" style={{ bottom: `${threshPct}%` }} />
        <div
          className={cn("absolute bottom-0 left-0 right-0 transition-all duration-200", isActive ? "bg-success/80" : "bg-muted/50")}
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="font-display text-[8px] text-muted-foreground">S{index + 1}</span>
    </div>
  );
}

function CenterEstimation({ center, sensors, threshold }: { center: number; sensors: number[]; threshold: number }) {
  const activeCount = sensors.filter(s => s > threshold).length;
  const leftBias = center < 0.4;
  const rightBias = center > 0.6;
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className={cn("text-[9px] font-display w-6 text-right", leftBias ? "text-warning" : "text-muted-foreground")}>L</span>
      <div className="flex-1 h-3 bg-background/50 pixel-border-soft relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary transition-all duration-200"
          style={{ left: `${Math.max(0, Math.min(96, center * 100))}%` }}
        />
      </div>
      <span className={cn("text-[9px] font-display w-6", rightBias ? "text-warning" : "text-muted-foreground")}>R</span>
      <span className="text-[9px] font-body text-muted-foreground ml-1">{activeCount}/5</span>
    </div>
  );
}

function MiniHoldButton({ icon, direction, disabled, className }: { icon: React.ReactNode; direction: string; disabled: boolean; className?: string }) {
  const holdingRef = useRef(false);
  const [active, setActive] = useState(false);
  const cmdMap: Record<string, string> = {
    forward: 'forward_start',
    backward: 'backward_start',
    left: 'left_start',
    right: 'right_start',
  };

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    setActive(true);
    sendRobotCommand(cmdMap[direction]);
  }, [disabled, direction]);

  const stopHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setActive(false);
    sendRobotCommand('stop_motors');
  }, []);

  useEffect(() => {
    return () => {
      if (holdingRef.current) {
        holdingRef.current = false;
        sendRobotCommand('stop_motors');
      }
    };
  }, []);

  return (
    <RetroButton
      variant="primary"
      active={active}
      disabled={disabled}
      className={cn("flex items-center justify-center select-none touch-none",
        active && "scale-95 shadow-[inset_0_0_15px_currentColor]",
        className
      )}
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      onTouchCancel={stopHold}
    >
      {icon}
    </RetroButton>
  );
}

function LogDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logs = useAppStore(s => s.logs);
  const recentLogs = useMemo(() => logs.slice(-15).reverse(), [logs]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <RetroButton
        size="sm"
        variant={open ? 'primary' : 'ghost'}
        className="p-2"
        onClick={() => setOpen(!open)}
        aria-label="Event log"
      >
        <Terminal className="w-4 h-4" />
      </RetroButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[420px] max-h-64 overflow-y-auto bg-background border-2 border-border pixel-border z-50 shadow-lg shadow-primary/10">
          <div className="px-3 py-2 border-b border-border-soft font-display text-[10px] text-primary">RECENT EVENTS</div>
          <div className="p-2 space-y-0.5 font-body text-[11px]">
            {recentLogs.length === 0 && <div className="text-muted-foreground py-2 text-center">No events yet</div>}
            {recentLogs.map((log, i) => {
              const time = new Date(log.timestamp).toISOString().substr(11, 8);
              const colors: Record<string, string> = { info: 'text-foreground', warning: 'text-warning', error: 'text-destructive', success: 'text-success' };
              return (
                <div key={log.id} className={cn("flex gap-2 py-0.5 items-start", i === 0 && "bg-primary/5 -mx-1 px-1", colors[log.level] || '')}>
                  <span className="opacity-40 shrink-0 tabular-nums">{time}</span>
                  <span className={cn("shrink-0 font-display text-[9px] px-1 py-0.5 uppercase",
                    log.level === 'error' ? 'bg-destructive/15 text-destructive' :
                    log.level === 'warning' ? 'bg-warning/15 text-warning' :
                    log.level === 'success' ? 'bg-success/15 text-success' :
                    'bg-primary/10 text-muted-foreground'
                  )}>{log.category}</span>
                  <span className="break-all">{log.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [resetConfirm, setResetConfirm] = useState(false);

  const speedL = useAppStore(s => s.telemetry.speedL);
  const speedR = useAppStore(s => s.telemetry.speedR);
  const encL = useAppStore(s => s.telemetry.encL);
  const encR = useAppStore(s => s.telemetry.encR);
  const pwmL = useAppStore(s => s.telemetry.pwmL);
  const pwmR = useAppStore(s => s.telemetry.pwmR);
  const driftError = useAppStore(s => s.telemetry.driftError);
  const lineCenter = useAppStore(s => s.telemetry.lineCenter);
  const confidence = useAppStore(s => s.telemetry.confidence);
  const junctionDetected = useAppStore(s => s.telemetry.junctionDetected);
  const lineLost = useAppStore(s => s.telemetry.lineLost);
  const heading = useAppStore(s => s.telemetry.heading);
  const movePrimitive = useAppStore(s => s.telemetry.movePrimitive);
  const paused = useAppStore(s => s.telemetry.paused);

  const s0 = useAppStore(s => s.telemetry.sensors[0]);
  const s1 = useAppStore(s => s.telemetry.sensors[1]);
  const s2 = useAppStore(s => s.telemetry.sensors[2]);
  const s3 = useAppStore(s => s.telemetry.sensors[3]);
  const s4 = useAppStore(s => s.telemetry.sensors[4]);
  const sensors = useMemo(() => [s0, s1, s2, s3, s4], [s0, s1, s2, s3, s4]);

  const systemState = useAppStore(s => s.status.systemState);
  const robotWsStatus = useAppStore(s => s.robotWsStatus);
  const missionPhase = useAppStore(s => s.status.missionPhase);
  const lastCommand = useAppStore(s => s.status.lastCommand);
  const lastCommandResult = useAppStore(s => s.status.lastCommandResult);
  const nodesDiscovered = useAppStore(s => s.status.nodesDiscovered);
  const threshold = useAppStore(s => s.settings.sensor.threshold);
  const emergencyStop = useAppStore(s => s.status.emergencyStop);

  const mazeDir = useAppStore(s => s.maze.currentPosition.dir);
  const mazePosX = useAppStore(s => s.maze.currentPosition.x);
  const mazePosY = useAppStore(s => s.maze.currentPosition.y);
  const pathLen = useAppStore(s => s.maze.pathHistory.length);
  const shortestLen = useAppStore(s => s.maze.shortestPath.length);
  const mazeGoalX = useAppStore(s => s.maze.goalX);
  const mazeGoalY = useAppStore(s => s.maze.goalY);

  const currentState = useAppStore(s => s.telemetry.currentState);
  const isActive = missionPhase === 'EXPLORING' || missionPhase === 'SOLVING' || missionPhase === 'RETURNING';
  const stateVariant = isActive ? 'success' : missionPhase === 'AWAITING CMD' ? 'warning' : 'default';
  const connVariant = robotWsStatus === 'connected' ? 'success' : robotWsStatus === 'connecting' ? 'warning' : 'default';

  const cmd = (c: string) => sendRobotCommand(c);

  const handleReset = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    cmd('reset-maze');
    setResetConfirm(false);
  };

  const disabled = emergencyStop;

  useEffect(() => {
    const keyMap: Record<string, string> = {
      ArrowUp: 'forward_start', ArrowDown: 'backward_start',
      ArrowLeft: 'left_start', ArrowRight: 'right_start',
      w: 'forward_start', s: 'backward_start',
      a: 'left_start', d: 'right_start',
      W: 'forward_start', S: 'backward_start',
      A: 'left_start', D: 'right_start',
    };
    const held = new Set<string>();

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const cmd = keyMap[e.key];
      if (!cmd) return;
      e.preventDefault();
      held.add(e.key);
      sendRobotCommand(cmd);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!keyMap[e.key]) return;
      if (!held.has(e.key)) return;
      held.delete(e.key);
      if (held.size === 0) sendRobotCommand('stop_motors');
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (held.size > 0) sendRobotCommand('stop_motors');
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl mr-2">MISSION CONSOLE</h2>
        <div className="flex flex-wrap items-center gap-2">
          <RetroBadge variant={stateVariant} pulse={isActive}>
            {isActive && <span className="live-dot live-dot-success" />}
            SYS: {systemState}
          </RetroBadge>
          <RetroBadge variant={connVariant}>LINK: {robotWsStatus.toUpperCase()}</RetroBadge>
          <RetroBadge variant="primary">PHASE: {missionPhase}</RetroBadge>
        </div>
        <div className="ml-auto">
          <LogDropdown />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RetroPanel title="MOTION" titleColor="text-success" variant="soft" className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">SPD L</div>
              <div className={cn("font-display text-lg tabular-nums", speedL !== 0 && "text-success")}>{speedL.toFixed(0)}</div>
              <div className="text-[8px] text-muted-foreground">RPM</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">SPD R</div>
              <div className={cn("font-display text-lg tabular-nums", speedR !== 0 && "text-success")}>{speedR.toFixed(0)}</div>
              <div className="text-[8px] text-muted-foreground">RPM</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">ENC L</div>
              <div className="font-body text-base tabular-nums">{encL}</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">ENC R</div>
              <div className="font-body text-base tabular-nums">{encR}</div>
            </div>
          </div>
        </RetroPanel>

        <RetroPanel title="CONTROL" titleColor="text-warning" variant="soft" className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">PWM L</div>
              <div className="font-display text-lg tabular-nums">{pwmL}</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center">
              <div className="text-[9px] text-muted-foreground font-display mb-1">PWM R</div>
              <div className="font-display text-lg tabular-nums">{pwmR}</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center col-span-2">
              <div className="text-[9px] text-muted-foreground font-display mb-1">DRIFT ERROR</div>
              <div className={cn("font-display text-lg tabular-nums", Math.abs(driftError) > 1 ? "text-warning" : "text-foreground")}>{driftError.toFixed(2)}</div>
              <div className="w-full h-1.5 bg-background mt-1">
                <div className={cn("h-full transition-all", Math.abs(driftError) > 1 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, Math.abs(driftError) / 5 * 100)}%` }} />
              </div>
            </div>
          </div>
        </RetroPanel>

        <RetroPanel title="NAVIGATION" titleColor="text-primary" variant="soft" className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel-alt pixel-border-soft p-2.5 text-center col-span-2">
              <div className="text-[9px] text-muted-foreground font-display mb-1">LINE CENTER</div>
              <div className="font-display text-xl tabular-nums text-primary neon-text-primary">{lineCenter.toFixed(2)}</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2 text-center">
              <div className="text-[8px] text-muted-foreground font-display mb-0.5">CONF</div>
              <div className={cn("font-display text-sm tabular-nums", confidence > 0.7 ? "text-success" : "text-warning")}>{(confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-panel-alt pixel-border-soft p-2 text-center">
              <div className="text-[8px] text-muted-foreground font-display mb-0.5">STATUS</div>
              <div className={cn("font-display text-sm", lineLost ? "text-destructive animate-pulse" : junctionDetected ? "text-warning" : "text-success")}>
                {lineLost ? 'LOST' : junctionDetected ? 'JCT!' : 'TRACK'}
              </div>
            </div>
          </div>
        </RetroPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RetroPanel title="IR SENSOR ARRAY" className="p-3 pt-4">
            <div className="flex gap-1.5">
              {sensors.map((v, i) => <SensorBar key={i} value={v} index={i} threshold={threshold} />)}
            </div>
            <CenterEstimation center={lineCenter} sensors={sensors} threshold={threshold} />
            <div className="flex gap-4 mt-2 font-body text-[11px] border-t border-border-soft pt-2 flex-wrap items-center">
              <span className="flex items-center gap-1.5">
                <span className={cn("live-dot", lineLost ? "live-dot-destructive" : "live-dot-success")} />
                {lineLost ? 'LINE LOST' : 'TRACKING'}
              </span>
              {junctionDetected && (
                <span className="text-warning animate-pulse font-display text-[10px]">⚡ JUNCTION DETECTED</span>
              )}
              <span className="ml-auto text-muted-foreground">THRESH: {threshold}</span>
            </div>
          </RetroPanel>

          <RetroPanel title="MANUAL OVERRIDE" titleColor="text-primary" className="p-3 pt-4 flex-1 flex flex-col">
            <div className="flex gap-2 flex-1">
              <MiniHoldButton
                icon={<ArrowLeft className="w-7 h-7" />}
                direction="left"
                disabled={disabled}
                className="flex-1 h-full min-h-[72px]"
              />
              <MiniHoldButton
                icon={<ArrowUp className="w-7 h-7" />}
                direction="forward"
                disabled={disabled}
                className="flex-1 h-full min-h-[72px]"
              />
              <MiniHoldButton
                icon={<ArrowDown className="w-7 h-7" />}
                direction="backward"
                disabled={disabled}
                className="flex-1 h-full min-h-[72px]"
              />
              <MiniHoldButton
                icon={<ArrowRight className="w-7 h-7" />}
                direction="right"
                disabled={disabled}
                className="flex-1 h-full min-h-[72px]"
              />
            </div>
          </RetroPanel>
        </div>

        <div className="flex flex-col gap-4">
          <RetroPanel title="QUICK ACTIONS" className="p-4 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <RetroButton variant="success" size="sm" className="flex flex-col items-center py-3 gap-1" onClick={() => cmd('start-exploration')}>
                <Play className="w-4 h-4" /><span>START</span>
              </RetroButton>
              <RetroButton variant="primary" size="sm" className="flex flex-col items-center py-3 gap-1" onClick={() => cmd('run-shortest-path')}>
                <Zap className="w-4 h-4" /><span>RUN 2</span>
              </RetroButton>
              <RetroButton
                variant={paused ? 'success' : 'default'}
                size="sm"
                className="flex items-center justify-center gap-2 py-2"
                onClick={() => cmd(paused ? 'resume' : 'pause')}
              >
                {paused ? <><Play className="w-3 h-3" /> RESUME</> : <><Pause className="w-3 h-3" /> PAUSE</>}
              </RetroButton>
              <RetroButton
                variant={resetConfirm ? 'destructive' : 'default'}
                size="sm"
                className="flex items-center justify-center gap-2 py-2"
                onClick={handleReset}
              >
                <RotateCcw className="w-3 h-3" /> {resetConfirm ? 'CONFIRM?' : 'RESET'}
              </RetroButton>
              <RetroButton size="sm" className="flex items-center justify-center gap-2 py-2" onClick={() => cmd('back')}>
                <Undo2 className="w-3 h-3" /> BACK
              </RetroButton>
              <RetroButton size="sm" className="flex items-center justify-center gap-2 py-2" onClick={() => cmd('back2')}>
                <Undo2 className="w-3 h-3" /> BACK 2
              </RetroButton>
            </div>
            <RetroButton variant="destructive" size="sm" className="w-full mt-2 py-2 flex items-center justify-center gap-2" onClick={() => cmd('halt')}>
              <AlertTriangle className="w-3 h-3" /> E-STOP
            </RetroButton>
            {lastCommand && (
              <div className="mt-3 pt-2 border-t border-border-soft font-body text-[11px] flex items-center gap-2">
                <span className="text-muted-foreground">LAST:</span>
                <span className="text-foreground">{lastCommand}</span>
                <span className={cn("ml-auto font-display text-[9px]", lastCommandResult === 'success' ? 'text-success' : lastCommandResult === 'failed' ? 'text-destructive' : 'text-warning')}>
                  {lastCommandResult}
                </span>
              </div>
            )}
          </RetroPanel>

          <RetroPanel title="ROBOT STATE" variant="soft" className="p-3 pt-4">
            <div className="space-y-1.5 font-body text-[12px]">
              <div className="flex justify-between"><span className="text-muted-foreground">POS:</span><span className="text-primary tabular-nums">({mazePosX}, {mazePosY})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">HDG:</span><span className="text-warning">{heading}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">STATE:</span><span className="text-primary">{currentState}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">MOVE:</span><span className={cn(movePrimitive !== 'STOP' && "text-success")}>{movePrimitive}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GOAL:</span><span className={cn(mazeGoalX !== null && mazeGoalY !== null ? "text-warning" : "text-muted-foreground")}>{mazeGoalX !== null && mazeGoalY !== null ? `(${mazeGoalX}, ${mazeGoalY})` : '—'}</span></div>
              {paused && <div className="flex justify-between"><span className="text-muted-foreground">PAUSED:</span><span className="text-warning animate-pulse">YES</span></div>}
              <div className="border-t border-border-soft pt-1.5 mt-1 grid grid-cols-3 gap-1 text-center">
                <div><div className="text-[8px] text-muted-foreground">NODES</div><div className="text-success tabular-nums">{nodesDiscovered}</div></div>
                <div><div className="text-[8px] text-muted-foreground">PATH</div><div className="tabular-nums">{pathLen}</div></div>
                <div><div className="text-[8px] text-muted-foreground">SOLVE</div><div className={cn("tabular-nums", shortestLen > 0 && "text-success")}>{shortestLen > 0 ? shortestLen : '—'}</div></div>
              </div>
            </div>
          </RetroPanel>
        </div>
      </div>
    </div>
  );
}
