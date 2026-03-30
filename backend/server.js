require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const skillRoutes = require('./routes/skills');
const aiRoutes = require('./routes/ai');
const setupSocket = require('./socket');

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

// Serve Static Frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
