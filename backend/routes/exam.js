const express = require('express');
const Exam    = require('../models/Exam');
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
        res.json(exams);
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
        res.json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;