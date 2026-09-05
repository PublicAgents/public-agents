/** A handle is case-preserving in the file and unique on its lowercase form. */
export function normalizeHandle(handle: string): string {
  return handle.toLowerCase();
}

export function isReserved(handle: string, reserved: readonly string[]): boolean {
  const lower = normalizeHandle(handle);
  return reserved.some(name => name.toLowerCase() === lower);
}
