// The preview uses the same configured backend and persistent store as npm run dev.
// ?demo=1 remains an explicit, local-only frontend data mode.
process.env.PORT ??= '4188';
await import('../server.js');
