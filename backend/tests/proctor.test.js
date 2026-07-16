const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Import models index first to prevent circular dependency issues during Jest module loading
require('../models/index');

const Flag = require('../models/Flag');
Flag.findAll = jest.fn(() => Promise.resolve([]));
Flag.create = jest.fn(() => Promise.resolve({ id: 'flag-id' }));
Flag.update = jest.fn(() => Promise.resolve([1]));

// Create a mock app to isolate testing the proctor router
const app = express();
app.use(express.json());

// Mock models and middlewares to avoid setting up a full DB connection for unit/integration tests
jest.mock('../middleware/auth', () => (req, res, next) => {
    req.user = { id: 'mock-user-id', role: 'examiner' };
    next();
});

const proctorRouter = require('../routes/proctor');
app.use('/api/proctor', proctorRouter);

describe('Proctor Webhook Callback Signature Verification', () => {
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-webhook-key';

    it('should reject callback requests without signature header with 401', async () => {
        const response = await request(app)
            .post('/api/proctor/session/session_123/review-complete')
            .send({ flags: [] });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Webhook signature missing');
    });

    it('should reject callback requests with invalid signature header with 403', async () => {
        const response = await request(app)
            .post('/api/proctor/session/session_123/review-complete')
            .set('x-webhook-signature', 'invalid-signature-here')
            .send({ flags: [] });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Invalid webhook signature');
    });

    it('should approve callback requests with valid HMAC signature', async () => {
        const payload = { flags: [{ image_path: 'session_123/flag.jpg', ai_verdict: 'FALSE_ALARM', ai_reason: 'Normal blink' }] };
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const signature = hmac.update(JSON.stringify(payload)).digest('hex');

        const response = await request(app)
            .post('/api/proctor/session/session_123/review-complete')
            .set('x-webhook-signature', signature)
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
});
