export const log = {
  info(meta: Record<string, unknown>, msg: string) {
    // Phase 1 logger; drop-in replace with pino in parallel track.
    console.log(JSON.stringify({ level: 'info', msg, ...meta }));
  },
  error(meta: Record<string, unknown>, msg: string) {
    console.error(JSON.stringify({ level: 'error', msg, ...meta }));
  },
};

