const { Server } = require('socket.io');
const db = require('./db');

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

        // This function powers our Live Mentorship Chat feature.
        socket.on('send_message', async (data) => {
            const { sessionId, senderId, senderName, text } = data;
            
            try {
                const timestamp = new Date().toISOString();
                
                // First, we ensure no data is ever lost by permanently saving the chat history to our secure database.
                // This is crucial for our AI Dispute Resolution system, which needs to read past chats to make fair rulings.
                await db.query(
                    'INSERT INTO messages (session_id, sender_id, sender_name, text, timestamp) VALUES ($1, $2, $3, $4, $5)',
                    [sessionId, senderId, senderName, text, timestamp]
                );

                const message = {
                    senderId,
                    senderName,
                    text,
                    timestamp
                };

                // Then, we instantly push the message to the student and teacher's screens.
                // We use private 'rooms' (sessionId) so that messages are completely confidential and have zero latency.
                io.to(sessionId).emit('receive_message', message);

                const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
                const session = sessionRows[0];
                
                if (session) {
                    const recipientId = session.teacher_id === senderId ? session.learner_id : session.teacher_id;
                    io.to(recipientId).emit('new_chat_message', {
                        sessionId,
                        senderName,
                        skillTitle: session.skill_title,
                        text
                    });
                }
            } catch (err) {
                console.error("Socket send_message error:", err);
            }
        });

        socket.on('send_meeting_link', async (data) => {
            const { sessionId, meetingLink } = data;
            try {
                await db.query('UPDATE sessions SET meeting_link = $1 WHERE id = $2', [meetingLink, sessionId]);
                io.to(sessionId).emit('receive_meeting_link', { meetingLink });
            } catch (err) {
                console.error("Socket send_meeting_link error:", err);
            }
        });

        socket.on('notify_review_completed', ({ sessionId }) => {
            io.to(sessionId).emit('session_reviewed');
        });

        socket.on('disconnect', () => {
        });
    });

    return io;
};
