import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { MazeNode } from '@/lib/store';
import { RetroPanel, RetroButton, LiveIndicator } from '@/components/ui/RetroComponents';
import { ZoomIn, ZoomOut, Crosshair, Maximize, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const BASE_PX = 80;

const DIR_DX: Record<string, number> = { N: 0, E: 1, S: 0, W: -1 };
const DIR_DY: Record<string, number> = { N: 1, E: 0, S: -1, W: 0 };
const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };

function isDeadEnd(node: MazeNode): boolean {
  return !node.hasL && !node.hasS && !node.hasR;
}

const JUNCTION_MERGE_PX = 40;

function computePixelPositions(
  nodes: Record<string, MazeNode>,
  edgeLengths: Record<string, number>,
): Record<string, { px: number; py: number }> {
  const positions: Record<string, { px: number; py: number }> = {};
  const mergedTo: Record<string, string> = {};
  const ids = Object.keys(nodes).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (ids.length === 0) return positions;

  const deadIds = new Set<number>();
  for (const id of ids) {
    const n = nodes[`${id}`];
    if (n && isDeadEnd(n)) deadIds.add(id);
  }

  const firstNode = nodes[`${ids[0]}`];
  if (firstNode) {
    const heading = firstNode.heading || 'N';
    const relLen = firstNode.relLen ?? 1.0;
    const dist = relLen * BASE_PX;
    positions[`${ids[0]}`] = {
      px: (DIR_DX[heading] || 0) * dist,
      py: (DIR_DY[heading] || 0) * dist,
    };
  } else {
    positions[`${ids[0]}`] = { px: 0, py: BASE_PX };
  }

  for (let i = 1; i < ids.length; i++) {
    const curId = ids[i];
    const curNode = nodes[`${curId}`];
    if (!curNode) continue;

    let prevPos: { px: number; py: number } | undefined;
    let anchorId = -1;
    for (let back = curId - 1; back >= (ids[0] - 1); back--) {
      if (back < ids[0]) {
        prevPos = { px: 0, py: 0 };
        anchorId = -1;
        break;
      }
      if (deadIds.has(back)) continue;
      const resolvedKey = mergedTo[`${back}`] || `${back}`;
      if (positions[resolvedKey]) {
        prevPos = positions[resolvedKey];
        anchorId = back;
        break;
      }
    }
    if (!prevPos) prevPos = { px: 0, py: 0 };

    const heading = curNode.heading || 'N';
    let relLen = curNode.relLen ?? 1.0;
    if (anchorId >= 0 && anchorId !== curId - 1) {
      let totalLen = 0;
      for (let seg = anchorId + 1; seg <= curId; seg++) {
        const segNode = nodes[`${seg}`];
        totalLen += edgeLengths[`${seg - 1}|${seg}`] ?? segNode?.relLen ?? 1.0;
      }
      relLen = totalLen;
    } else {
      relLen = edgeLengths[`${curId - 1}|${curId}`] ?? curNode.relLen ?? 1.0;
    }
    const dist = relLen * BASE_PX;

    const candidatePx = prevPos.px + (DIR_DX[heading] || 0) * dist;
    const candidatePy = prevPos.py + (DIR_DY[heading] || 0) * dist;

    const curIsDead = deadIds.has(curId);

    if (!curIsDead) {
      let matchKey: string | null = null;
      for (const ek of Object.keys(positions)) {
        if (deadIds.has(Number(ek))) continue;
        const ep = positions[ek];
        const ddx = candidatePx - ep.px;
        const ddy = candidatePy - ep.py;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < JUNCTION_MERGE_PX) {
          matchKey = ek;
          break;
        }
      }
      if (matchKey) {
        positions[`${curId}`] = { ...positions[matchKey] };
        mergedTo[`${curId}`] = matchKey;
        continue;
      }
    }

    positions[`${curId}`] = { px: candidatePx, py: candidatePy };
  }

  return positions;
}

