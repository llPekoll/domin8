// Quick debug script - run this in the browser console
console.log('🔍 Debugging wallet addresses...');

// Check what Privy has
const privyUser = window?.__PRIVY_USER__ || 'Not found';
console.log('Privy User:', privyUser);

// Check local storage for Privy data
const privyAuth = localStorage.getItem('privy:auth_state');
if (privyAuth) {
  try {
    const authData = JSON.parse(privyAuth);
    console.log('Privy Auth State:', authData);
  } catch (e) {
    console.log('Privy Auth State (raw):', privyAuth);
  }
}

// Check for wallet connections
const allKeys = Object.keys(localStorage);
const walletKeys = allKeys.filter(key => 
  key.includes('wallet') || 
  key.includes('phantom') || 
  key.includes('solana') ||
  key.includes('privy')
);

console.log('Wallet-related localStorage keys:', walletKeys);

// Instructions
console.log(`
📝 To connect your external wallet (where your NFTs are):
1. Look for a "Connect Wallet" or "Link External Wallet" button in the game
2. Connect your Phantom/external wallet that has the address: 3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A
3. This will link your external wallet to your Privy embedded wallet
`);