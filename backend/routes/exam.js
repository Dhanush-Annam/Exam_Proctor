const express = require('express');
const axios   = require('axios');
const Exam    = require('../models/Exam');
const Submission = require('../models/Submission');
const Flag       = require('../models/Flag');
const auth    = require('../middleware/auth');
const router  = express.Router();

// Create exam (examiner only)
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Only examiners can create exams' });

        const { title, duration_minutes, questions } = req.body;
        const exam = await Exam.create({
            title, duration_minutes, questions,
            created_by: req.user.id
        });
        res.status(201).json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all active exams (student)
router.get('/', auth, async (req, res) => {
    try {
        const exams = await Exam.findAll({ where: { status: 'active' } });
        const submissions = await Submission.findAll({ where: { student_id: req.user.id } });
        const submittedExamIds = submissions.map(s => s.exam_id);
        const filteredExams = exams.filter(e => !submittedExamIds.includes(e.id.toString()) && !submittedExamIds.includes(e.id));
        res.json(filteredExams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get exams created by this examiner
router.get('/mine', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Examiners only' });

        const exams = await Exam.findAll({
            where: { created_by: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json(exams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update exam status (examiner only)
router.patch('/:id/status', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Only examiners can update exam status' });

        const { status } = req.body;
        if (!['draft', 'active', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const exam = await Exam.findByPk(req.params.id);
        if (!exam)
            return res.status(404).json({ error: 'Exam not found' });

        if (exam.created_by !== req.user.id)
            return res.status(403).json({ error: 'Unauthorized to update this exam' });

        exam.status = status;
        await exam.save();
        res.json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single exam
router.get('/:id', auth, async (req, res) => {
    try {
        const exam = await Exam.findByPk(req.params.id);
        if (!exam)
            return res.status(404).json({ error: 'Exam not found' });
            
        if (req.user.role === 'examiner') {
            if (exam.created_by !== req.user.id) {
                return res.status(403).json({ error: 'Unauthorized to view this exam' });
            }
        } else if (req.user.role === 'student') {
            const submission = await Submission.findOne({
                where: { student_id: req.user.id, exam_id: req.params.id }
            });
            if (submission) {
                return res.status(403).json({ error: 'You have already submitted this exam' });
            }
        }
        res.json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit exam
router.post('/:id/submit', auth, async (req, res) => {
    try {
        const { answers, session_id } = req.body;

        const exam = await Exam.findByPk(req.params.id);
        if (!exam)
            return res.status(404).json({ error: 'Exam not found' });

        const existingSubmission = await Submission.findOne({
            where: { student_id: req.user.id, exam_id: req.params.id }
        });
        if (existingSubmission) {
            return res.status(400).json({ error: 'You have already submitted this exam' });
        }

        // Auto grade
        const questions      = exam.questions;
        let correct_answers  = 0;

        questions.forEach((q, i) => {
            if (answers[i] && answers[i] === q.answer) {
                correct_answers++;
            }
        });

        const score = (correct_answers / questions.length) * 100;

        // Count flags for this session
        const total_flags = await Flag.count({ where: { session_id } });

        const submission = await Submission.create({
            student_id      : req.user.id,
            exam_id         : req.params.id,
            session_id,
            answers,
            score,
            total_questions : questions.length,
            correct_answers,
            total_flags
        });

        // Trigger AI Proctoring Session End and Review in the background (non-blocking for student)
        if (session_id && process.env.AI_SERVICE_URL) {
            axios.post(`${process.env.AI_SERVICE_URL}/session/${session_id}/end`)
                .then(async (aiResponse) => {
                    const report = aiResponse.data;
                    if (report && report.flags) {
                        // Update flags in database with Gemini verdicts
                        for (const flag of report.flags) {
                            if (flag.image_path) {
                                await Flag.update(
                                    {
                                        ai_verdict: flag.ai_verdict,
                                        ai_reason: flag.ai_reason
                                    },
                                    {
                                        where: {
                                            session_id,
                                            image_path: flag.image_path
                                        }
                                    }
                                );
                            }
                        }
                        console.log(`Successfully completed automated AI review for session ${session_id}`);
                    }
                })
                .catch((err) => {
                    console.error(`Failed to automatically end proctoring session/review for ${session_id}:`, err.message);
                });
        }

        res.json({
            score,
            correct_answers,
            total_questions : questions.length,
            total_flags,
            submission_id   : submission.id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all submissions for an exam (examiner)
router.get('/:id/submissions', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Examiners only' });

        const exam = await Exam.findByPk(req.params.id);
        if (!exam)
            return res.status(404).json({ error: 'Exam not found' });

        if (exam.created_by !== req.user.id)
            return res.status(403).json({ error: 'Unauthorized to view submissions for this exam' });

        const submissions = await Submission.findAll({
            where: { exam_id: req.params.id }
        });
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update exam details (examiner only)
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Only examiners can update exams' });

        const { title, duration_minutes, questions } = req.body;
        const exam = await Exam.findByPk(req.params.id);
        if (!exam)
            return res.status(404).json({ error: 'Exam not found' });

        if (exam.created_by !== req.user.id)
            return res.status(403).json({ error: 'Unauthorized to update this exam' });

        exam.title = title !== undefined ? title : exam.title;
        exam.duration_minutes = duration_minutes !== undefined ? duration_minutes : exam.duration_minutes;
        exam.questions = questions !== undefined ? questions : exam.questions;

        await exam.save();
        res.json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;