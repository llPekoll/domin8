/**
 * Check if any Solana wallet is installed
 */
export function hasSolanaWallet(): boolean {
  if (typeof window === "undefined") return false;

  // Check both window.phantom.solana and window.solana
  const phantom = (window as any).phantom?.solana;
  const solana = (window as any).solana;

  return !!(phantom || solana);
}

/**
 * Get the installed Solana wallet provider (any wallet)
 */
export function getSolanaProvider() {
  if (typeof window === "undefined") return null;

  // Prefer Phantom if available
  const phantom = (window as any).phantom?.solana;
  if (phantom?.isPhantom) return phantom;

  // Fallback to window.solana for other wallets
  return (window as any).solana || null;
}

/**
 * Open Phantom wallet download page
 */
export function openPhantomDownload() {
  window.open("https://phantom.app/download", "_blank");
}
