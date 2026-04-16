import React, { useState } from 'react';
import { useAppStore, sendRobotCommand } from '@/lib/store';
import { RetroPanel, RetroButton, RetroBadge, RetroStat } from '@/components/ui/RetroComponents';
import { Play, Square, RotateCcw, Zap, GitBranch, Route, MapPin, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MazeControl() {
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const explorationStatus = useAppStore(s => s.maze.explorationStatus);
  const nodesDiscovered = useAppStore(s => s.maze.nodesDiscovered);
  const deadEnds = useAppStore(s => s.maze.deadEnds);
  const backtracks = useAppStore(s => s.maze.backtracks);
  const pathLen = useAppStore(s => s.maze.pathHistory.length);
  const shortestLen = useAppStore(s => s.maze.shortestPath.length);
  const shortestPath = useAppStore(s => s.maze.shortestPath);
  const pathHistory = useAppStore(s => s.maze.pathHistory);
  const simplifiedPath = useAppStore(s => s.maze.simplifiedPath);

  const decision = useAppStore(s => s.maze.currentDecision);
  const posX = useAppStore(s => s.maze.currentPosition.x);
  const posY = useAppStore(s => s.maze.currentPosition.y);
  const posDir = useAppStore(s => s.maze.currentPosition.dir);

  const cmd = (c: string) => sendRobotCommand(c);

  const handleWipe = () => {
    if (!wipeConfirm) {
      setWipeConfirm(true);
      return;
    }
    cmd('reset-maze');
    setWipeConfirm(false);
  };

  const isExploring = explorationStatus === 'exploring';
  const isPaused = explorationStatus === 'paused';
  const isSolved = explorationStatus === 'solved';

  const dirColors: Record<string, string> = { N: 'bg-primary/20 text-primary border-primary/40', S: 'bg-warning/20 text-warning border-warning/40', E: 'bg-success/20 text-success border-success/40', W: 'bg-destructive/20 text-destructive border-destructive/40', L: 'bg-primary/20 text-primary border-primary/40', R: 'bg-success/20 text-success border-success/40', B: 'bg-destructive/20 text-destructive border-destructive/40' };

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-xl">MAZE LOGIC CONTROL</h2>
        <RetroBadge variant={isExploring ? 'success' : isPaused ? 'warning' : isSolved ? 'primary' : 'default'} pulse={isExploring}>
          {isExploring && <span className="live-dot live-dot-success" />}
          {explorationStatus.toUpperCase()}
        </RetroBadge>
        <div className="ml-auto font-body text-[11px] text-muted-foreground">
          <span className="text-primary tabular-nums">({posX},{posY})</span> [{posDir}]
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="flex flex-col gap-4">
          <RetroPanel title="EXECUTION CONTROLS" className="p-4 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <RetroButton variant="success" size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('start-exploration')}>
                <Play className="w-3.5 h-3.5" /> START (LHR)
              </RetroButton>
              <RetroButton variant="warning" size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('halt')}>
                <Square className="w-3.5 h-3.5" /> STOP
              </RetroButton>
              <RetroButton variant="primary" size="sm" className="py-3 flex items-center justify-center gap-2 col-span-2" onClick={() => cmd('run-shortest-path')}>
                <Zap className="w-3.5 h-3.5" /> RUN 2
              </RetroButton>
              <RetroButton size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('back')}>
                <Undo2 className="w-3.5 h-3.5" /> BACK
              </RetroButton>
              <RetroButton size="sm" className="py-3 flex items-center justify-center gap-2" onClick={() => cmd('back2')}>
                <Undo2 className="w-3.5 h-3.5" /> BACK 2
              </RetroButton>
              <RetroButton
                variant={wipeConfirm ? 'destructive' : 'default'}
                size="sm"
                className="py-2 flex items-center justify-center gap-2 col-span-2"
                onClick={handleWipe}
              >
                <RotateCcw className="w-3 h-3" /> {wipeConfirm ? 'ARE YOU SURE? WIPE ALL MEMORY' : 'WIPE MAZE MEMORY'}
              </RetroButton>
            </div>
          </RetroPanel>

          <RetroPanel title="ALGORITHM" variant="soft" className="p-3 pt-4">
            <div className="space-y-2 font-body text-[12px]">
              <div className="flex justify-between"><span className="text-muted-foreground">ENGINE</span><span className="text-primary">LHR + Vector</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PRIORITY</span><span className="text-primary">L → S → R → B</span></div>
            </div>
          </RetroPanel>

          {decision && (
            <RetroPanel title="CURRENT DECISION" titleColor="text-warning" className="p-4 pt-5">
              <div className="space-y-2 font-body text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">NODE</span><span className="text-primary">{decision.node}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">EXITS</span>
                  <div className="flex gap-1">
                    {decision.availableExits.map(e => (
                      <span key={e} className={cn("px-1.5 py-0.5 border text-[9px] font-display", dirColors[e] || '')}>{e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">CHOSEN</span><span className="text-warning font-display text-[11px]">{decision.chosenDirection}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">REASON</span><span className="text-foreground text-[11px] text-right">{decision.reason}</span></div>
                {decision.isBacktracking && <RetroBadge variant="warning" className="mt-1"><Undo2 className="w-3 h-3" /> BACKTRACKING</RetroBadge>}
              </div>
            </RetroPanel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <RetroPanel title="EXPLORATION STATS" className="p-4 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <RetroStat label="NODES" value={nodesDiscovered} color="text-primary" icon={<MapPin className="w-3 h-3" />} />
              <RetroStat label="DEAD ENDS" value={deadEnds} color={deadEnds > 0 ? 'text-warning' : 'text-foreground'} />
              <RetroStat label="BACKTRACKS" value={backtracks} color={backtracks > 0 ? 'text-warning' : 'text-foreground'} />
              <RetroStat label="PATH LEN" value={simplifiedPath ? simplifiedPath.length : pathLen} />
            </div>
            {shortestLen > 0 && (
              <div className="mt-3 pt-2 border-t border-border-soft flex items-center justify-between font-body text-[11px]">
                <span className="text-success font-display text-[10px]">✓ SHORTEST PATH</span>
                <span className="text-success tabular-nums">{shortestLen} moves</span>
              </div>
            )}
          </RetroPanel>

          <RetroPanel title="MOVE SEQUENCE" className="p-4 pt-5">
            <div className="font-body text-[11px] mb-2 text-muted-foreground flex items-center justify-between">
              <span>RAW PATH ({pathLen} moves)</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {pathHistory.length === 0 && <span className="text-muted-foreground text-[11px]">No moves yet</span>}
              {pathHistory.slice(-50).map((m, i) => {
                const isLast = i === Math.min(pathHistory.length, 50) - 1;
                return (
                  <span key={i} className={cn(
                    "px-1.5 py-0.5 border text-[9px] font-display transition-all",
                    dirColors[m] || 'border-border text-foreground',
                    isLast && "ring-1 ring-primary"
                  )}>{m}</span>
                );
              })}
            </div>
            {simplifiedPath && (
              <>
                <div className="font-body text-[11px] mt-4 mb-2 text-success font-display text-[10px]">SIMPLIFIED PATH</div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {simplifiedPath.split('').map((m, i) => (
                    <span key={i} className="px-1.5 py-0.5 border border-success/60 bg-success/15 text-success text-[9px] font-display">{m}</span>
                  ))}
                </div>
              </>
            )}
            {shortestLen > 0 && !simplifiedPath && (
              <>
                <div className="font-body text-[11px] mt-4 mb-2 text-success font-display text-[10px]">OPTIMAL PATH</div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {shortestPath.map((m, i) => (
                    <span key={i} className="px-1.5 py-0.5 border border-success/60 bg-success/15 text-success text-[9px] font-display">{m}</span>
                  ))}
                </div>
              </>
            )}
          </RetroPanel>
        </div>
      </div>
    </div>
  );
}
