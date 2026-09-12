const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Pre-set environment variables for test execution
process.env.JWT_SECRET = 'test-super-secret-jwt-key';
process.env.EXAMINER_INVITE_CODE = 'TEST_EXAMINER_KEY_123';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';

// Import models index first to establish associations properly
require('../models/index');

const User = require('../models/User');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Flag = require('../models/Flag');

// Initialize model methods as jest mocks
User.findOne = jest.fn();
User.create = jest.fn();
User.scope = jest.fn();

Exam.findByPk = jest.fn();
Exam.findAll = jest.fn();
Exam.create = jest.fn();

Submission.findOne = jest.fn();
Submission.findAll = jest.fn();
Submission.create = jest.fn();

Flag.findOne = jest.fn();
Flag.findAll = jest.fn();
Flag.create = jest.fn();
Flag.count = jest.fn();

// Import routes
const authRoutes = require('../routes/auth');
const examRoutes = require('../routes/exam');
const proctorRoutes = require('../routes/proctor');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/proctor', proctorRoutes);

// Helper to generate JWT
function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

describe('Security Hardening & Access Control Suite', () => {

    const studentUser = { id: 'student-uuid-1', name: 'Alice Student', email: 'alice@test.com', role: 'student' };
    const otherStudent = { id: 'student-uuid-2', name: 'Bob Student', email: 'bob@test.com', role: 'student' };
    const examinerUser = { id: 'examiner-uuid-1', name: 'Prof Smith', email: 'prof@test.com', role: 'examiner' };
    const otherExaminer = { id: 'examiner-uuid-2', name: 'Prof Jones', email: 'jones@test.com', role: 'examiner' };

    const studentToken = generateToken(studentUser);
    const otherStudentToken = generateToken(otherStudent);
    const examinerToken = generateToken(examinerUser);
    const otherExaminerToken = generateToken(otherExaminer);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // 1. Users / Authentication / Registration Security
    // =========================================================================
    describe('1. Registration Role Escalation & Password Security', () => {
        it('should reject registration as examiner without valid invite code', async () => {
            User.findOne.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Malicious User',
                    email: 'hacker@test.com',
                    password: 'Password123!',
                    role: 'examiner'
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/examiner invite code/i);
            expect(User.create).not.toHaveBeenCalled();
        });

        it('should permit examiner registration when valid invite code is provided', async () => {
            User.findOne.mockResolvedValue(null);
            User.create.mockResolvedValue({
                id: 'new-examiner-id',
                name: 'Legit Examiner',
                email: 'legit@test.com',
                role: 'examiner'
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Legit Examiner',
                    email: 'legit@test.com',
                    password: 'Password123!',
                    role: 'examiner',
                    inviteCode: 'TEST_EXAMINER_KEY_123'
                });

            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('examiner');
            expect(res.body.user.password).toBeUndefined();
        });

        it('should register standard students without exposing password hash', async () => {
            User.findOne.mockResolvedValue(null);
            User.create.mockResolvedValue({
                id: 'new-student-id',
                name: 'New Student',
                email: 'student@test.com',
                role: 'student'
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'New Student',
                    email: 'student@test.com',
                    password: 'Password123!'
                });

            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('student');
            expect(res.body.user.password).toBeUndefined();
        });

        it('should reject unauthenticated access to protected routes with 401', async () => {
            const res = await request(app).get('/api/exams');
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('No token provided');
        });

        it('should verify password using withPassword scope during login and never return password hash', async () => {
            const hashedPassword = await bcrypt.hash('secret123', 10);
            const userWithPassword = {
                id: 'user-id-1',
                name: 'John Doe',
                email: 'john@test.com',
                password: hashedPassword,
                role: 'student'
            };

            const scopeMock = {
                findOne: jest.fn().mockResolvedValue(userWithPassword)
            };
            User.scope = jest.fn().mockReturnValue(scopeMock);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'john@test.com', password: 'secret123' });

            expect(res.status).toBe(200);
            expect(User.scope).toHaveBeenCalledWith('withPassword');
            expect(res.body.user.password).toBeUndefined();
            expect(res.body.token).toBeDefined();
        });
    });

    // =========================================================================
    // 2. Exam Answer-Key Protection & Status Access
    // =========================================================================
    describe('2. Exam Answer-Key Protection & Status Access', () => {
        const fullExam = {
            id: 'exam-uuid-1',
            title: 'Computer Science 101',
            duration_minutes: 60,
            status: 'active',
            created_by: 'examiner-uuid-1',
            questions: [
                {
                    id: 1,
                    question: 'What is the time complexity of binary search?',
                    options: ['O(n)', 'O(log n)', 'O(n^2)', 'O(1)'],
                    answer: 'O(log n)'
                },
                {
                    id: 2,
                    question: 'Which data structure uses LIFO order?',
                    options: ['Queue', 'Stack', 'Tree', 'Graph'],
                    answer: 'Stack'
                }
            ],
            toJSON() {
                return {
                    id: this.id,
                    title: this.title,
                    duration_minutes: this.duration_minutes,
                    status: this.status,
                    created_by: this.created_by,
                    questions: this.questions
                };
            }
        };

        it('GET /api/exams should never return question text or answer keys to students in exam listing', async () => {
            Exam.findAll.mockResolvedValue([
                fullExam
            ]);
            Submission.findAll.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/exams')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body[0].questions).toHaveLength(2);
            // Verify zero question text or answers reach the client listing
            expect(res.body[0].questions[0].question).toBeUndefined();
            expect(res.body[0].questions[0].answer).toBeUndefined();
            expect(res.body[0].questions[0].options).toBeUndefined();
        });

        it('GET /api/exams/:id should sanitize questions and strip answer keys for students', async () => {
            Exam.findByPk.mockResolvedValue(fullExam);
            Submission.findOne.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/exams/exam-uuid-1')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body.questions).toHaveLength(2);
            // CRITICAL: verify zero answer keys exist in student response
            res.body.questions.forEach(q => {
                expect(q.answer).toBeUndefined();
                expect(q.correctAnswer).toBeUndefined();
                expect(q.question).toBeDefined();
                expect(q.options).toBeDefined();
            });
        });

        it('GET /api/exams/:id should deny student access to draft exams with 403', async () => {
            const draftExam = {
                ...fullExam,
                status: 'draft',
                toJSON: () => ({ ...fullExam, status: 'draft' })
            };
            Exam.findByPk.mockResolvedValue(draftExam);

            const res = await request(app)
                .get('/api/exams/exam-uuid-1')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/not currently active/i);
        });

        it('GET /api/exams/:id should deny student access to closed exams with 403', async () => {
            const closedExam = {
                ...fullExam,
                status: 'closed',
                toJSON: () => ({ ...fullExam, status: 'closed' })
            };
            Exam.findByPk.mockResolvedValue(closedExam);

            const res = await request(app)
                .get('/api/exams/exam-uuid-1')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/not currently active/i);
        });

        it('GET /api/exams/:id should allow the owning examiner to see full exam with answer keys', async () => {
            Exam.findByPk.mockResolvedValue(fullExam);

            const res = await request(app)
                .get('/api/exams/exam-uuid-1')
                .set('Authorization', `Bearer ${examinerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.questions[0].answer).toBe('O(log n)');
        });

        it('GET /api/exams/:id should reject another examiner trying to access private exams', async () => {
            Exam.findByPk.mockResolvedValue(fullExam);

            const res = await request(app)
                .get('/api/exams/exam-uuid-1')
                .set('Authorization', `Bearer ${otherExaminerToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/unauthorized/i);
        });
    });

    // =========================================================================
    // 3. Server-Side Grading & Submission Integrity
    // =========================================================================
    describe('3. Server-Side Grading & Submission Integrity', () => {
        const activeExam = {
            id: 'exam-uuid-1',
            status: 'active',
            questions: [
                { question: 'Q1', options: ['A', 'B'], answer: 'B' },
                { question: 'Q2', options: ['C', 'D'], answer: 'C' }
            ]
        };

        it('POST /api/exams/:id/submit should calculate scores server-side and ignore client-injected scores', async () => {
            Exam.findByPk.mockResolvedValue(activeExam);
            Submission.findOne.mockResolvedValue(null);
            Flag.count.mockResolvedValue(1);

            Submission.create.mockImplementation((payload) => Promise.resolve({ id: 'sub-1', ...payload }));

            const res = await request(app)
                .post('/api/exams/exam-uuid-1/submit')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    session_id: 'session_abc',
                    answers: { 0: 'B', 1: 'D' }, // 1 correct out of 2 = 50%
                    score: 100, // Malicious client attempt to overwrite score
                    correct_answers: 2,
                    total_flags: 0
                });

            expect(res.status).toBe(200);
            expect(res.body.score).toBe(50);
            expect(res.body.correct_answers).toBe(1);
            expect(res.body.total_flags).toBe(1);

            expect(Submission.create).toHaveBeenCalledWith(expect.objectContaining({
                student_id: studentUser.id,
                score: 50,
                correct_answers: 1,
                total_flags: 1
            }));
        });

        it('POST /api/exams/:id/submit should reject submission if exam is not active', async () => {
            Exam.findByPk.mockResolvedValue({ id: 'exam-uuid-1', status: 'closed' });

            const res = await request(app)
                .post('/api/exams/exam-uuid-1/submit')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    session_id: 'session_abc',
                    answers: {}
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/inactive exam/i);
        });

        it('POST /api/exams/:id/submit should reject duplicate submissions from the same student', async () => {
            Exam.findByPk.mockResolvedValue(activeExam);
            Submission.findOne.mockResolvedValue({ id: 'existing-sub' });

            const res = await request(app)
                .post('/api/exams/exam-uuid-1/submit')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    session_id: 'session_abc',
                    answers: {}
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already submitted/i);
        });

        it('POST /api/exams/:id/submit should reject non-students attempting to submit exams', async () => {
            const res = await request(app)
                .post('/api/exams/exam-uuid-1/submit')
                .set('Authorization', `Bearer ${examinerToken}`)
                .send({
                    session_id: 'session_abc',
                    answers: {}
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/only students/i);
        });
    });

    // =========================================================================
    // 4. Proctoring Event & Flag Authorization
    // =========================================================================
    describe('4. Proctoring Event & Flag Authorization', () => {
        it('POST /api/proctor/log-event should reject non-student accounts', async () => {
            const res = await request(app)
                .post('/api/proctor/log-event')
                .set('Authorization', `Bearer ${examinerToken}`)
                .send({
                    session_id: 'session_abc',
                    exam_id: 'exam-uuid-1',
                    alert_type: 'TAB_SWITCH'
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/only students/i);
        });

        it('POST /api/proctor/log-event should bind flag to authenticated student ID and reject spoofed student ID', async () => {
            Exam.findByPk.mockResolvedValue({ id: 'exam-uuid-1', status: 'active' });
            Submission.findOne.mockResolvedValue(null);
            Flag.create.mockResolvedValue({ id: 'flag-1' });

            const res = await request(app)
                .post('/api/proctor/log-event')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    session_id: 'session_abc',
                    exam_id: 'exam-uuid-1',
                    alert_type: 'TAB_SWITCH',
                    detail: 'Switched tab',
                    student_id: otherStudent.id // Spoofed student_id in body
                });

            expect(res.status).toBe(200);
            expect(Flag.create).toHaveBeenCalledWith(expect.objectContaining({
                student_id: studentUser.id // Must bind to authenticated token, not spoofed body
            }));
        });

        it('GET /api/proctor/flags/:session_id should allow student to read their own flags', async () => {
            Submission.findOne.mockResolvedValue({
                session_id: 'session_123',
                student_id: studentUser.id,
                exam_id: 'exam-uuid-1'
            });
            Flag.findAll.mockResolvedValue([
                {
                    id: 'flag-1',
                    session_id: 'session_123',
                    student_id: studentUser.id,
                    alert_type: 'GAZE_LEFT',
                    image_path: null,
                    toJSON: () => ({ id: 'flag-1', alert_type: 'GAZE_LEFT' })
                }
            ]);

            const res = await request(app)
                .get('/api/proctor/flags/session_123')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
        });

        it('GET /api/proctor/flags/:session_id should deny student reading another student session flags', async () => {
            Submission.findOne.mockResolvedValue({
                session_id: 'session_other',
                student_id: otherStudent.id,
                exam_id: 'exam-uuid-1'
            });

            const res = await request(app)
                .get('/api/proctor/flags/session_other')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/unauthorized/i);
        });

        it('GET /api/proctor/flags/:session_id should safely authorize and return empty array when session has 0 flags', async () => {
            Submission.findOne.mockResolvedValue({
                session_id: 'clean_session_zero_flags',
                student_id: studentUser.id,
                exam_id: 'exam-uuid-1'
            });
            Flag.findAll.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/proctor/flags/clean_session_zero_flags')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('GET /api/proctor/flags/:session_id should allow exam creator to view flags for their exam', async () => {
            Submission.findOne.mockResolvedValue({
                session_id: 'session_student',
                student_id: studentUser.id,
                exam_id: 'exam-uuid-1'
            });
            Exam.findByPk.mockResolvedValue({
                id: 'exam-uuid-1',
                created_by: examinerUser.id
            });
            Flag.findAll.mockResolvedValue([
                {
                    id: 'flag-1',
                    alert_type: 'TAB_SWITCH',
                    toJSON: () => ({ id: 'flag-1', alert_type: 'TAB_SWITCH' })
                }
            ]);

            const res = await request(app)
                .get('/api/proctor/flags/session_student')
                .set('Authorization', `Bearer ${examinerToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
        });

        it('GET /api/proctor/flags/:session_id should deny unauthorized examiner for another examiner exam', async () => {
            Submission.findOne.mockResolvedValue({
                session_id: 'session_student',
                student_id: studentUser.id,
                exam_id: 'exam-uuid-1'
            });
            Exam.findByPk.mockResolvedValue({
                id: 'exam-uuid-1',
                created_by: examinerUser.id
            });

            const res = await request(app)
                .get('/api/proctor/flags/session_student')
                .set('Authorization', `Bearer ${otherExaminerToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/unauthorized/i);
        });

        it('GET /api/proctor/flags/:session_id should return 404 if session does not exist', async () => {
            Submission.findOne.mockResolvedValue(null);
            Flag.findOne.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/proctor/flags/non_existent_session')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/session not found/i);
        });
    });
});
