// Unique Device Identity generator for Windows app
const DEVICE_KEY = 'syncbeats_windows_device_id';
const DEVICE_NAME_KEY = 'syncbeats_windows_device_name';

export interface DeviceInfo {
  id: String;
  name: String;
  platform: 'windows';
}

export class DeviceIdentity {
  private static instance: DeviceIdentity;
  public deviceId: string;
  public deviceName: string;

  private constructor() {
    let existingId = localStorage.getItem(DEVICE_KEY);
    if (!existingId) {
      existingId = 'win-' + crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, existingId);
    }
    this.deviceId = existingId;

    let existingName = localStorage.getItem(DEVICE_NAME_KEY);
    if (!existingName) {
      existingName = 'Windows PC (' + (navigator.platform || 'Desktop') + ')';
      localStorage.setItem(DEVICE_NAME_KEY, existingName);
    }
    this.deviceName = existingName;
  }

  public static getInstance(): DeviceIdentity {
    if (!DeviceIdentity.instance) {
      DeviceIdentity.instance = new DeviceIdentity();
    }
    return DeviceIdentity.instance;
  }
}
