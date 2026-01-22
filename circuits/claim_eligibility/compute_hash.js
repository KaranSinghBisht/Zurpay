const crypto = require('crypto');

// Extract values from Prover.toml
const merkle_root = Buffer.from([104,45,75,170,173,49,66,227,23,117,138,86,163,130,129,32,208,114,102,215,218,166,116,246,133,157,223,152,109,216,208,190]);
const nullifier = Buffer.from([198,6,6,72,88,29,201,81,177,98,77,76,185,62,158,204,70,38,174,188,255,50,133,3,67,69,164,56,71,191,114,75]);
const payout_pubkey_hash = Buffer.from([159,79,182,143,62,29,172,130,32,47,154,165,129,206,11,191,31,118,93,240,233,172,60,140,87,226,15,104,90,186,184,237]);
const org_id = Buffer.from([5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]);
const salary_commitment = Buffer.from([2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]);
const ciphertext_hash = Buffer.from([6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6]);

// Compute SHA256 hash of concatenated values
const combined = Buffer.concat([merkle_root, nullifier, payout_pubkey_hash, org_id, salary_commitment, ciphertext_hash]);
const hash = crypto.createHash('sha256').update(combined).digest();

console.log('Hash (hex):', hash.toString('hex'));
console.log('Hash (decimal array):', Array.from(hash).map(x => x.toString()).join(', '));
