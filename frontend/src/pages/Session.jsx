import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Send, ArrowLeft, CheckCircle } from 'lucide-react';
import ReviewModal from '../components/ReviewModal';

export default function Session() {
    const { sessionId } = useParams();
    const { currentUser, fetchLatestProfile } = useAuth();
    const socket = useSocket();
    const navigate = useNavigate();
    
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [sessionDetails, setSessionDetails] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [linkInput, setLinkInput] = useState('');
    
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!currentUser) { navigate('/'); return; }

        fetch(`/api/skills/sessions/session/${sessionId}`)
            .then(res => {
                if (!res.ok) throw new Error('Not found');
                return res.json();
            })
            .then(session => {
                setSessionDetails(session);
            })
            .catch(err => {
                console.error("Could not fetch session:", err);
                navigate('/dashboard');
            });

        fetch(`/api/skills/sessions/${sessionId}/messages`)
            .then(res => res.json())
            .then(data => {
                setMessages(data);
            })
            .catch(err => console.error("Could not fetch messages:", err));

        if (socket) {
            socket.emit('join_session', { sessionId });

            const handleReceiveMessage = (message) => {
                setMessages(prev => [...prev, message]);
            };
            const handleReceiveLink = ({ meetingLink }) => {
                setSessionDetails(prev => ({ ...prev, meetingLink }));
            };
            const handleSessionCompleted = () => {
                setSessionDetails(prev => ({ ...prev, status: 'completed' }));
                fetchLatestProfile();
            };

            socket.on('receive_message', handleReceiveMessage);
            socket.on('receive_meeting_link', handleReceiveLink);
            socket.on('session_completed', handleSessionCompleted);
            
            return () => { 
                socket.off('receive_message', handleReceiveMessage);
                socket.off('receive_meeting_link', handleReceiveLink);
                socket.off('session_completed', handleSessionCompleted);
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, socket, sessionId, navigate]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket) return;
        
        socket.emit('send_message', {
            sessionId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: newMessage
        });
        
        setNewMessage('');
    };

    const handleCompleteSession = async () => {
        if (!window.confirm("Are you sure you want to complete this session? Your credits will be released to the teacher.")) return;
        
        const res = await fetch(`/api/skills/sessions/${sessionId}/complete`, {
            method: 'POST'
        });
        
        if (res.ok) {
            setSessionDetails(prev => ({ ...prev, status: 'completed' }));
            setShowReviewModal(true);
            fetchLatestProfile();
        }
    };

    const handleDispute = async () => {
        const reason = window.prompt("Please provide a brief reason for the dispute:");
        if (!reason) return;

        const res = await fetch(`/api/skills/sessions/${sessionId}/dispute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        
        if (res.ok) {
            const data = await res.json();
            setSessionDetails(prev => ({ ...prev, status: 'disputed' }));
            alert(`Dispute Resolved by AI\n\nResolution: ${data.message}\nReasoning: ${data.disputeRecord?.reasoning || 'No details.'}`);
            fetchLatestProfile();
        }
    };

    const shareLink = () => {
        if (!linkInput.trim() || !socket) return;
        socket.emit('send_meeting_link', { sessionId, meetingLink: linkInput.trim() });
        setLinkInput('');
    };

    if (!sessionDetails) return null;

    const isTeacher = sessionDetails.teacherId === currentUser.id;

    return (
        <div className="min-h-screen flex flex-col p-4 max-w-5xl mx-auto h-screen">
            <header className="flex justify-between items-center bg-slate-800/80 backdrop-blur-md p-4 rounded-t-2xl border-b border-white/10 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold">{sessionDetails.skillTitle}</h1>
                        <p className="text-slate-400 text-sm">
                            {isTeacher ? 'You are teaching' : `Learning from ${sessionDetails.teacherName}`}
                            {sessionDetails.status === 'completed' && " • Completed"}
                            {sessionDetails.status === 'disputed' && " • Disputed"}
                        </p>
                    </div>
                </div>
            </header>

            {/* Pinned Meeting Link */}
            {sessionDetails.meetingLink && (
                <div className="bg-indigo-500/20 text-indigo-300 p-2 text-center text-sm font-medium border-b border-indigo-500/30 shrink-0">
                    Live Session Link: <a href={sessionDetails.meetingLink} target="_blank" rel="noreferrer" className="underline hover:text-indigo-200">{sessionDetails.meetingLink}</a>
                </div>
            )}

            {/* Session Control Panel (Active Sessions Only) */}
            {sessionDetails.status === 'active' && (
                <div className="bg-slate-800 border-b border-white/10 p-3 flex shrink-0 justify-between items-center">
                    {isTeacher ? (
                        <div className="flex gap-2 w-full max-w-md">
                            <input 
                                type="text" 
                                placeholder="Add Meeting Link (Zoom/Meet)" 
                                value={linkInput} 
                                onChange={(e) => setLinkInput(e.target.value)} 
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white text-sm"
                            />
                            <button onClick={shareLink} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium whitespace-nowrap">
                                Share Link
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3 justify-end w-full">
                            <button onClick={handleDispute} className="text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium">
                                Dispute Session
                            </button>
                            <button onClick={handleCompleteSession} className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                <CheckCircle size={16} /> Complete & Release Credits
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900/50 backdrop-blur-sm custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-500 mt-20">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.senderId === currentUser.id;
                        return (
                            <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                <span className="text-xs text-slate-500 mb-1 ml-1 mr-1">{isMe ? 'You' : msg.senderName}</span>
                                <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${isMe ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <footer className="shrink-0 bg-slate-800/80 backdrop-blur-md p-4 rounded-b-2xl border-t border-white/10">
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Type a message..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button type="submit" disabled={!newMessage.trim()} className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white p-3 rounded-xl transition-colors flex items-center justify-center">
                        <Send size={20} />
                    </button>
                </form>
            </footer>

            {showReviewModal && <ReviewModal sessionId={sessionId} onClose={() => navigate('/dashboard')} />}
        </div>
    );
}
