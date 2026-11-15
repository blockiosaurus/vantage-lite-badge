// Makes the key pair for badge access to Vantage:
//
//   npm run access:keygen
//
// VANTAGE_ACCESS_SIGNING_KEY goes in this server's Railway variables (it signs
// tickets; keep it secret). BADGE_ACCESS_PUBLIC_KEY goes in the Vantage
// terminal's Vercel env (it only verifies; it is no secret).

const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
const privateKey = Buffer.from((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
const publicKey = Buffer.from((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);

console.log('Railway (this server), secret:');
console.log(`VANTAGE_ACCESS_SIGNING_KEY=${privateKey.toString('base64')}`);
console.log('');
console.log('Vantage terminal (Vercel), public:');
console.log(`BADGE_ACCESS_PUBLIC_KEY=${publicKey.toString('base64')}`);

export {};
