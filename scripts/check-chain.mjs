import 'dotenv/config';
import fs from 'node:fs';

const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const expectedChainId = 10143;
const config = JSON.parse(fs.readFileSync(new URL('../monad-config.json', import.meta.url), 'utf8'));

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${payload.error.code}: ${payload.error.message}`);
  return payload.result;
}

const chainIdHex = await rpc('eth_chainId');
const chainId = Number.parseInt(chainIdHex, 16);
const blockHex = await rpc('eth_blockNumber');
const blockNumber = Number.parseInt(blockHex, 16);

console.log(JSON.stringify({
  rpcUrl,
  chainId,
  expectedChainId,
  chainMatches: chainId === expectedChainId,
  latestBlock: blockNumber,
  walletConfigured: Boolean(process.env.MONAD_PRIVATE_KEY),
  contractConfigured: Boolean(config.contractAddress),
}, null, 2));

if (chainId !== expectedChainId) process.exitCode = 1;
