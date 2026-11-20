/** Creates a stable key for one exact uploaded report file. */
export async function createReportId(rows: Record<string, unknown>[], dateRange: string): Promise<string> {
  const canonical = JSON.stringify({ dateRange, rows });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
