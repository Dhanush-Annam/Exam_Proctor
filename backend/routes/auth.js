const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const User      = require('../models/User');
const router    = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, inviteCode } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing)
            return res.status(400).json({ error: 'Email already exists' });

        // Safe role policy: default to student. Examiner requires valid invitation code.
        let assignedRole = 'student';
        if (role === 'examiner') {
            const validInviteCode = process.env.EXAMINER_INVITE_CODE || 'EXAM_PROCTOR_EXAMINER_2025';
            if (inviteCode && inviteCode === validInviteCode) {
                assignedRole = 'examiner';
            } else {
                return res.status(403).json({
                    error: 'Valid examiner invite code is required to register as an examiner.'
                });
            }
        }

        const hashed = await bcrypt.hash(password, 10);
        const user   = await User.create({
            name,
            email,
            password: hashed,
            role: assignedRole
        });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(201).json({ token, user: {
            id: user.id, name: user.name,
            email: user.email, role: user.role
        }});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Use withPassword scope explicitly to verify credentials
        const user = await User.scope('withPassword').findOne({ where: { email } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.status(401).json({ error: 'Invalid password' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ token, user: {
            id: user.id, name: user.name,
            email: user.email, role: user.role
        }});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;