import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'monad-config.json'), 'utf8'));
if (!config.contractAddress) throw new Error('monad-config.json has no contractAddress. Run npm run chain:deploy first.');
if (!process.env.MONAD_PRIVATE_KEY) throw new Error('MONAD_PRIVATE_KEY is required.');

const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL || config.rpcUrl, 10143, { staticNetwork: true });
const wallet = new ethers.Wallet(process.env.MONAD_PRIVATE_KEY, provider);
const artifact = JSON.parse(await fs.readFile(path.join(root, 'artifacts', 'VoiceRightsRegistry.json'), 'utf8'));
const registry = new ethers.Contract(config.contractAddress, artifact.abi, wallet);

const [authorizationId, projectId, scriptVersion, usageHash, validUntil] = process.argv.slice(2);
if (!authorizationId || !projectId || !scriptVersion || !usageHash || !validUntil) {
  throw new Error('Usage: node scripts/record-chain.mjs <authorizationId> <projectId> <scriptVersion> <usageHash> <unixValidUntil>');
}
const tx = await registry.registerAuthorization(
  ethers.id(authorizationId), ethers.id(projectId), ethers.id(scriptVersion), ethers.id(usageHash), validUntil,
);
console.log(`tx=${tx.hash}`);
await tx.wait();
console.log('authorization=registered');
