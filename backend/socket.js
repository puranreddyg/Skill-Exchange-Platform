const { Server } = require('socket.io');
const { sessions, messages, saveData } = require('./store');

module.exports = function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        socket.on('join_user_room', (userId) => {
            socket.join(userId);
        });

        socket.on('join_dashboard', () => {
            socket.join('dashboard');
        });

        socket.on('publish_skill', (skill) => {
            io.to('dashboard').emit('new_skill', skill);
        });

        socket.on('join_session', ({ sessionId }) => {
            socket.join(sessionId);
        });

        socket.on('send_message', (data) => {
            const { sessionId, senderId, senderName, text } = data;
            const message = {
                senderId,
                senderName,
                text,
                timestamp: new Date().toISOString()
            };

            if (!messages[sessionId]) {
                messages[sessionId] = [];
            }
            messages[sessionId].push(message);
            saveData();

            io.to(sessionId).emit('receive_message', message);

            const session = sessions.find(s => s.id === sessionId);
            if (session) {
                const recipientId = session.teacherId === senderId ? session.learnerId : session.teacherId;
                io.to(recipientId).emit('new_chat_message', {
                    sessionId,
                    senderName,
                    skillTitle: session.skillTitle,
                    text
                });
            }
        });

        socket.on('send_meeting_link', (data) => {
            const { sessionId, meetingLink } = data;
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
                session.meetingLink = meetingLink;
                saveData();
                io.to(sessionId).emit('receive_meeting_link', { meetingLink });
            }
        });

        socket.on('disconnect', () => {
        });
    });

    return io;
};
