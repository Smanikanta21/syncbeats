// db/DeviceRepository.ts — pg-based device storage
// Devices table is optional for now — stubs return empty results gracefully.

import { getPool } from './pool';

export interface PublicDevice {
  id:           string;
  device_key:   string;
  name:         string;
  user_agent:   string | null;
  created_at:   Date;
  updated_at:   Date;
  last_seen_at: Date;
}

export class DeviceRepository {
  async ensureForUser(
    _userId: string,
    _deviceKey: string,
    _userAgent: string | null
  ): Promise<{ device: PublicDevice | null; created: boolean }> {
    // Devices table not yet migrated — return graceful stub
    return { device: null, created: false };
  }

  async listByUser(_userId: string): Promise<PublicDevice[]> {
    return [];
  }

  async rename(
    _userId: string,
    _deviceId: string,
    _name: string
  ): Promise<PublicDevice | null> {
    return null;
  }

  async findByUserAndKey(
    _userId: string,
    _deviceKey: string
  ): Promise<PublicDevice | null> {
    return null;
  }

  async findByIdAndUser(
    _userId: string,
    _deviceId: string
  ): Promise<PublicDevice | null> {
    return null;
  }

  // Keep the pool warm
  private get pool() { return getPool(); }
}
