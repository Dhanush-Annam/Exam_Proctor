require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
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
const server = http.createServer(app);

// Init WebSocket
initSocket(server);

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Routes
app.use('/api/auth',    authRoutes);
app.use('/api/exams',   examRoutes);
app.use('/api/proctor', proctorRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend running' });
});

// DB sync + start server
const PORT = process.env.PORT || 3001;

sequelize.sync({ alter: true })
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