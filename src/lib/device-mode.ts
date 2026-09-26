export type DeviceCount = 1 | 2 | 3;

export const DEFAULT_DEVICE_COUNT: DeviceCount = 3;
export const DEVICE_STORAGE_PREFIX = "shared-scoreboard:devices:";

export function isDeviceCount(value: unknown): value is DeviceCount {
  return value === 1 || value === 2 || value === 3;
}
