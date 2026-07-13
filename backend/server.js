require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const path       = require('path');
const axios      = require('axios');
const sequelize  = require('./models/index');
const { initSocket } = require('./socket');

// Import models so Sequelize knows about them
require('./models/User');
require('./models/Exam');
require('./models/Flag');
require('./models/Submission');

// Import routes
const authRoutes    = require('./routes/auth');
const examRoutes    = require('./routes/exam');
const proctorRoutes = require('./routes/proctor');

const app    = express();
app.set('trust proxy', true);
const server = http.createServer(app);

// Init WebSocket
initSocket(server);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use('/api/proctor/static', express.static(path.join(__dirname, '../ai-service')));

// Routes
app.use('/api/auth',    authRoutes);
app.use('/api/exams',   examRoutes);
app.use('/api/proctor', proctorRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend running' });
});

let lastPrewarmTime = 0;
const PREWARM_COOLDOWN = 2 * 60 * 1000; // 2 minutes in ms

async function prewarmService(url, retries = 4, delay = 6000) {
    for (let i = 0; i < retries; i++) {
        try {
            await axios.get(`${url}/health`);
            console.log('AI Service prewarmed successfully');
            return;
        } catch (err) {
            const is502 = err.response && err.response.status === 502;
            if (i === retries - 1) {
                console.warn(`AI Service prewarm ping failed after ${retries} attempts:`, err.message);
            } else {
                console.log(`AI Service prewarm attempt ${i + 1} failed (${is502 ? '502 Bad Gateway / Wake-up in progress' : err.message}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Dedicated Prewarm endpoint (triggered once when frontend mounts)
app.get('/api/prewarm', (req, res) => {
    const now = Date.now();
    if (process.env.AI_SERVICE_URL && (now - lastPrewarmTime > PREWARM_COOLDOWN)) {
        lastPrewarmTime = now;
        prewarmService(process.env.AI_SERVICE_URL);
    }
    res.json({ status: 'ok', message: 'Prewarming initiated' });
});

// DB sync + start server
const PORT = process.env.PORT || 3001;

const shouldAlter = process.env.NODE_ENV !== 'production';
sequelize.sync({ alter: shouldAlter })
    .then(() => {
        console.log('Database synced');
        server.listen(PORT, () => {
            console.log(`Backend running on http://localhost:${PORT}`);
            console.log('Endpoints:');
            console.log('  POST /api/auth/register');
            console.log('  POST /api/auth/login');
            console.log('  GET  /api/exams');
            console.log('  POST /api/exams');
            console.log('  POST /api/proctor/analyze');
            console.log('  GET  /api/proctor/flags/:session_id');
        });
    })
    .catch(err => console.error('DB sync failed:', err));
