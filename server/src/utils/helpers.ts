export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// classify error type for import log
export function classifyError(error: unknown): 'validation' | 'database' | 'parse' | 'network' | 'unknown' {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('validation') || msg.includes('required')) return 'validation';
    if (msg.includes('mongo') || msg.includes('duplicate')) return 'database';
    if (msg.includes('xml') || msg.includes('parse')) return 'parse';
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('http')) return 'network';
  }
  return 'unknown';
}
