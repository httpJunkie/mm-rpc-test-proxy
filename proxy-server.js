const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');

const app = express();

// Parse JSON bodies to inspect RPC method calls
app.use(bodyParser.json());

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && req.body.method) {
    console.log(`RPC Method: ${req.body.method}`);
  }
  next();
});

// Middleware to simulate 403 for eth_getTransactionReceipt
app.use('/rpc', (req, res, next) => {
  if (req.body && req.body.method === 'eth_getTransactionReceipt') {
    console.log(`🚫 Blocking eth_getTransactionReceipt for tx: ${req.body.params?.[0]}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'eth_getTransactionReceipt not allowed'
    });
  }
  next();
});

// Proxy all other requests to a real Ethereum RPC
const rpcProxy = createProxyMiddleware({
  target: 'https://mainnet.infura.io/v3/[INFURA-KEY]',
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
    console.log(`✅ Proxied ${req.body?.method} - Status: ${proxyRes.statusCode}`);
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