const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');

const app = express();

// Parse JSON bodies to inspect RPC method calls
app.use(bodyParser.json());

// Enhanced logging for all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n⚡ ${timestamp} - ${req.method} ${req.url}`);
  
  if (req.body && req.body.method) {
    console.log(`📡 RPC Method: ${req.body.method}`);
    
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

  // Block eth_getTransactionReceipt
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
  next();
});

// Proxy all other requests to a real Ethereum RPC
const rpcProxy = createProxyMiddleware({
  target: 'https://mainnet.infura.io/v3/a15aab43aea047459b33a31e6d967a17',
  changeOrigin: true,
  pathRewrite: { '^/rpc': '' },
  onProxyReq: (proxyReq, req, res) => {
    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const method = req.body?.method || 'unknown';
    const status = proxyRes.statusCode;
    
    if (method === 'eth_getBalance') {
      console.log(`✅ Balance request successful - Status: ${status}`);
    } else if (method === 'eth_sendTransaction') {
      console.log(`🚀 Transaction sent successfully - Status: ${status}`);
      console.log(`🔍 Now watch for eth_getTransactionReceipt attempts...`);
    } else {
      console.log(`✅ Proxied ${method} - Status: ${status}`);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
});

app.use('/rpc', rpcProxy);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'RPC proxy server is running' });
});

const PORT = process.env.PORT || 8545;
app.listen(PORT, () => {
  console.log(`🚀 RPC Proxy Server running on http://localhost:${PORT}`);
  console.log(`📍 Add this RPC to MetaMask: http://localhost:${PORT}/rpc`);
  console.log(`🔍 All eth_getTransactionReceipt calls will return 403 Forbidden`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down proxy server...');
  process.exit(0);
});