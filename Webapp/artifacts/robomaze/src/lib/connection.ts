import { useAppStore } from './store';

type MessageHandler = (data: any) => void;
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
type ActiveTransport = 'wifi' | 'ble' | null;

const BLE_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const BLE_TX_CHAR_UUID = '12345678-1234-1234-1234-123456789abd';
const BLE_RX_CHAR_UUID = '12345678-1234-1234-1234-123456789abe';

class ConnectionManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private _onMessage: MessageHandler | null = null;
  private _preferredMode: 'wifi' | 'bluetooth' = 'wifi';

  private bleDevice: BluetoothDevice | null = null;
  private bleServer: BluetoothRemoteGATTServer | null = null;
  private bleTxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private bleRxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private _activeTransport: ActiveTransport = null;

  get connected(): boolean {
    return this._activeTransport !== null;
  }

  get activeTransport(): ActiveTransport {
    return this._activeTransport;
  }

  get wifiConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get bleConnected(): boolean {
    return this.bleServer !== null && this.bleServer.connected;
  }

  get preferredMode(): 'wifi' | 'bluetooth' {
    return this._preferredMode;
  }

  set onMessage(handler: MessageHandler | null) {
    this._onMessage = handler;
  }

  setPreferredMode(mode: 'wifi' | 'bluetooth'): void {
    const prev = this._preferredMode;
    this._preferredMode = mode;

    if (mode === 'bluetooth' && prev !== 'bluetooth') {
      this.disconnectWifi();
      this.addLog('info', 'communication', 'Switched to BLE mode — WiFi disabled');
    } else if (mode === 'wifi' && prev !== 'wifi') {
      this.addLog('info', 'communication', 'Switched to WiFi mode — connecting...');
      this.connect();
    }
  }

  private getRobotWsUrl(): string {
    const settings = useAppStore.getState().settings;
    const ip = settings.communication.wifiIp || '172.20.10.9';
    return `ws://${ip}:81`;
  }

  connect(): void {
    console.log('[ConnectionManager] connect() called, preferredMode:', this._preferredMode);

    if (this._preferredMode === 'bluetooth') {
      console.log('[ConnectionManager] Skipping WiFi connect — BLE mode active');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[ConnectionManager] Already connected or connecting, skipping');
      return;
    }

    this.intentionalClose = false;
    this.clearReconnectTimer();

    const url = this.getRobotWsUrl();

    console.log(`[ConnectionManager] Creating direct WebSocket to robot at ${url}`);
    this.updateWsStatus('connecting');

    try {
      this.ws = new WebSocket(url);
      console.log('[ConnectionManager] WebSocket object created');
    } catch (err) {
      console.error('[ConnectionManager] Failed to create WebSocket:', err);
      this.updateWsStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log(`[ConnectionManager] WebSocket OPEN — connected directly to robot at ${url}`);
      this.updateWsStatus('connected');
      this._activeTransport = 'wifi';
      this.addLog('success', 'communication', `Connected to robot at ${url} (WiFi direct)`);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this._onMessage) {
          this._onMessage(data);
        }
      } catch {
        console.warn('[ConnectionManager] Non-JSON message:', event.data);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[ConnectionManager] WebSocket CLOSED (code=${event.code}, reason=${event.reason})`);
      this.ws = null;
      if (this._activeTransport === 'wifi') this._activeTransport = null;
      this.updateWsStatus('disconnected');

      if (!this.intentionalClose && this._preferredMode === 'wifi') {
        this.addLog('warning', 'communication', `Robot disconnected (code=${event.code}). Reconnecting in 3s...`);
        this.scheduleReconnect();
      } else {
        this.addLog('info', 'communication', 'Disconnected from robot (WiFi)');
      }
    };

    this.ws.onerror = (err) => {
      console.error('[ConnectionManager] WebSocket ERROR:', err);
    };
  }

  private disconnectWifi(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this._activeTransport === 'wifi') this._activeTransport = null;
    this.updateWsStatus('disconnected');
  }

  disconnect(): void {
    this.disconnectWifi();
  }

  reconnect(): void {
    this.disconnect();
    setTimeout(() => this.connect(), 100);
  }

  async connectBle(): Promise<void> {
    if (!navigator.bluetooth) {
      this.addLog('error', 'communication', 'Web Bluetooth not supported in this browser');
      return;
    }

    this.updateBleStatus('connecting');
    this.addLog('info', 'communication', 'Opening BLE device picker...');

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BLE_SERVICE_UUID],
      });

      this.bleDevice = device;

      device.addEventListener('gattserverdisconnected', () => {
        console.log('[ConnectionManager] BLE device disconnected');
        this.bleTxChar = null;
        this.bleRxChar = null;
        this.bleServer = null;
        if (this._activeTransport === 'ble') this._activeTransport = null;
        this.updateBleStatus('disconnected');
        this.addLog('warning', 'communication', 'BLE disconnected');
      });

      console.log(`[ConnectionManager] Connecting to BLE device: ${device.name}`);
      const server = await device.gatt!.connect();
      this.bleServer = server;

      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      this.bleTxChar = await service.getCharacteristic(BLE_TX_CHAR_UUID);
      this.bleRxChar = await service.getCharacteristic(BLE_RX_CHAR_UUID);

      await this.bleTxChar.startNotifications();
      this.bleTxChar.addEventListener('characteristicvaluechanged', this.handleBleNotification);

      this._activeTransport = 'ble';
      this.updateBleStatus('connected');
      this.addLog('success', 'communication', `Connected to ${device.name || 'robot'} via BLE`);
    } catch (err: any) {
      console.error('[ConnectionManager] BLE connection failed:', err);
      this.updateBleStatus('disconnected');
      if (err.name !== 'NotFoundError') {
        this.addLog('error', 'communication', `BLE failed: ${err.message}`);
      } else {
        this.addLog('info', 'communication', 'BLE pairing cancelled');
      }
    }
  }

  disconnectBle(): void {
    if (this.bleTxChar) {
      try {
        this.bleTxChar.removeEventListener('characteristicvaluechanged', this.handleBleNotification);
        this.bleTxChar.stopNotifications().catch(() => {});
      } catch {}
      this.bleTxChar = null;
    }
    this.bleRxChar = null;

    if (this.bleServer && this.bleServer.connected) {
      this.bleServer.disconnect();
    }
    this.bleServer = null;
    this.bleDevice = null;

    if (this._activeTransport === 'ble') this._activeTransport = null;
    this.updateBleStatus('disconnected');
    this.addLog('info', 'communication', 'Disconnected from BLE');
  }

  private handleBleNotification = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(value);

    try {
      const data = JSON.parse(text);
      if (this._onMessage) {
        this._onMessage(data);
      }
    } catch {
      console.warn('[ConnectionManager] Non-JSON BLE message:', text);
    }
  };

  sendCommand(cmd: string): void {
    const payload = JSON.stringify({ cmd });

    if (this._activeTransport === 'ble' && this.bleRxChar) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(payload);
      this.bleRxChar.writeValue(bytes).then(() => {
        this.addLog('info', 'movement', `Sent command: ${cmd} (BLE)`);
      }).catch((err: any) => {
        console.error('[ConnectionManager] BLE write failed:', err);
        this.addLog('error', 'communication', `BLE write failed: ${err.message}`);
      });
      return;
    }

    if (this._activeTransport === 'wifi' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      this.addLog('info', 'movement', `Sent command: ${cmd} (WiFi)`);
      return;
    }

    console.warn('[ConnectionManager] Cannot send command — not connected');
    this.addLog('error', 'communication', `Cannot send "${cmd}" — not connected`);
  }

  sendRaw(data: string): void {
    if (this._activeTransport === 'ble' && this.bleRxChar) {
      const encoder = new TextEncoder();
      this.bleRxChar.writeValue(encoder.encode(data)).catch(() => {});
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private scheduleReconnect(): void {
    if (this._preferredMode === 'bluetooth') {
      return;
    }
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      console.log('[ConnectionManager] Attempting reconnect...');
      this.connect();
    }, 3000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateWsStatus(status: ConnectionStatus): void {
    useAppStore.getState().setRobotWsStatus(status);
  }

  private updateBleStatus(status: ConnectionStatus): void {
    useAppStore.getState().setRobotBleStatus(status);
  }

  private addLog(level: 'info' | 'warning' | 'error' | 'success', category: string, message: string): void {
    useAppStore.getState().addLocalLog(level, category, message);
  }
}

export const connectionManager = new ConnectionManager();
