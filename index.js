// JavaScript Documentrequire('dotenv').config();
const express = require('express');
const { createWalletClient, http, parseEther } = require('viem');
const { mainnet } = require('viem/chains');

const app = express();
const port = process.env.PORT || 3000;

// 配置（从 .env 读取）
const PRIVATE_KEY = process.env.PRIVATE_KEY; // 你的钱包私钥
const RPC_URL = process.env.RPC_URL; // Alchemy URL
const CONTRACT_ADDRESS = '0x84b2a2372e8A8770E10C6594B0854F92cA6B8BE6';
const PRICE_PER_NFT = parseEther('0.0005'); // 0.0005 ETH per NFT
const RECEIVER_ADDRESS = '0xa43d27e736EB8c9816102a4C48bB5e8a7Da8c5ef'; // 支付接收地址（你的）

const walletClient = createWalletClient({
  account: { privateKey: PRIVATE_KEY },
  chain: mainnet,
  transport: http(RPC_URL)
});

// claim ABI（简化版）
const ABI = [
  {
    "inputs": [
      {"name": "_receiver", "type": "address"},
      {"name": "_quantity", "type": "uint256"},
      {"name": "_currency", "type": "address"},
      {"name": "_pricePerToken", "type": "uint256"},
      {"components": [
        {"name": "proof", "type": "bytes32[]"},
        {"name": "quantityLimitPerWallet", "type": "uint256"},
        {"name": "pricePerToken", "type": "uint256"},
        {"name": "currency", "type": "address"}
      ], "name": "_allowlistProof", "type": "tuple"},
      {"name": "_data", "type": "bytes"}
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// x402 支付端点
app.get('/mint', (req, res) => {
  const quantity = parseInt(req.query.quantity) || 1;
  if (quantity < 1 || quantity > 10) { // 限制最大10个，避免滥用
    return res.status(400).send('Quantity must be 1-10');
  }

  const totalPrice = PRICE_PER_NFT * BigInt(quantity);

  res.status(402).set({
    'x402-payment': JSON.stringify({
      amount: totalPrice.toString(),
      currency: 'ETH',
      chainId: 1,
      receiver: RECEIVER_ADDRESS,
      description: `Mint ${quantity} Allluminati Pyramids NFT(s)`,
      callbackUrl: `https://${req.headers.host}/mint/callback?quantity=${quantity}&receiver=${req.query.receiver || ''}`
    })
  }).send('Payment Required');
});

// 回调端点（支付确认后 mint）
app.get('/mint/callback', async (req, res) => {
  const quantity = BigInt(req.query.quantity || 1);
  const receiver = req.query.receiver || '0xa43d27e736EB8c9816102a4C48bB5e8a7Da8c5ef'; // 默认到你的地址

  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'claim',
      args: [
        receiver,
        quantity,
        '0x0000000000000000000000000000000000000000', // ETH
        PRICE_PER_NFT,
        [[], 0n, 0n, '0x0000000000000000000000000000000000000000'], // empty proof
        '0x'
      ],
      value: PRICE_PER_NFT * quantity
    });

    res.send(`Success! Minted ${quantity} NFTs to ${receiver}. Tx: https://etherscan.io/tx/${hash}`);
  } catch (error) {
    res.status(500).send('Mint failed: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`x402 Mint Agent running on port ${port}`);
});