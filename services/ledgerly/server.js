const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = new Set([
  'https://arkagentic.com',
  'https://gateway.arkagentic.com',
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'ledgerly-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'ledgerly-backend',
    message: 'Ledgerly Cloud Run service is running',
  });
});

app.listen(PORT, () => {
  console.log(`ledgerly-backend listening on ${PORT}`);
});
