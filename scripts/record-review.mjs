import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'monad-config.json'), 'utf8'));
if (!config.contractAddress) throw new Error('monad-config.json has no contractAddress. Run npm run chain:deploy first.');
if (!process.env.MONAD_PRIVATE_KEY) throw new Error('MONAD_PRIVATE_KEY is required.');

const [receiptId, authorizationId, submissionId, fileHash, status = 'approved'] = process.argv.slice(2);
if (!receiptId || !authorizationId || !submissionId || !fileHash) {
  throw new Error('Usage: node scripts/record-review.mjs <receiptId> <authorizationId> <submissionId> <fileHash> [approved|rejected]');
}

const artifact = JSON.parse(await fs.readFile(path.join(root, 'artifacts', 'VoiceRightsRegistry.json'), 'utf8'));
const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL || config.rpcUrl, 10143, { staticNetwork: true });
const wallet = new ethers.Wallet(process.env.MONAD_PRIVATE_KEY, provider);
const registry = new ethers.Contract(config.contractAddress, artifact.abi, wallet);
const reviewStatus = status.toLowerCase() === 'approved' ? 0 : 1;
const normalizedFileHash = fileHash.startsWith('0x') ? fileHash : `0x${fileHash}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedFileHash)) throw new Error('fileHash must be a 32-byte SHA-256 hex value.');
const tx = await registry.recordReview(
  ethers.id(receiptId), ethers.id(authorizationId), ethers.id(submissionId), normalizedFileHash, reviewStatus,
);
console.log(`tx=${tx.hash}`);
await tx.wait();
console.log(`review=${status}`);
