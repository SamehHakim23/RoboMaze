import React, { useState, useEffect } from 'react';
import { useAppStore, sendRobotCommand } from '@/lib/store';
import { connectionManager } from '@/lib/connection';
import { RetroPanel, RetroButton, RetroBadge } from '@/components/ui/RetroComponents';
import { Save, RotateCcw, Download, Upload, Wifi, Bluetooth, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

function SettingRow({ label, value, onChange, min, max, step, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 group">
      <div className="flex flex-col">
        <span className="text-muted-foreground font-body text-sm">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/60 font-body">{hint}</span>}
      </div>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step || 1}
        className="w-24 bg-background border border-border text-foreground text-right px-2 py-1.5 font-body text-sm focus:border-primary outline-none transition-colors"
      />
    </div>
  );
}

function SettingToggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-muted-foreground font-body text-sm">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/60 font-body">{hint}</span>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn("px-3 py-1 border font-display text-[10px] transition-all",
          value ? 'border-success text-success bg-success/10' : 'border-border text-muted-foreground'
        )}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

type SettingsTab = 'basic' | 'advanced';

export default function Settings() {
  const storeSettings = useAppStore(s => s.settings);
  const setSettings = useAppStore(s => s.setSettings);
  const showToast = useAppStore(s => s.showToast);
  const robotWsStatus = useAppStore(s => s.robotWsStatus);
  const robotBleStatus = useAppStore(s => s.robotBleStatus);
  const [local, setLocal] = useState(storeSettings);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('basic');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(storeSettings);
  }, [storeSettings]);

  const update = (section: string, key: string, value: any) => {
    setLocal(prev => ({
      ...prev,
      [section]: { ...(prev as any)[section], [key]: value },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSettings(local);
    setDirty(false);

    const configPayload: any = {};
    if (local.motor.baseSpeed !== storeSettings.motor.baseSpeed) configPayload.baseSpeed = local.motor.baseSpeed;
    if (local.motor.turnSpeed !== storeSettings.motor.turnSpeed) configPayload.turnSpeed = local.motor.turnSpeed;

    if (tab === 'advanced') {
      const adv = local.advanced;
      const oldAdv = storeSettings.advanced;
      if (adv.settleTime !== oldAdv.settleTime) configPayload.settleTime = adv.settleTime;
      if (adv.junctionCreep !== oldAdv.junctionCreep) configPayload.junctionCreep = adv.junctionCreep;
      if (adv.forcedTurn !== oldAdv.forcedTurn) configPayload.forcedTurn = adv.forcedTurn;
      if (adv.searchTimeout !== oldAdv.searchTimeout) configPayload.searchTimeout = adv.searchTimeout;
      if (adv.peekCreep !== oldAdv.peekCreep) configPayload.peekCreep = adv.peekCreep;
      if (adv.goalCreep !== oldAdv.goalCreep) configPayload.goalCreep = adv.goalCreep;
      if (adv.corrT1 !== oldAdv.corrT1) configPayload.corrT1 = adv.corrT1;
      if (adv.corrT2 !== oldAdv.corrT2) configPayload.corrT2 = adv.corrT2;
      if (adv.corrT3 !== oldAdv.corrT3) configPayload.corrT3 = adv.corrT3;
      if (adv.corrT4 !== oldAdv.corrT4) configPayload.corrT4 = adv.corrT4;
    }

    if (Object.keys(configPayload).length > 0) {
      await sendRobotCommand('config', configPayload);
    }

    showToast('Settings saved', 'success');
    setSaving(false);
  };

  const handleReset = () => {
    const defaults = {
      motor: { baseSpeed: 170, turnSpeed: 130 },
      sensor: { threshold: 500 },
      communication: local.communication,
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
    setLocal(defaults);
    setDirty(true);
    showToast('Settings restored to defaults — save to apply', 'warning');
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(local, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'robomaze-config.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Config exported', 'info');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        setLocal(parsed);
        setDirty(true);
        showToast('Config loaded — save to apply', 'info');
      } catch {
        showToast('Invalid config file', 'error');
      }
    };
    input.click();
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-xl">CONFIGURATION</h2>
        <div className="flex gap-2 items-center">
          {dirty && <RetroBadge variant="warning" pulse>UNSAVED</RetroBadge>}
          <RetroButton size="sm" onClick={handleImport} aria-label="Import config"><Upload className="w-3 h-3" /></RetroButton>
          <RetroButton size="sm" onClick={handleExport} aria-label="Export config"><Download className="w-3 h-3" /></RetroButton>
          <RetroButton variant="destructive" size="sm" onClick={handleReset} aria-label="Reset to defaults"><RotateCcw className="w-3 h-3" /></RetroButton>
          <RetroButton variant="success" size="sm" className="flex items-center gap-2" onClick={handleSave} disabled={!dirty || saving}>
            <Save className="w-3 h-3" /> {saving ? 'SAVING...' : dirty ? 'SAVE' : 'SAVED'}
          </RetroButton>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <RetroButton variant={tab === 'basic' ? 'primary' : 'ghost'} active={tab === 'basic'} size="sm" onClick={() => setTab('basic')}>BASIC</RetroButton>
        <RetroButton variant={tab === 'advanced' ? 'primary' : 'ghost'} active={tab === 'advanced'} size="sm" onClick={() => setTab('advanced')}>ADVANCED</RetroButton>
      </div>

      {tab === 'basic' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RetroPanel title="MOTOR SPEED" className="p-4 pt-5 space-y-4">
            <SettingRow label="BASE SPEED" hint="Forward movement speed (0-255)" value={local.motor.baseSpeed} onChange={v => update('motor', 'baseSpeed', v)} min={0} max={255} />
            <SettingRow label="TURN SPEED" hint="Turning speed (0-255)" value={local.motor.turnSpeed} onChange={v => update('motor', 'turnSpeed', v)} min={0} max={255} />
          </RetroPanel>

          <RetroPanel title="SENSOR" className="p-4 pt-5 space-y-4">
            <SettingRow label="THRESHOLD" hint="Black/white cutoff (0-1023)" value={local.sensor.threshold} onChange={v => update('sensor', 'threshold', v)} min={0} max={1023} />
          </RetroPanel>

          <RetroPanel title="CONNECTION" className="p-4 pt-5 space-y-4 lg:col-span-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground font-body text-sm">WIFI IP</span>
                    <span className="text-[10px] text-muted-foreground/60 font-body">Robot's IP address</span>
                  </div>
                  <input
                    type="text" value={local.communication.wifiIp}
                    onChange={e => update('communication', 'wifiIp', e.target.value)}
                    className="w-40 bg-background border border-border text-foreground text-right px-2 py-1.5 font-body text-sm focus:border-primary outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground font-body text-sm">PREFERRED MODE</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => update('communication', 'preferredMode', 'wifi')}
                      className={cn("px-3 py-1.5 border text-[10px] font-display flex items-center gap-1.5 transition-all",
                        local.communication.preferredMode === 'wifi' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
                      )}
                    >
                      <Wifi className="w-3 h-3" /> WIFI
                    </button>
                    <button
                      onClick={() => update('communication', 'preferredMode', 'bluetooth')}
                      className={cn("px-3 py-1.5 border text-[10px] font-display flex items-center gap-1.5 transition-all",
                        local.communication.preferredMode === 'bluetooth' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
                      )}
                    >
                      <Bluetooth className="w-3 h-3" /> BLE
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground font-body text-sm">WIFI STATUS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RetroBadge variant={robotWsStatus === 'connected' ? 'success' : robotWsStatus === 'connecting' ? 'warning' : 'default'}>
                      {robotWsStatus.toUpperCase()}
                    </RetroBadge>
                    {robotWsStatus === 'connected' ? (
                      <RetroButton size="sm" variant="destructive" className="text-[9px] px-2 py-1" onClick={() => connectionManager.disconnect()}>DISCONNECT</RetroButton>
                    ) : (
                      <RetroButton size="sm" variant="success" className="text-[9px] px-2 py-1" onClick={() => connectionManager.connect()}>CONNECT</RetroButton>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground font-body text-sm">BLE STATUS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RetroBadge variant={robotBleStatus === 'connected' ? 'success' : robotBleStatus === 'connecting' ? 'warning' : 'default'}>
                      {robotBleStatus.toUpperCase()}
                    </RetroBadge>
                    {robotBleStatus === 'connected' ? (
                      <RetroButton size="sm" variant="destructive" className="text-[9px] px-2 py-1" onClick={() => connectionManager.disconnectBle()}>DISCONNECT</RetroButton>
                    ) : (
                      <RetroButton size="sm" variant="primary" className="text-[9px] px-2 py-1" onClick={() => connectionManager.connectBle()}>
                        <Bluetooth className="w-3 h-3 mr-1" /> PAIR
                      </RetroButton>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <SettingRow label="POLL INTERVAL" hint="Telemetry poll rate (ms)" value={local.communication.pollingInterval} onChange={v => update('communication', 'pollingInterval', v)} min={50} max={5000} step={50} />
                <SettingToggle label="AUTO RECONNECT" value={local.communication.reconnectPolicy === 'auto'} onChange={v => update('communication', 'reconnectPolicy', v ? 'auto' : 'manual')} />
                <div className="flex items-start gap-2 bg-panel-alt pixel-border-soft p-2.5 mt-2">
                  <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-[10px] text-muted-foreground font-body leading-relaxed">
                    BLE requires Chrome/Edge browser with Web Bluetooth support. You must be physically near the robot — BLE connects directly, no WiFi proxy needed.
                  </span>
                </div>
              </div>
            </div>
          </RetroPanel>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RetroPanel title="TIMING" className="p-4 pt-5 space-y-3">
            <SettingRow label="SETTLE TIME" hint="Junction pause (ms)" value={local.advanced.settleTime} onChange={v => update('advanced', 'settleTime', v)} min={0} max={5000} />
            <SettingRow label="JUNCTION CREEP" hint="Forward creep at junction (ms)" value={local.advanced.junctionCreep} onChange={v => update('advanced', 'junctionCreep', v)} min={0} max={2000} />
            <SettingRow label="FORCED TURN TIME" hint="Base time for 90° turn (ms)" value={local.advanced.forcedTurn} onChange={v => update('advanced', 'forcedTurn', v)} min={0} max={2000} />
            <SettingRow label="SEARCH TIMEOUT" hint="Max time to find line after turn (ms)" value={local.advanced.searchTimeout} onChange={v => update('advanced', 'searchTimeout', v)} min={0} max={5000} />
            <SettingRow label="PEEK CREEP" hint="Forward peek when line lost (ms)" value={local.advanced.peekCreep} onChange={v => update('advanced', 'peekCreep', v)} min={0} max={2000} />
            <SettingRow label="GOAL CREEP" hint="Creep to confirm goal/start (ms)" value={local.advanced.goalCreep} onChange={v => update('advanced', 'goalCreep', v)} min={0} max={2000} />
          </RetroPanel>

          <RetroPanel title="LINE CORRECTION" className="p-4 pt-5 space-y-3">
            <SettingRow label="CORRECTION TIER 1" hint="Correction for error=1" value={local.advanced.corrT1} onChange={v => update('advanced', 'corrT1', v)} min={0} max={255} />
            <SettingRow label="CORRECTION TIER 2" hint="Correction for error=2" value={local.advanced.corrT2} onChange={v => update('advanced', 'corrT2', v)} min={0} max={255} />
            <SettingRow label="CORRECTION TIER 3" hint="Correction for error=3" value={local.advanced.corrT3} onChange={v => update('advanced', 'corrT3', v)} min={0} max={255} />
            <SettingRow label="CORRECTION TIER 4" hint="Correction for error=4+" value={local.advanced.corrT4} onChange={v => update('advanced', 'corrT4', v)} min={0} max={255} />
          </RetroPanel>
        </div>
      )}
    </div>
  );
}