function fitToAllNodes(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  setZoom: (z: number) => void,
  setPanOffset: (p: { x: number; y: number }) => void,
  setAutoFit: (v: boolean) => void,
) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const maze = useAppStore.getState().maze;
  const pixelPos = computePixelPositions(maze.nodes, maze.edgeLengths);
  const allPositions = Object.values(pixelPos);

  let minPx = 0, maxPx = 0, minPy = 0, maxPy = 0;
  allPositions.forEach(p => {
    minPx = Math.min(minPx, p.px);
    maxPx = Math.max(maxPx, p.px);
    minPy = Math.min(minPy, p.py);
    maxPy = Math.max(maxPy, p.py);
  });

  const spanPx = (maxPx - minPx) || BASE_PX;
  const spanPy = (maxPy - minPy) || BASE_PX;
  const padding = 60;
  const cw = canvas.width || 800;
  const ch = canvas.height || 500;
  const fitZoom = Math.min(
    (cw - padding * 2) / spanPx,
    (ch - padding * 2) / spanPy,
    2.5,
  );
  const clampedZoom = Math.max(0.3, fitZoom);
  const centerPx = (minPx + maxPx) / 2;
  const centerPy = (minPy + maxPy) / 2;

  setAutoFit(false);
  setZoom(clampedZoom);
  setPanOffset({ x: -centerPx * clampedZoom, y: centerPy * clampedZoom });
}

interface HoveredNode {
  id: number;
  x: number;
  y: number;
  exits: string[];
  visited: boolean;
  visitOrder: number;
  isSolution: boolean;
  screenX: number;
  screenY: number;
}

