import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore, sendRobotCommand } from '@/lib/store';
import { RetroPanel, RetroButton, RetroBadge } from '@/components/ui/RetroComponents';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, RotateCw, StopCircle, AlertTriangle, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

const DIR_COMMANDS: Record<string, { start: string; label: string }> = {
  forward: { start: 'forward_start', label: 'FORWARD' },
  backward: { start: 'backward_start', label: 'REVERSE' },
  left: { start: 'left_start', label: 'TURN LEFT' },
  right: { start: 'right_start', label: 'TURN RIGHT' },
};

function HoldButton({ icon, direction, disabled }: { icon: React.ReactNode; direction: string; disabled: boolean }) {
  const holdingRef = useRef(false);
  const [active, setActive] = useState(false);

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    setActive(true);
    sendRobotCommand(DIR_COMMANDS[direction].start);
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
      className={cn("w-[72px] h-[72px] flex items-center justify-center transition-all select-none touch-none",
        active && "scale-95 shadow-[inset_0_0_20px_currentColor]"
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

export default function ManualControl() {
  const [localBaseSpeed, setLocalBaseSpeed] = useState<number | null>(null);
  const [localTurnSpeed, setLocalTurnSpeed] = useState<number | null>(null);
  const emergencyStop = useAppStore(s => s.status.emergencyStop);
  const baseSpeed = useAppStore(s => s.settings.motor.baseSpeed);
  const turnSpeed = useAppStore(s => s.settings.motor.turnSpeed);
  const lastCommand = useAppStore(s => s.status.lastCommand);
  const lastCommandResult = useAppStore(s => s.status.lastCommandResult);
  const commandHistory = useAppStore(s => s.commandHistory);
  const heading = useAppStore(s => s.telemetry.heading);
  const posDir = useAppStore(s => s.maze.currentPosition.dir);
  const posX = useAppStore(s => s.maze.currentPosition.x);
  const posY = useAppStore(s => s.maze.currentPosition.y);
  const movePrimitive = useAppStore(s => s.telemetry.movePrimitive);

  const disabled = emergencyStop;

  const activeKeysRef = useRef(new Set<string>());
  const [activeDir, setActiveDir] = useState<string | null>(null);

  useEffect(() => {
    const keyMap: Record<string, string> = {
      w: 'forward', ArrowUp: 'forward',
      s: 'backward', ArrowDown: 'backward',
      a: 'left', ArrowLeft: 'left',
      d: 'right', ArrowRight: 'right',
    };

    const handleDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.repeat) return;
      const direction = keyMap[e.key];
      if (!direction || disabled) return;
      e.preventDefault();
      activeKeysRef.current.add(e.key);
      setActiveDir(direction);
      sendRobotCommand(DIR_COMMANDS[direction].start);
    };

    const handleUp = (e: KeyboardEvent) => {
      const direction = keyMap[e.key];
      if (!direction) return;
      e.preventDefault();
      activeKeysRef.current.delete(e.key);
      if (activeKeysRef.current.size === 0) {
        setActiveDir(null);
        sendRobotCommand('stop_motors');
      }
    };

    const handleBlur = () => {
      if (activeKeysRef.current.size > 0) {
        activeKeysRef.current.clear();
        setActiveDir(null);
        sendRobotCommand('stop_motors');
      }
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [disabled]);

  const cmd = useCallback(async (command: string) => {
    if (disabled) return;
    await sendRobotCommand(command);
  }, [disabled]);

  const recentCmds = commandHistory.slice(-5).reverse();

  const handleBaseSpeedChange = (val: number) => setLocalBaseSpeed(val);
  const handleTurnSpeedChange = (val: number) => setLocalTurnSpeed(val);

  const handleBaseSpeedCommit = () => {
    if (localBaseSpeed !== null) {
      sendRobotCommand('config', { baseSpeed: localBaseSpeed });
      setLocalBaseSpeed(null);
    }
  };

  const handleTurnSpeedCommit = () => {
    if (localTurnSpeed !== null) {
      sendRobotCommand('config', { turnSpeed: localTurnSpeed });
      setLocalTurnSpeed(null);
    }
  };

  const displayBaseSpeed = localBaseSpeed ?? baseSpeed;
  const displayTurnSpeed = localTurnSpeed ?? turnSpeed;

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-5">
        <h2 className="text-xl">MANUAL OVERRIDE</h2>
      </div>

      {disabled && (
        <div className="mb-4 p-3 border border-destructive bg-destructive/10 flex items-center gap-3 font-body text-sm text-destructive">
          <AlertTriangle className="w-5 h-5 animate-pulse" /> Controls disabled — Emergency stop active
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="flex flex-col gap-4">
          <RetroPanel title="DIRECTIONAL PAD" className="p-6 pt-7">
            <div className="flex flex-col items-center gap-2">
              <HoldButton icon={<ArrowUp className="w-7 h-7" />} direction="forward" disabled={disabled} />
              <div className="flex gap-2">
                <HoldButton icon={<ArrowLeft className="w-7 h-7" />} direction="left" disabled={disabled} />
                <RetroButton
                  variant="destructive" className="w-[72px] h-[72px] flex items-center justify-center"
                  onClick={() => cmd('stop_motors')} disabled={disabled}
                >
                  <StopCircle className="w-7 h-7" />
                </RetroButton>
                <HoldButton icon={<ArrowRight className="w-7 h-7" />} direction="right" disabled={disabled} />
              </div>
              <HoldButton icon={<ArrowDown className="w-7 h-7" />} direction="backward" disabled={disabled} />
            </div>
          </RetroPanel>

          <RetroPanel title="MOTION PREVIEW" variant="soft" className="p-3 pt-4">
            <div className="grid grid-cols-3 gap-3 text-center font-body text-[11px]">
              <div>
                <div className="text-[9px] text-muted-foreground font-display mb-1">POSITION</div>
                <div className="text-primary tabular-nums">({posX}, {posY})</div>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground font-display mb-1">HEADING</div>
                <div className="text-warning">{posDir} / {heading}</div>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground font-display mb-1">STATE</div>
                <div className={cn(movePrimitive !== 'STOP' ? 'text-success' : 'text-muted-foreground')}>{movePrimitive}</div>
              </div>
            </div>
          </RetroPanel>
        </div>

        <div className="flex flex-col gap-4">
          <RetroPanel title="PRECISE MANEUVERS" className="p-4 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <RetroButton size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('rotate_l90')} disabled={disabled}>
                <RotateCcw className="w-3.5 h-3.5" /> 90° L
              </RetroButton>
              <RetroButton size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('rotate_r90')} disabled={disabled}>
                <RotateCw className="w-3.5 h-3.5" /> 90° R
              </RetroButton>
            </div>
            <RetroButton size="sm" className="w-full mt-2 py-3" onClick={() => cmd('rotate_180')} disabled={disabled}>
              180° ROTATE
            </RetroButton>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <RetroButton variant="primary" size="sm" className="py-3" onClick={() => cmd('advance_cell')} disabled={disabled}>
                ADVANCE 1 CELL
              </RetroButton>
              <RetroButton size="sm" className="py-3" onClick={() => cmd('reverse_cell')} disabled={disabled}>
                REVERSE 1 CELL
              </RetroButton>
            </div>
          </RetroPanel>

          <RetroPanel title="SPEED PROFILE" variant="soft" className="p-3 pt-4">
            <div className="space-y-3 font-body text-[12px]">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">BASE VELOCITY</span>
                  <span className="text-primary tabular-nums w-8 text-right">{displayBaseSpeed}</span>
                </div>
                <input
                  type="range" min={0} max={255} value={displayBaseSpeed}
                  onChange={e => handleBaseSpeedChange(Number(e.target.value))}
                  onMouseUp={handleBaseSpeedCommit}
                  onTouchEnd={handleBaseSpeedCommit}
                  className="w-full h-2 bg-background appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">TURN VELOCITY</span>
                  <span className="text-warning tabular-nums w-8 text-right">{displayTurnSpeed}</span>
                </div>
                <input
                  type="range" min={0} max={255} value={displayTurnSpeed}
                  onChange={e => handleTurnSpeedChange(Number(e.target.value))}
                  onMouseUp={handleTurnSpeedCommit}
                  onTouchEnd={handleTurnSpeedCommit}
                  className="w-full h-2 bg-background appearance-none cursor-pointer accent-warning"
                />
              </div>
            </div>
          </RetroPanel>

          <RetroPanel title="COMMAND STATUS" className="p-4 pt-5">
            {lastCommand ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between font-body text-[12px]">
                  <span className="text-foreground font-display text-[10px]">{lastCommand}</span>
                  <RetroBadge variant={lastCommandResult === 'success' ? 'success' : lastCommandResult === 'failed' ? 'destructive' : 'warning'}>
                    {lastCommandResult}
                  </RetroBadge>
                </div>
                {recentCmds.length > 1 && (
                  <div className="border-t border-border-soft pt-2 space-y-1 font-body text-[11px]">
                    {recentCmds.slice(1).map(c => (
                      <div key={c.id} className="flex justify-between text-muted-foreground">
                        <span>{c.command}</span>
                        <span className={c.status === 'success' ? 'text-success' : c.status === 'failed' ? 'text-destructive' : 'text-warning'}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground font-body text-[11px] py-2">No commands sent yet</div>
            )}
          </RetroPanel>

          <RetroPanel title="KEYBOARD MAP" variant="soft" className="p-3 pt-4">
            <div className="space-y-1 font-body text-[11px]">
              {[
                ['W / ↑', 'FORWARD (hold)'],
                ['S / ↓', 'REVERSE (hold)'],
                ['A / ←', 'TURN LEFT (hold)'],
                ['D / →', 'TURN RIGHT (hold)'],
              ].map(([key, action]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-primary font-display text-[9px]">{key}</span>
                  <span className="text-muted-foreground">{action}</span>
                </div>
              ))}
              <div className="text-[10px] text-muted-foreground mt-2 border-t border-border-soft pt-2">
                Hold key/button to move • release to stop
              </div>
            </div>
          </RetroPanel>
        </div>
      </div>
    </div>
  );
}
