const express = require('express');
const router = express.Router();
const db = require('../db');

const generateId = () => Math.random().toString(36).substr(2, 9);

router.get('/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name, credits, badges FROM users WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'You already have an account, please log in!' });
        }

        const newId = generateId();
        const initialCredits = 5;

        await db.query(
            'INSERT INTO users (id, name, email, password, credits) VALUES ($1, $2, $3, $4, $5)',
            [newId, name, email, password, initialCredits]
        );

        res.status(201).json({ 
            message: 'Signup successful', 
            user: { id: newId, name, credits: initialCredits, badges: [] },
            token: `mock_token_${newId}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during signup' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { rows } = await db.query('SELECT id, name, credits, badges FROM users WHERE email = $1 AND password = $2', [email, password]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = rows[0];

        res.status(200).json({
            message: 'Login successful',
            user,
            token: `mock_token_${user.id}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

router.post('/mint-badge', async (req, res) => {
    const { userId, topic } = req.body;
    if (!userId || !topic) return res.status(400).json({ error: 'Missing parameters' });
    
    try {
        const { rows } = await db.query('SELECT badges FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        
        let badges = rows[0].badges || [];
        // Prevent duplicate badge topics
        if (badges.some(b => b.topic === topic)) {
            return res.json({ message: 'Badge already minted', badges });
        }
        
        const newBadge = { topic, earnedAt: new Date().toISOString() };
        badges.push(newBadge);
        
        await db.query('UPDATE users SET badges = $1::jsonb WHERE id = $2', [JSON.stringify(badges), userId]);
        
        res.json({ message: 'Badge minted successfully', badges });
    } catch (err) {
        console.error('Badge Minting Error:', err);
        res.status(500).json({ error: 'Failed to mint badge' });
    }
});

module.exports = router;
