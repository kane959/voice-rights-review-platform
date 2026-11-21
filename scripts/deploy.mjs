import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';

const root = process.cwd();
const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const privateKey = process.env.MONAD_PRIVATE_KEY;
if (!privateKey) throw new Error('MONAD_PRIVATE_KEY is required. Put it in a local .env file; never commit it.');

const sourcePath = path.join(root, 'contracts', 'VoiceRightsRegistry.sol');
const source = await fs.readFile(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'VoiceRightsRegistry.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors?.filter((item) => item.severity === 'error') || [];
if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
const artifact = output.contracts['VoiceRightsRegistry.sol'].VoiceRightsRegistry;
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(path.join(root, 'artifacts', 'VoiceRightsRegistry.json'), JSON.stringify({ abi: artifact.abi }, null, 2) + '\n', 'utf8');

const provider = new ethers.JsonRpcProvider(rpcUrl, 10143, { staticNetwork: true });
const wallet = new ethers.Wallet(privateKey, provider);
const reviewer = process.env.REVIEWER_ADDRESS || wallet.address;
const balance = await provider.getBalance(wallet.address);
console.log(`deployer=${wallet.address}`);
console.log(`reviewer=${reviewer}`);
console.log(`balance=${ethers.formatEther(balance)} MON`);
if (balance === 0n) throw new Error('Deployer wallet has no MON testnet balance. Fund it from https://faucet.monad.xyz first.');

const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
const contract = await factory.deploy(reviewer);
console.log(`deploymentTx=${contract.deploymentTransaction().hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`contractAddress=${address}`);

const configPath = path.join(root, 'monad-config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.contractAddress = address;
config.status = 'deployed';
config.deploymentTx = contract.deploymentTransaction().hash;
config.deployer = wallet.address;
config.reviewer = reviewer;
config.deployedAt = new Date().toISOString();
await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`wrote=${path.relative(root, configPath)}`);
