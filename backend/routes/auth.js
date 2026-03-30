const express = require('express');
const router = express.Router();
const { users, saveData } = require('../store');

const generateId = () => Math.random().toString(36).substr(2, 9);

router.get('/:id', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ id: user.id, name: user.name, credits: user.credits });
});

router.post('/signup', (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(409).json({ error: 'You already have an account, please log in!' });
    }

    const newUser = {
        id: generateId(),
        name,
        email,
        password,
        credits: 5
    };

    users.push(newUser);
    saveData();

    res.status(201).json({ 
        message: 'Signup successful', 
        user: { id: newUser.id, name: newUser.name, credits: newUser.credits },
        token: `mock_token_${newUser.id}`
    });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.status(200).json({
        message: 'Login successful',
        user: { id: user.id, name: user.name, credits: user.credits },
        token: `mock_token_${user.id}`
    });
});

module.exports = router;
