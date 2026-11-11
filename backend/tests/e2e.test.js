const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { app } = require('../server');
const sequelize = require('../models/index');
const User = require('../models/User');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Flag = require('../models/Flag');

describe('End-to-End (E2E) Production Proctoring Workflow', () => {
    const testRunId = Date.now();
    const examinerEmail = `examiner_${testRunId}@test.com`;
    const studentEmail = `student_${testRunId}@test.com`;
    const password = 'StrongPassword123!';
    const inviteCode = process.env.EXAMINER_INVITE_CODE || 'EXAM_PROCTOR_EXAMINER_2025';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-webhook-key';

    let examinerToken = '';
    let studentToken = '';
    let examinerUser = null;
    let studentUser = null;
    let createdExamId = '';
    let examSessionId = `session_e2e_${testRunId}`;

    beforeAll(async () => {
        await sequelize.authenticate();
    });

    afterAll(async () => {
        // Cleanup all records created during this test run
        try {
            if (examSessionId) {
                await Flag.destroy({ where: { session_id: examSessionId } });
                await Submission.destroy({ where: { session_id: examSessionId } });
            }
            if (createdExamId) {
                await Exam.destroy({ where: { id: createdExamId } });
            }
            if (examinerUser && examinerUser.id) {
                await User.destroy({ where: { id: examinerUser.id } });
            }
            if (studentUser && studentUser.id) {
                await User.destroy({ where: { id: studentUser.id } });
            }
        } catch (err) {
            console.error('E2E Cleanup error:', err.message);
        }
    });

    // ── 1. Authentication & RBAC ─────────────────────────────────────────────
    describe('1. Authentication & Role-Based Access Control', () => {
        it('should register a new examiner using valid invite code', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Dr. E2E Examiner',
                    email: examinerEmail,
                    password: password,
                    role: 'examiner',
                    inviteCode: inviteCode
                });

            expect(res.status).toBe(201);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.role).toBe('examiner');
            expect(res.body.user.password).toBeUndefined(); // password stripped
            examinerToken = res.body.token;
            examinerUser = res.body.user;
        });

        it('should register a new student without invite code', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Alice Student E2E',
                    email: studentEmail,
                    password: password,
                    role: 'student'
                });

            expect(res.status).toBe(201);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.role).toBe('student');
            studentToken = res.body.token;
            studentUser = res.body.user;
        });

        it('should authenticate student via login and receive JWT', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: studentEmail,
                    password: password
                });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.email).toBe(studentEmail);
        });
    });

    // ── 2. Exam Creation & Question Privacy ──────────────────────────────────
    describe('2. Exam Management & Question Privacy Sanitization', () => {
        it('should allow examiner to create an exam with answer keys', async () => {
            const questions = [
                {
                    id: 0,
                    question: 'What is the capital of France?',
                    options: ['Paris', 'London', 'Berlin', 'Madrid'],
                    correctAnswer: 'Paris'
                },
                {
                    id: 1,
                    question: 'What is 2 + 2?',
                    options: ['3', '4', '5', '6'],
                    correctAnswer: '4'
                }
            ];

            const res = await request(app)
                .post('/api/exams')
                .set('Authorization', `Bearer ${examinerToken}`)
                .send({
                    title: `E2E Integrity Exam ${testRunId}`,
                    duration_minutes: 45,
                    questions: questions
                });

            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(res.body.title).toBe(`E2E Integrity Exam ${testRunId}`);
            createdExamId = res.body.id;
        });

        it('should allow examiner to publish/activate the exam', async () => {
            const res = await request(app)
                .patch(`/api/exams/${createdExamId}/status`)
                .set('Authorization', `Bearer ${examinerToken}`)
                .send({ status: 'active' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('active');
        });

        it('should sanitize answer keys when student fetches active exams list', async () => {
            const res = await request(app)
                .get('/api/exams')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            const foundExam = res.body.find(e => e.id === createdExamId);
            expect(foundExam).toBeDefined();
            // Verify questions array contains only empty stubs for length display, no questions or answers
            foundExam.questions.forEach(q => {
                expect(q.correctAnswer).toBeUndefined();
                expect(q.answer).toBeUndefined();
            });
        });

        it('should sanitize correctAnswer when student views specific exam details', async () => {
            const res = await request(app)
                .get(`/api/exams/${createdExamId}`)
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body.questions.length).toBe(2);
            res.body.questions.forEach(q => {
                expect(q.question).toBeDefined();
                expect(q.options.length).toBe(4);
                expect(q.correctAnswer).toBeUndefined();
                expect(q.answer).toBeUndefined();
            });
        });
    });

    // ── 3. Proctoring Flags Ingestion ─────────────────────────────────────────
    describe('3. Proctoring Flags Ingestion & Security Validation', () => {
        it('should log browser violation event from student with derived student identity', async () => {
            const res = await request(app)
                .post('/api/proctor/log-event')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    session_id: examSessionId,
                    exam_id: createdExamId,
                    alert_type: 'TAB_SWITCH',
                    detail: 'Student switched away from browser'
                });

            expect(res.status).toBe(200);
            expect(res.body.logged).toBe(true);

            // Verify Flag in database
            const flag = await Flag.findOne({
                where: { session_id: examSessionId, alert_type: 'TAB_SWITCH' }
            });
            expect(flag).not.toBeNull();
            expect(flag.student_id).toBe(studentUser.id);
            expect(flag.ai_verdict).toBe('SUSPICIOUS');
        });

        it('should reject logging proctoring events by examiners', async () => {
            const res = await request(app)
                .post('/api/proctor/log-event')
                .set('Authorization', `Bearer ${examinerToken}`)
                .send({
                    session_id: examSessionId,
                    exam_id: createdExamId,
                    alert_type: 'TAB_SWITCH',
                    detail: 'Invalid attempt'
                });

            expect(res.status).toBe(403);
        });

        it('should insert a vision flag directly into database for testing review pipeline', async () => {
            const visionFlag = await Flag.create({
                session_id: examSessionId,
                student_id: studentUser.id,
                exam_id: createdExamId,
                alert_type: 'GAZE_LEFT',
                detail: 'gaze=LEFT signal=LEFT',
                ear_value: 0.25,
                yaw_degrees: -24.5,
                image_path: `flags/${examSessionId}/flag_001_GAZE_LEFT.jpg`,
                ai_verdict: null,
                ai_reason: null
            });

            expect(visionFlag).toBeDefined();
            expect(visionFlag.alert_type).toBe('GAZE_LEFT');
        });
    });

    // ── 4. Exam Submission & Authoritative Grading ────────────────────────────
    describe('4. Server-Side Authoritative Exam Grading', () => {
        it('should correctly grade submitted answers against DB keys', async () => {
            const answers = {
                0: 'Paris', // Correct
                1: '5'      // Incorrect (correct is 4)
            };

            const res = await request(app)
                .post(`/api/exams/${createdExamId}/submit`)
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    answers: answers,
                    session_id: examSessionId
                });

            expect(res.status).toBe(200);
            expect(res.body.total_questions).toBe(2);
            expect(res.body.correct_answers).toBe(1);
            expect(res.body.score).toBe(50); // 1 out of 2 = 50%
            expect(res.body.total_flags).toBeGreaterThanOrEqual(1);

            // Verify submission record in DB
            const submission = await Submission.findOne({
                where: { session_id: examSessionId }
            });
            expect(submission).not.toBeNull();
            expect(submission.student_id).toBe(studentUser.id);
            expect(submission.score).toBe(50);
        });

        it('should prevent resubmission of an already submitted exam', async () => {
            const res = await request(app)
                .post(`/api/exams/${createdExamId}/submit`)
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    answers: { 0: 'Paris', 1: '4' },
                    session_id: examSessionId
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already submitted/i);
        });
    });

    // ── 5. AI Service Webhook & Signature Verification ────────────────────────
    describe('5. AI Post-Exam Review Webhook & Signature Verification', () => {
        it('should reject review webhook with missing HMAC signature with 401', async () => {
            const res = await request(app)
                .post(`/api/proctor/session/${examSessionId}/review-complete`)
                .send({ flags: [] });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Webhook signature missing');
        });

        it('should reject review webhook with forged HMAC signature with 403', async () => {
            const res = await request(app)
                .post(`/api/proctor/session/${examSessionId}/review-complete`)
                .set('x-webhook-signature', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
                .send({ flags: [] });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Invalid webhook signature');
        });

        it('should accept review webhook with valid HMAC signature and update database verdicts', async () => {
            const payload = {
                session_id: examSessionId,
                session_verdict: 'SUSPICIOUS',
                summary: '1 SUSPICIOUS flag detected out of 2 flags.',
                flags: [
                    {
                        image_path: `flags/${examSessionId}/flag_001_GAZE_LEFT.jpg`,
                        ai_verdict: 'SUSPICIOUS',
                        ai_reason: 'Student head turned significantly to the left for multiple frames.'
                    }
                ]
            };

            const rawPayload = JSON.stringify(payload);
            const hmac = crypto.createHmac('sha256', webhookSecret);
            const signature = hmac.update(rawPayload).digest('hex');

            const res = await request(app)
                .post(`/api/proctor/session/${examSessionId}/review-complete`)
                .set('Content-Type', 'application/json')
                .set('x-webhook-signature', signature)
                .send(payload);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify database flag was updated with AI verdict
            const updatedFlag = await Flag.findOne({
                where: {
                    session_id: examSessionId,
                    alert_type: 'GAZE_LEFT'
                }
            });
            expect(updatedFlag).not.toBeNull();
            expect(updatedFlag.ai_verdict).toBe('SUSPICIOUS');
            expect(updatedFlag.ai_reason).toContain('head turned significantly');
        });
    });

    // ── 6. Examiner Dashboard & Audit Telemetry ───────────────────────────────
    describe('6. Examiner Dashboard & Telemetry Feed', () => {
        it('should allow examiner to retrieve session audit feed with AI verdicts', async () => {
            const res = await request(app)
                .get('/api/proctor/sessions')
                .set('Authorization', `Bearer ${examinerToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            const session = res.body.find(s => s.session_id === examSessionId);
            expect(session).toBeDefined();
            expect(session.student.name).toBe('Alice Student E2E');
            expect(session.exam.title).toContain('E2E Integrity Exam');
            expect(session.flagsCount).toBeGreaterThanOrEqual(2);
            expect(session.verdict).toBeDefined();
        });

        it('should allow examiner to retrieve flag timeline for the session', async () => {
            const res = await request(app)
                .get(`/api/proctor/flags/${examSessionId}`)
                .set('Authorization', `Bearer ${examinerToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(2);

            const gazeFlag = res.body.find(f => f.alert_type === 'GAZE_LEFT');
            expect(gazeFlag).toBeDefined();
            expect(gazeFlag.ai_verdict).toBe('SUSPICIOUS');
        });

        it('should prevent student from viewing other sessions or examiner endpoints', async () => {
            const res = await request(app)
                .get('/api/proctor/sessions')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/examiners only/i);
        });
    });
});