export default function MazeViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);
  const nodeScreenRef = useRef<{ id: number; x: number; y: number; sx: number; sy: number }[]>([]);
  const [autoFit, setAutoFit] = useState(true);
  const lastNodeCountRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const posX = useAppStore(s => s.maze.currentPosition.x);
  const posY = useAppStore(s => s.maze.currentPosition.y);
  const posDir = useAppStore(s => s.maze.currentPosition.dir);
  const nodesDiscovered = useAppStore(s => s.maze.nodesDiscovered);
  const explorationStatus = useAppStore(s => s.maze.explorationStatus);
  const pathLen = useAppStore(s => s.maze.pathHistory.length);
  const shortestLen = useAppStore(s => s.maze.shortestPath.length);
  const goalX = useAppStore(s => s.maze.goalX);
  const goalY = useAppStore(s => s.maze.goalY);

  useEffect(() => {
    if (!autoFit) return;
    const maze = useAppStore.getState().maze;
    const pixelPos = computePixelPositions(maze.nodes, maze.edgeLengths);
    const allPositions = Object.values(pixelPos);
    const nodeCount = Object.keys(maze.nodes).length;
    if (nodeCount === lastNodeCountRef.current && nodeCount > 0) return;
    lastNodeCountRef.current = nodeCount;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let minPx = 0, maxPx = 0, minPy = 0, maxPy = 0;
    allPositions.forEach(p => {
      minPx = Math.min(minPx, p.px);
      maxPx = Math.max(maxPx, p.px);
      minPy = Math.min(minPy, p.py);
      maxPy = Math.max(maxPy, p.py);
    });

    const spanPx = (maxPx - minPx) || BASE_PX;
    const spanPy = (maxPy - minPy) || BASE_PX;
    const padding = 60;
    const cw = canvas.width || 800;
    const ch = canvas.height || 500;
    const fitZoom = Math.min((cw - padding * 2) / spanPx, (ch - padding * 2) / spanPy, 2.5);
    const clampedZoom = Math.max(0.3, fitZoom);
    const centerPx = (minPx + maxPx) / 2;
    const centerPy = (minPy + maxPy) / 2;

    setZoom(clampedZoom);
    setPanOffset({ x: -centerPx * clampedZoom, y: centerPy * clampedZoom });
  }, [nodesDiscovered, autoFit]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = Math.max(400, parent.clientHeight - 10);
    }

    const maze = useAppStore.getState().maze;
    const t = Date.now();
    const cxBase = canvas.width / 2;
    const cyBase = canvas.height / 2;

    const pixelPos = computePixelPositions(maze.nodes, maze.edgeLengths);

    const nodePixelByGrid: Record<string, { px: number; py: number }> = {};
    for (const id of Object.keys(maze.nodes)) {
      const node = maze.nodes[id];
      const pp = pixelPos[id];
      if (node && pp && node.x != null && node.y != null) {
        nodePixelByGrid[`${node.x},${node.y}`] = pp;
      }
    }

    const toScreen = (px: number, py: number) => ({
      sx: cxBase + px * zoom + panOffset.x,
      sy: cyBase - py * zoom + panOffset.y,
    });

    ctx.fillStyle = 'hsl(220, 30%, 5%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'hsla(220, 20%, 12%, 0.4)';
    ctx.lineWidth = 1;
    const gridStep = BASE_PX * zoom;
    const ox = ((cxBase + panOffset.x) % gridStep + gridStep) % gridStep;
    const oy = ((cyBase + panOffset.y) % gridStep + gridStep) % gridStep;
    for (let x = ox; x < canvas.width; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = oy; y < canvas.height; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const ids = Object.keys(maze.nodes).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const screenPos: { id: number; x: number; y: number; sx: number; sy: number }[] = [];

    const deadEndIds = new Set<number>();
    for (const id of ids) {
      const node = maze.nodes[`${id}`];
      if (node && isDeadEnd(node)) deadEndIds.add(id);
    }

    if (ids.length > 0) {
      const firstId = ids[0];
      const firstPos = pixelPos[`${firstId}`];
      if (firstPos) {
        const firstNode = maze.nodes[`${firstId}`];
        const heading = firstNode?.heading || 'N';
        const { sx: sx0, sy: sy0 } = toScreen(0, 0);
        const { sx: sx1, sy: sy1 } = toScreen(firstPos.px, firstPos.py);

        let drawX1 = sx0, drawY1 = sy0, drawX2 = sx1, drawY2 = sy1;
        if (heading === 'N' || heading === 'S') {
          const midX = (sx0 + sx1) / 2;
          drawX1 = midX; drawX2 = midX;
        } else {
          const midY = (sy0 + sy1) / 2;
          drawY1 = midY; drawY2 = midY;
        }

        ctx.strokeStyle = 'hsla(180, 100%, 40%, 0.6)';
        ctx.lineWidth = 2.5 * zoom;
        ctx.beginPath();
        ctx.moveTo(drawX1, drawY1);
        ctx.lineTo(drawX2, drawY2);
        ctx.stroke();
      }
    }

    for (const id of ids) {
      if (id <= ids[0]) continue;

      let parentId = -1;
      for (let back = id - 1; back >= ids[0]; back--) {
        if (!deadEndIds.has(back)) { parentId = back; break; }
      }
      if (parentId < 0) continue;

      const pPosA = pixelPos[`${parentId}`];
      const pPosB = pixelPos[`${id}`];
      if (!pPosA || !pPosB) continue;

      const nodeB = maze.nodes[`${id}`];
      const nodeA = maze.nodes[`${parentId}`];
      const heading = nodeB?.heading || 'N';

      const { sx: ax, sy: ay } = toScreen(pPosA.px, pPosA.py);
      const { sx: bx, sy: by } = toScreen(pPosB.px, pPosB.py);

      let drawX1 = ax, drawY1 = ay, drawX2 = bx, drawY2 = by;
      if (heading === 'N' || heading === 'S') {
        const midX = (ax + bx) / 2;
        drawX1 = midX;
        drawX2 = midX;
      } else {
        const midY = (ay + by) / 2;
        drawY1 = midY;
        drawY2 = midY;
      }

      const isSolEdge = (nodeA?.isSolution && nodeB?.isSolution);
      ctx.strokeStyle = isSolEdge ? 'hsla(120, 100%, 50%, 0.7)' : 'hsla(180, 100%, 40%, 0.6)';
      ctx.lineWidth = isSolEdge ? 4 * zoom : 2.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(drawX1, drawY1);
      ctx.lineTo(drawX2, drawY2);
      ctx.stroke();
    }

    const connectedDirs = new Map<string, Set<string>>();
    for (const id of ids) {
      const node = maze.nodes[`${id}`];
      if (!node) continue;
      const idKey = `${id}`;
      if (!connectedDirs.has(idKey)) connectedDirs.set(idKey, new Set());

      if (id === ids[0]) {
        connectedDirs.get(idKey)!.add(OPPOSITE[node.heading] || '');
      } else {
        let hasParent = false;
        for (let back = id - 1; back >= ids[0]; back--) {
          if (!deadEndIds.has(back) && maze.nodes[`${back}`]) { hasParent = true; break; }
        }
        if (hasParent) connectedDirs.get(idKey)!.add(OPPOSITE[node.heading] || '');
      }

      for (let fwd = id + 1; fwd <= ids[ids.length - 1]; fwd++) {
        const fwdNode = maze.nodes[`${fwd}`];
        if (!fwdNode) continue;
        if (deadEndIds.has(id)) break;
        connectedDirs.get(idKey)!.add(fwdNode.heading);
        break;
      }
    }

    for (const id of ids) {
      const node = maze.nodes[`${id}`];
      if (!node) continue;
      const pPos = pixelPos[`${id}`];
      if (!pPos) continue;
      const { sx: px, sy: py } = toScreen(pPos.px, pPos.py);
      screenPos.push({ id, x: node.x, y: node.y, sx: px, sy: py });

      const dead = isDeadEnd(node);

      if (!dead) {
        const branchLen = BASE_PX * 0.35 * zoom;
        ctx.strokeStyle = 'hsla(180, 60%, 50%, 0.45)';
        ctx.lineWidth = 2 * zoom;
        ctx.lineCap = 'round';

        const connected = connectedDirs.get(`${id}`) || new Set();
        for (const dir of node.exits) {
          if (!connected.has(dir)) {
            const dx = DIR_DX[dir] || 0;
            const dy = DIR_DY[dir] || 0;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + dx * branchLen, py - dy * branchLen);
            ctx.stroke();
          }
        }
      }

      const sz = 10 * zoom;

      if (dead) {
        ctx.fillStyle = 'hsl(0, 80%, 50%)';
        ctx.shadowColor = 'hsl(0, 80%, 50%)';
        ctx.shadowBlur = 6;
        const r = 6 * zoom;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(0, 0%, 100%)';
        ctx.font = `bold ${8 * zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('X', px, py);
      } else if (node.isSolution) {
        ctx.fillStyle = 'hsl(120, 80%, 50%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 6;
        const r = 7 * zoom;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'hsl(180, 80%, 50%)';
        const r = 6 * zoom;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }

    {
      const { sx: startSx, sy: startSy } = toScreen(0, 0);
      const sz = 10 * zoom;
      ctx.fillStyle = 'hsl(120, 100%, 50%)';
      ctx.shadowColor = 'hsl(120, 100%, 50%)';
      ctx.shadowBlur = 10;
      ctx.fillRect(startSx - sz, startSy - sz, sz * 2, sz * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'hsl(220, 30%, 6%)';
      ctx.font = `bold ${10 * zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', startSx, startSy);
    }

    if (maze.goalX != null && maze.goalY != null && (maze.goalX !== 0 || maze.goalY !== 0)) {
      const goalKey = `${maze.goalX},${maze.goalY}`;
      const goalPixel = nodePixelByGrid[goalKey];
      if (goalPixel) {
        const { sx: gx, sy: gy } = toScreen(goalPixel.px, goalPixel.py);
        ctx.fillStyle = 'hsl(45, 100%, 50%)';
        ctx.shadowColor = 'hsl(45, 100%, 50%)';
        ctx.shadowBlur = 10;
        const r = 10 * zoom;
        ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(220, 30%, 6%)';
        ctx.font = `bold ${10 * zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', gx, gy);
      }
    }

    if (maze.shortestPath.length > 0 && ids.length > 0) {
      ctx.strokeStyle = 'hsla(120, 100%, 60%, 0.6)';
      ctx.lineWidth = 2.5 * zoom;
      ctx.setLineDash([6, 3]);
      const startPos = pixelPos[`${ids[0]}`] || { px: 0, py: 0 };
      const { sx: startX, sy: startY } = toScreen(startPos.px, startPos.py);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      for (let i = 1; i < ids.length && i <= maze.shortestPath.length; i++) {
        const p = pixelPos[`${ids[i]}`];
        if (!p) continue;
        const { sx, sy } = toScreen(p.px, p.py);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const lastId = ids.length > 0 ? ids[ids.length - 1] : -1;
    const robotPxPos = lastId >= 0 ? pixelPos[`${lastId}`] : null;
    const { sx: rx, sy: ry } = robotPxPos ? toScreen(robotPxPos.px, robotPxPos.py) : toScreen(0, 0);
    const pulse = Math.sin(t / 300) * 0.3 + 0.7;

    ctx.fillStyle = `hsla(0, 100%, 60%, ${pulse})`;
    ctx.shadowColor = 'hsl(0, 100%, 60%)';
    ctx.shadowBlur = 14;
    ctx.save();
    ctx.translate(rx, ry);
    let angle = 0;
    const d = maze.currentPosition.dir;
    if (d === 'N') angle = 0;
    if (d === 'E') angle = Math.PI / 2;
    if (d === 'S') angle = Math.PI;
    if (d === 'W') angle = -Math.PI / 2;
    ctx.rotate(angle);
    const arrowSize = 14 * zoom;
    ctx.beginPath();
    ctx.moveTo(0, -arrowSize);
    ctx.lineTo(arrowSize * 0.6, arrowSize * 0.5);
    ctx.lineTo(0, arrowSize * 0.15);
    ctx.lineTo(-arrowSize * 0.6, arrowSize * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    nodeScreenRef.current = screenPos;
  }, [zoom, panOffset, explorationStatus, goalX, goalY]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 150);
    return () => clearInterval(interval);
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    setAutoFit(false);
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hitRadius = 18 * zoom;
    const maze = useAppStore.getState().maze;

    for (const pos of nodeScreenRef.current) {
      if (Math.abs(mx - pos.sx) < hitRadius && Math.abs(my - pos.sy) < hitRadius) {
        const node = maze.nodes[`${pos.id}`];
        if (node) {
          setHoveredNode({ ...node, screenX: pos.sx, screenY: pos.sy });
          return;
        }
      }
    }
    setHoveredNode(null);
  }, [zoom, isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: panOffset.x, panY: panOffset.y };
      setAutoFit(false);
    }
  }, [panOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPanOffset({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setAutoFit(false);
    setPanOffset(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const centerOnRobot = () => { setPanOffset({ x: 0, y: 0 }); setZoom(1); setAutoFit(true); lastNodeCountRef.current = 0; };

  const isExploring = explorationStatus === 'exploring';
  const explorationPct = nodesDiscovered > 0 ? Math.min(100, nodesDiscovered * 5) : 0;

  return (
    <div className="flex flex-col animate-in fade-in duration-500" style={{ height: '100%', minHeight: '500px' }}>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl">LIVE MAP</h2>
          <LiveIndicator status={isExploring ? 'active' : 'idle'} label={explorationStatus.toUpperCase()} />
        </div>
        <div className="flex gap-1">
          <RetroButton size="sm" className="p-2" onClick={() => { setAutoFit(false); setZoom(z => Math.min(3, z + 0.25)); }} aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></RetroButton>
          <RetroButton size="sm" className="p-2" onClick={() => { setAutoFit(false); setZoom(z => Math.max(0.3, z - 0.25)); }} aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></RetroButton>
          <RetroButton size="sm" className="p-2" onClick={centerOnRobot} aria-label="Center on robot"><Crosshair className="w-3.5 h-3.5" /></RetroButton>
          <RetroButton size="sm" className="p-2" onClick={() => fitToAllNodes(canvasRef, setZoom, setPanOffset, setAutoFit)} aria-label="Fit to view"><Maximize className="w-3.5 h-3.5" /></RetroButton>
        </div>
      </div>

      <RetroPanel className="flex-1 p-0 overflow-hidden relative" style={{ minHeight: '400px' }}>
        <div className="absolute top-3 left-3 z-10">
          <div className="bg-background/90 pixel-border-soft p-3 space-y-1.5 font-body text-[11px]">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[hsl(120,100%,50%)]" /> <span className="text-muted-foreground">Start (0,0)</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[hsl(45,100%,50%)]" /> <span className="text-muted-foreground">Goal</span></div>
            <div className="flex items-center gap-2"><div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-transparent border-b-destructive" /> <span className="text-muted-foreground">Robot</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[hsl(180,80%,50%)]" /> <span className="text-muted-foreground">Junction</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[hsl(0,80%,50%)]" /> <span className="text-muted-foreground">Dead End</span></div>
            <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-[hsla(180,100%,40%,0.6)]" /> <span className="text-muted-foreground">Path</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[hsla(180,60%,50%,0.45)]" /> <span className="text-muted-foreground">Exit branch</span></div>
            <div className="border-t border-border-soft pt-2 mt-1 space-y-1">
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">POS</span><span className="text-primary tabular-nums">({posX},{posY}) [{posDir}]</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">NODES</span><span className="text-primary tabular-nums">{nodesDiscovered}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">PATH</span><span className="tabular-nums">{pathLen}</span></div>
              {shortestLen > 0 && <div className="flex justify-between gap-6"><span className="text-muted-foreground">SOLVE</span><span className="text-success tabular-nums">{shortestLen}</span></div>}
            </div>
          </div>
        </div>

        <button
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-background/60 hover:bg-background/80 border border-border-soft rounded p-1.5 transition-colors"
          onClick={() => panBy(0, 100)}
          aria-label="Pan up"
        >
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 bg-background/60 hover:bg-background/80 border border-border-soft rounded p-1.5 transition-colors"
          onClick={() => panBy(0, -100)}
          aria-label="Pan down"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/60 hover:bg-background/80 border border-border-soft rounded p-1.5 transition-colors"
          onClick={() => panBy(100, 0)}
          aria-label="Pan left"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/60 hover:bg-background/80 border border-border-soft rounded p-1.5 transition-colors"
          onClick={() => panBy(-100, 0)}
          aria-label="Pan right"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {hoveredNode && (
          <div
            className="absolute z-20 bg-background/95 pixel-border p-3 pointer-events-none font-body text-[11px] space-y-1"
            style={{ left: Math.min(hoveredNode.screenX + 15, (canvasRef.current?.width || 400) - 160), top: hoveredNode.screenY - 10 }}
          >
            <div className="font-display text-xs text-primary mb-1">NODE #{hoveredNode.id} ({hoveredNode.x}, {hoveredNode.y})</div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">EXITS</span><span className="text-success">{hoveredNode.exits.join(', ') || 'none'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">VISIT #</span><span>{hoveredNode.visitOrder}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">SOLUTION</span><span className={hoveredNode.isSolution ? 'text-success' : 'text-muted-foreground'}>{hoveredNode.isSolution ? 'YES' : 'NO'}</span></div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full bg-background"
          style={{ height: '100%', minHeight: '380px', cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setHoveredNode(null); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </RetroPanel>

      <div className="mt-2 flex items-center gap-4 font-body text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">DISCOVERY:</span>
          <div className="w-24 h-2 bg-background pixel-border-soft">
            <div className="h-full bg-primary/70 transition-all" style={{ width: `${explorationPct}%` }} />
          </div>
          <span className="text-primary tabular-nums">{explorationPct}%</span>
        </div>
        <span className="text-muted-foreground">ALGO: <span className="text-foreground">LHR</span></span>
        <span className="text-muted-foreground">ZOOM: <span className="text-foreground tabular-nums">{zoom.toFixed(2)}x</span></span>
        {shortestLen > 0 && <span className="text-success ml-auto">✓ SHORTEST PATH FOUND</span>}
      </div>
    </div>
  );
}
