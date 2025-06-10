require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

// Parse JSON bodies
app.use(express.json());

// Enhanced logging for all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n⚡ ${timestamp} - ${req.method} ${req.url}`);
  
  if (req.body && req.body.method) {
    console.log(`📡 RPC Method: ${req.body.method}`);
    console.log(`📋 Full request body: ${JSON.stringify(req.body, null, 2)}`);
    
    // Show params for specific methods we care about
    if (req.body.method === 'eth_getBalance') {
      console.log(`💰 Getting balance for: ${req.body.params?.[0]}`);
    }
    if (req.body.method === 'eth_sendTransaction') {
      console.log(`💸 Sending transaction: ${JSON.stringify(req.body.params?.[0], null, 2)}`);
    }
    if (req.body.method === 'eth_getTransactionReceipt') {
      console.log(`🧾 Checking receipt for tx: ${req.body.params?.[0]}`);
    }
  }
  next();
});

// Middleware to handle special cases and simulate 403 for eth_getTransactionReceipt
app.use('/rpc', (req, res, next) => {
  // Return our custom chain ID
  if (req.body && req.body.method === 'eth_chainId') {
    console.log(`🔗 Returning custom Chain ID: 9999`);
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: '0x270f' // 9999 in hex
    });
  }

  // Return a fake but valid block number
  if (req.body && req.body.method === 'eth_blockNumber') {
    console.log(`📦 Returning fake block number`);
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: '0x1234567' // Fake block number
    });
  }

  // Return zero balance for any address
  if (req.body && req.body.method === 'eth_getBalance') {
    console.log(`💰 Returning zero balance for: ${req.body.params?.[0]}`);
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: '0x0' // Zero balance
    });
  }

  // Block eth_getTransactionReceipt with 403
  if (req.body && req.body.method === 'eth_getTransactionReceipt') {
    console.log(`🚫 BLOCKING eth_getTransactionReceipt for tx: ${req.body.params?.[0]}`);
    console.log(`⚠️  This should cause MetaMask to retry indefinitely!`);
    return res.status(403).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32000,
        message: 'Forbidden: eth_getTransactionReceipt not allowed'
      }
    });
  }
  
  // For all other calls, proxy through to mainnet
  next();
});

// Proxy middleware for all other RPC calls to Infura
app.use('/rpc', createProxyMiddleware({
  target: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
  changeOrigin: true,
  pathRewrite: {
    '^/rpc': '/', // Remove /rpc from the path when proxying
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 Proxying ${req.body?.method} to Infura`);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || 1,
      error: {
        code: -32000,
        message: 'Proxy error'
      }
    });
  }
}));

app.listen(PORT, () => {
  console.log('🚀 RPC Proxy Server running on http://localhost:3000');
  console.log('📍 Add this RPC to MetaMask: http://localhost:3000/rpc');
  console.log('🔍 All eth_getTransactionReceipt calls will return 403 Forbidden');
});