import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAppStore, startPolling, stopPolling } from '@/lib/store';
import { connectionManager } from '@/lib/connection';
import { cn } from '@/lib/utils';
import { 
  Terminal, Gamepad2, Cpu, Map, Route, Settings, 
  Activity, AlertTriangle, Menu, X, Wifi, WifiOff
} from 'lucide-react';
import { RetroButton, RetroBadge } from '@/components/ui/RetroComponents';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'DASHBOARD', icon: Activity },
  { href: '/control', label: 'CTRL PAD', icon: Gamepad2 },
  { href: '/hardware', label: 'HARDWARE', icon: Cpu },
  { href: '/maze-control', label: 'MAZE CMD', icon: Route },
  { href: '/maze-viz', label: 'MAZE MAP', icon: Map },
  { href: '/settings', label: 'SETTINGS', icon: Settings },
  { href: '/logs', label: 'MISSION LOG', icon: Terminal },
];

function ToastNotification() {
  const toast = useAppStore(s => s.toast);
  const clearToast = useAppStore(s => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  const colors: Record<string, string> = {
    info: 'border-primary bg-primary/10 text-primary',
    success: 'border-success bg-success/10 text-success',
    warning: 'border-warning bg-warning/10 text-warning',
    error: 'border-destructive bg-destructive/10 text-destructive',
  };

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[100] px-6 py-3 border-2 font-body text-sm animate-in slide-in-from-bottom duration-300",
      colors[toast.type]
    )}>
      {toast.message}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [httpBannerDismissed, setHttpBannerDismissed] = useState(false);

  const robotWsStatus = useAppStore(s => s.robotWsStatus);
  const robotBleStatus = useAppStore(s => s.robotBleStatus);
  const emergencyStop = useAppStore(s => s.status.emergencyStop);
  const systemState = useAppStore(s => s.status.systemState);
  const missionPhase = useAppStore(s => s.status.missionPhase);
  const currentState = useAppStore(s => s.telemetry.currentState);
  const apiError = useAppStore(s => s.apiError);
  const preferredMode = useAppStore(s => s.settings.communication.preferredMode);

  const isConnected = robotWsStatus === 'connected' || robotBleStatus === 'connected';
  const isConnecting = preferredMode === 'bluetooth'
    ? robotBleStatus === 'connecting'
    : robotWsStatus === 'connecting' || robotBleStatus === 'connecting';
  const connLabel = robotBleStatus === 'connected' ? 'CONNECTED (BLE)' : robotWsStatus === 'connected' ? 'CONNECTED (WiFi)' : isConnecting ? 'CONNECTING' : 'DISCONNECTED';

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const showMixedContentWarning = isHttps && preferredMode !== 'bluetooth' && !httpBannerDismissed;

  useEffect(() => {
    startPolling(2000);

    connectionManager.onMessage = (data: any) => {
      useAppStore.getState().handleRobotMessage(data);
    };

    connectionManager.setPreferredMode(preferredMode === 'bluetooth' ? 'bluetooth' : 'wifi');

    return () => {
      stopPolling();
      connectionManager.disconnect();
      connectionManager.disconnectBle();
    };
  }, []);

  useEffect(() => {
    connectionManager.setPreferredMode(preferredMode === 'bluetooth' ? 'bluetooth' : 'wifi');
  }, [preferredMode]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const handleEStop = () => {
    if (connectionManager.connected) {
      connectionManager.sendCommand('halt');
      useAppStore.getState().showToast('E-STOP sent', 'warning');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden scanlines">
      <ToastNotification />

      {apiError && (
        <div className="fixed top-0 left-0 right-0 z-[90] bg-destructive/90 text-background text-center py-2 font-body text-xs">
          API: {apiError}
        </div>
      )}

      {showMixedContentWarning && (
        <div className="fixed top-0 left-0 right-0 z-[80] bg-warning/90 text-background text-center py-2.5 px-4 font-body text-xs flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            WiFi mode unavailable over HTTPS — browsers block ws:// connections. Use BLE mode, or host this app locally on the robot's network.
          </span>
          <button
            onClick={() => setHttpBannerDismissed(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-background/20 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <header className="md:hidden flex items-center justify-between p-4 border-b-4 border-border bg-panel z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 border-2 border-primary bg-primary/20 flex items-center justify-center neon-box-primary rounded-sm">
            <span className="font-display text-[9px] text-primary leading-none">RM</span>
          </div>
          <span className="font-display text-primary text-sm">ROBOMAZE</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-primary focus:outline-none">
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 bg-panel border-r-4 border-border flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b-4 border-border hidden md:flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary bg-primary/20 flex items-center justify-center neon-box-primary rounded-sm">
            <span className="font-display text-[10px] text-primary leading-none">RM</span>
          </div>
          <h1 className="font-display text-lg text-primary neon-text-primary">ROBOMAZE</h1>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (location === '/' && item.href === '/dashboard');
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-4 py-3 font-display text-xs transition-colors pixel-border",
                isActive 
                  ? "bg-primary/20 text-primary pixel-border-primary neon-box-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-border/20"
              )}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t-4 border-border bg-background">
          <div className="text-[10px] font-display text-muted-foreground mb-2">SYS STATUS</div>
          <div className="flex flex-col gap-2 font-body text-sm">
            <div className="flex justify-between"><span>PWR:</span> <span className="text-warning">N/A</span></div>
            <div className="flex justify-between"><span>STATE:</span> <span className="text-primary">{systemState}</span></div>
            <div className="flex justify-between"><span>MISSION:</span> <span className="text-warning">{missionPhase}</span></div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden relative">
        <div className="h-14 border-b-4 border-border bg-panel px-4 items-center justify-between z-20 hidden sm:flex">
          <div className="flex items-center gap-3">
            <RetroBadge variant={isConnected ? 'success' : isConnecting ? 'warning' : 'destructive'}>
              <span className={cn("live-dot mr-1", isConnected ? "live-dot-success" : isConnecting ? "live-dot-warning" : "live-dot-destructive")} />
              {connLabel}
            </RetroBadge>
          </div>

          <div className="flex items-center gap-2">
            {emergencyStop && (
              <RetroBadge variant="destructive" pulse>
                <AlertTriangle className="w-3 h-3" /> E-STOP ACTIVE
              </RetroBadge>
            )}
            <RetroButton
              variant="destructive"
              size="sm"
              className="flex items-center gap-1"
              onClick={handleEStop}
            >
              <AlertTriangle className="w-3 h-3" />
              E-STOP
            </RetroButton>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
