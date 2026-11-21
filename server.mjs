import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const config = JSON.parse(await fs.readFile(path.join(root, 'monad-config.json'), 'utf8'));
const artifact = JSON.parse(await fs.readFile(path.join(root, 'artifacts', 'VoiceRightsRegistry.json'), 'utf8'));
const rpcUrl = process.env.MONAD_RPC_URL || config.rpcUrl;
const provider = new ethers.JsonRpcProvider(rpcUrl, config.chainId, { staticNetwork: true });
const wallet = process.env.MONAD_PRIVATE_KEY ? new ethers.Wallet(process.env.MONAD_PRIVATE_KEY, provider) : null;
const registry = wallet && config.contractAddress ? new ethers.Contract(config.contractAddress, artifact.abi, wallet) : null;

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('request body too large');
  }
  return JSON.parse(body || '{}');
}

function requireRegistry() {
  if (!registry) throw new Error('server wallet or deployed contract is not configured');
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/chain-status') {
    const network = await provider.getNetwork();
    return json(res, 200, { chainId: Number(network.chainId), rpcUrl, contractAddress: config.contractAddress, walletAddress: wallet?.address || null });
  }
  requireRegistry();
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const body = await readBody(req);
  if (url.pathname === '/api/authorization') {
    const tx = await registry.registerAuthorization(
      ethers.id(body.authorizationId), ethers.id(body.projectId), ethers.id(body.scriptVersion), ethers.id(body.usage), body.validUntil,
    );
    await tx.wait();
    return json(res, 200, { tx: tx.hash, status: 'registered' });
  }
  if (url.pathname === '/api/review') {
    const hash = String(body.fileHash || '').startsWith('0x') ? body.fileHash : `0x${body.fileHash}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return json(res, 400, { error: 'fileHash must be a 32-byte SHA-256 value' });
    const tx = await registry.recordReview(
      ethers.id(body.receiptId), ethers.id(body.authorizationId), ethers.id(body.submissionId), hash,
      String(body.status).toLowerCase() === 'rejected' ? 1 : 0,
    );
    await tx.wait();
    return json(res, 200, { tx: tx.hash, status: body.status });
  }
  return json(res, 404, { error: 'unknown api route' });
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
async function handleStatic(req, res, url) {
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) return json(res, 403, { error: 'forbidden' });
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { json(res, 404, { error: 'not found' }); }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  Promise.resolve(url.pathname.startsWith('/api/') ? handleApi(req, res, url) : handleStatic(req, res, url))
    .catch((error) => json(res, 500, { error: error.message }));
});
server.listen(port, () => console.log(`Voice Proof server listening on http://localhost:${port}`));
