// Runs once when the Next.js server starts. Background work (WhatsApp
// sessions, campaign scheduler) must not depend on someone opening a page.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundServices } = await import('./lib/bootstrap');
    await startBackgroundServices();
  }
}
