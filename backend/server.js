require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const skillRoutes = require('./routes/skills');
const aiRoutes = require('./routes/ai');
const setupSocket = require('./socket');
const { initDB } = require('./db');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Socket.io
const io = setupSocket(server);
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/ai', aiRoutes);

// Keep-alive endpoint
app.get('/api/ping', (req, res) => {
    res.status(200).send('pong');
});

// Serve Static Frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3001;

initDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT}`);
        
        // Self-ping to keep Render free tier active
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        setInterval(async () => {
            try {
                const res = await fetch(`${url}/api/ping`);
                if (res.ok) console.log(`Keep-alive ping successful at ${new Date().toISOString()}`);
            } catch (err) {
                console.error('Keep-alive ping failed:', err.message);
            }
        }, 14 * 60 * 1000); // Ping every 14 minutes
    });
});
