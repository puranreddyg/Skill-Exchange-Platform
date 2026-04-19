import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Send, ArrowLeft, CheckCircle, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import ReviewModal from '../components/ReviewModal';

export default function Session() {
    const { sessionId } = useParams();
    const { currentUser, fetchLatestProfile } = useAuth();
    const socket = useSocket();
    const navigate = useNavigate();
    
    const [sessionDetails, setSessionDetails] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    
    // Reschedule UI States
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    const [emergencyReason, setEmergencyReason] = useState('');
    const [showBulkScheduler, setShowBulkScheduler] = useState(false);
    const [bulkScheduleData, setBulkScheduleData] = useState([]);
    
    const [challengeSubmission, setChallengeSubmission] = useState('');
    const [testPrompt, setTestPrompt] = useState('');
    const [timeRemaining, setTimeRemaining] = useState('');

    const [showDisputeModal, setShowDisputeModal] = useState(false);
    const [disputeReason, setDisputeReason] = useState('');
    const [disputeResult, setDisputeResult] = useState(null);
    const [redirectCountdown, setRedirectCountdown] = useState(null);

    const [meetingLinkInput, setMeetingLinkInput] = useState('');

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!currentUser) { navigate('/'); return; }

        const fetchSession = async () => {
            try {
                const res = await fetch(`/api/skills/sessions/session/${sessionId}`);
                if (!res.ok) throw new Error('Not found');
                const data = await res.json();
                setSessionDetails(data);
            } catch (_) {
                navigate('/dashboard');
            }
        };

        fetchSession();

        fetch(`/api/skills/sessions/${sessionId}/messages`)
            .then(res => res.json())
            .then(data => setMessages(data))
            .catch(err => console.error("Could not fetch messages", err));

        if (socket) {
            socket.emit('join_session', { sessionId });
            socket.on('receive_message', (msg) => setMessages(prev => [...prev, msg]));
            socket.on('session_updated', (updated) => setSessionDetails(updated));
            socket.on('session_completed', (updated) => {
                setSessionDetails(updated);
                fetchLatestProfile();
            });
            socket.on('session_disputed', ({ session, disputeRecord }) => {
                setSessionDetails(session);
                setDisputeResult(disputeRecord);
                fetchLatestProfile();
                
                let seconds = 15;
                setRedirectCountdown(seconds);
                const timer = setInterval(() => {
                    seconds -= 1;
                    setRedirectCountdown(seconds);
                    if (seconds <= 0) {
                        clearInterval(timer);
                        window.location.href = '/'; 
                    }
                }, 1000);
            });
            socket.on('receive_meeting_link', ({ meetingLink }) => {
                setSessionDetails(prev => prev ? { ...prev, meetingLink } : prev);
            });

            return () => {
                socket.off('receive_message');
                socket.off('session_updated');
                socket.off('session_completed');
                socket.off('session_disputed');
                socket.off('receive_meeting_link');
            };
        }
    }, [currentUser, socket, sessionId, navigate, fetchLatestProfile]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        // Countdown timer for Upcoming levels
        let interval;
        if (sessionDetails && sessionDetails.syllabus) {
            const activeLevel = sessionDetails.syllabus[sessionDetails.currentLevel - 1];
            if (activeLevel && activeLevel.status === 'Upcoming') {
                const checkTime = () => {
                    const scheduled = new Date(`${activeLevel.scheduledDate}T${activeLevel.scheduledTime || '00:00'}`);
                    const now = new Date();
                    const diff = scheduled - now;
                    if (diff <= 0) {
                        clearInterval(interval);
                        setTimeRemaining('00:00:00');
                        setSessionDetails(prev => {
                            if (!prev || !prev.syllabus) return prev;
                            const newSyllabus = [...prev.syllabus];
                            const idx = prev.currentLevel - 1;
                            if (newSyllabus[idx] && newSyllabus[idx].status === 'Upcoming') {
                                newSyllabus[idx].status = 'Active';
                            }
                            return { ...prev, syllabus: newSyllabus };
                        });
                        fetch(`/api/skills/sessions/${sessionId}/level-action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ levelNumber: activeLevel.levelNumber, action: 'activate_level' })
                        });
                    } else {
                        const h = Math.floor(diff / (1000 * 60 * 60));
                        const m = Math.floor((diff / 1000 / 60) % 60);
                        const s = Math.floor((diff / 1000) % 60);
                        setTimeRemaining(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
                    }
                };
                checkTime();
                interval = setInterval(checkTime, 1000);
            }
        }
        return () => clearInterval(interval);
    }, [sessionDetails, sessionId]);

    const handleAction = async (action, payload = {}) => {
        const activeLevel = sessionDetails.syllabus[sessionDetails.currentLevel - 1];
        if (!activeLevel) return;

        const res = await fetch(`/api/skills/sessions/${sessionId}/level-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ levelNumber: activeLevel.levelNumber, action, payload })
        });
        
        if (res.ok) {
            const updated = await res.json();
            setSessionDetails(updated);
            setChallengeSubmission('');
            setTestPrompt('');
        }
    };

    const handleRescheduleSubmit = async () => {
        await handleAction('request_reschedule', { emergencyReason });
        setShowRescheduleModal(false);
        setEmergencyReason('');
    };

    const openBulkScheduler = () => {
        const editableLevels = sessionDetails.syllabus.map(l => ({ ...l }));
        setBulkScheduleData(editableLevels);
        setShowBulkScheduler(true);
    };

    const handleBulkScheduleSubmit = async () => {
        const res = await fetch(`/api/skills/sessions/${sessionId}/bulk-schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: bulkScheduleData })
        });
        if (res.ok) {
            const updated = await res.json();
            setSessionDetails(updated);
            setShowBulkScheduler(false);
        }
    };

    const handleCompleteSession = async () => {
        if (!window.confirm("Complete the course and release credits to teacher?")) return;
        const res = await fetch(`/api/skills/sessions/${sessionId}/complete`, { method: 'POST' });
        if (res.ok) {
            setSessionDetails(prev => ({ ...prev, status: 'completed' }));
            setShowReviewModal(true);
            fetchLatestProfile();
        }
    };

    const handleDisputeSubmit = async () => {
        const res = await fetch(`/api/skills/sessions/${sessionId}/dispute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: disputeReason })
        });
        if (res.ok) {
            setShowDisputeModal(false);
            setDisputeReason('');
        }
    };

    const shareMeetingLink = () => {
        if (!meetingLinkInput.trim() || !socket) return;
        socket.emit('send_meeting_link', { sessionId, meetingLink: meetingLinkInput });
        setMeetingLinkInput('');
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket) return;
        socket.emit('send_message', { sessionId, senderId: currentUser.id, senderName: currentUser.name, text: newMessage });
        setNewMessage('');
    };

    if (!sessionDetails) return null;

    const isTeacher = sessionDetails.teacherId === currentUser.id;
    const syllabus = sessionDetails.syllabus || [];
    const activeLevelIndex = (sessionDetails.currentLevel || 1) - 1;
    const activeLevel = syllabus[activeLevelIndex];
    const isSessionFinished = sessionDetails.status === 'completed' || sessionDetails.status === 'disputed';

    return (
        <div className="min-h-screen p-4 max-w-7xl mx-auto flex flex-col h-screen">
            <header className="flex justify-between items-center bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0 mb-4 shadow-xl">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                            {sessionDetails.skillTitle}
                        </h1>
                        <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mt-1">
                            {isTeacher ? '1-ON-1 MENTORSHIP (TEACHING)' : `LEARNING FROM ${sessionDetails.teacherName}`}
                            {isSessionFinished && ` • ${sessionDetails.status.toUpperCase()}`}
                        </p>
                    </div>
                </div>
                {!isTeacher && !isSessionFinished && (
                    <div className="flex items-center gap-2">
                        {activeLevelIndex >= syllabus.length && (
                            <button onClick={handleCompleteSession} className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-lg font-bold transition-all text-sm flex items-center gap-2">
                                <CheckCircle size={16} /> Finish Course & Release Credits
                            </button>
                        )}
                        <button onClick={() => setShowDisputeModal(true)} className="bg-rose-500/20 text-rose-400 border border-rose-500/50 hover:bg-rose-500 hover:text-white px-4 py-2 rounded-lg font-bold transition-all text-sm flex items-center gap-2">
                            <AlertTriangle size={16} /> Dispute Session
                        </button>
                    </div>
                )}
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 overflow-hidden">
                {/* LEFT COLUMN: Skill Tree */}
                <div className="lg:col-span-1 bg-slate-800/50 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
                        Course Progression
                    </h2>
                    
                    <div className="space-y-4 relative">
                        {syllabus.map((lvl, idx) => {
                            let nodeColor = "bg-slate-800 border-slate-700 text-slate-500";
                            let icon = <div className="w-3 h-3 rounded-full bg-slate-600" />;
                            let isPulsing = false;
                            
                            if (lvl.status === 'Completed') {
                                nodeColor = "bg-purple-500/10 border-purple-500/30 text-purple-200 shadow-[0_0_15px_rgba(147,51,234,0.1)]";
                                icon = <CheckCircle size={16} className="text-emerald-400" />;
                            } else if (lvl.status === 'Active') {
                                nodeColor = "bg-indigo-500/20 border-indigo-500 text-indigo-100 shadow-[0_0_20px_rgba(99,102,241,0.2)]";
                                isPulsing = true;
                                icon = <div className="w-3 h-3 rounded-full bg-indigo-400" />;
                            } else if (lvl.status === 'Upcoming') {
                                nodeColor = "bg-purple-500/10 border-purple-500/30 text-purple-200";
                                isPulsing = true;
                                icon = <Clock size={16} className="text-purple-400" />;
                            } else if (lvl.status === 'Requested Next Level' || lvl.status === 'Challenge Assigned' || lvl.status === 'Reschedule Requested') {
                                nodeColor = "bg-amber-500/10 border-amber-500/50 text-amber-100";
                                if (lvl.status === 'Reschedule Requested') isPulsing = true;
                                icon = <AlertTriangle size={16} className="text-amber-400" />;
                            }

                            return (
                                <div key={idx} className="relative flex gap-4">
                                    {/* Tree Line connecting nodes */}
                                    {idx !== syllabus.length - 1 && (
                                        <div className="absolute top-8 left-3.5 w-0.5 h-full bg-slate-700/50 -z-10" />
                                    )}
                                    <div className={`mt-1.5 w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center bg-slate-900 ${lvl.status === 'Completed' ? 'border-emerald-500' : (lvl.status === 'Active' || lvl.status === 'Upcoming' ? 'border-indigo-500' : 'border-slate-700')}`}>
                                        {icon}
                                    </div>
                                    <div className={`flex-1 p-4 rounded-xl border ${nodeColor} ${isPulsing && lvl.status === 'Active' ? 'animate-pulse-navy' : ''} ${isPulsing && lvl.status === 'Upcoming' ? 'animate-pulse-purple' : ''} transition-all duration-300`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Level {lvl.levelNumber}</span>
                                            <span className="text-[10px] font-mono opacity-60 bg-black/20 px-1.5 py-0.5 rounded">{lvl.status}</span>
                                        </div>
                                        <h4 className="font-bold text-sm mb-2">{lvl.topicName}</h4>
                                        <div className="text-xs opacity-60 flex items-center gap-2">
                                            {lvl.scheduledDate} @ {lvl.scheduledTime}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT COLUMN: Action Panel & Chat */}
                <div className="lg:col-span-2 flex flex-col gap-6 min-h-0">
                    
                    {/* Session Resources / Meeting Link Spot */}
                    <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/5 p-4 flex flex-col gap-3 shrink-0 shadow-lg">
                        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">Session Resources</h3>
                        {sessionDetails.meetingLink && (
                            <div className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-xl flex items-center justify-between">
                                <span className="text-sm text-indigo-300">Live Meeting Link:</span>
                                <a href={sessionDetails.meetingLink.startsWith('http') ? sessionDetails.meetingLink : `https://${sessionDetails.meetingLink}`} target="_blank" rel="noopener noreferrer" className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-1.5 px-4 rounded-lg text-sm transition-all shadow-[0_0_10px_rgba(99,102,241,0.3)]">Join Meeting</a>
                            </div>
                        )}
                        {isTeacher && !isSessionFinished && (
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Enter Zoom/Meet link..." 
                                    value={meetingLinkInput}
                                    onChange={e => setMeetingLinkInput(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                                <button disabled={!meetingLinkInput.trim()} onClick={shareMeetingLink} className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-50 shadow-md">
                                    Share Link
                                </button>
                            </div>
                        )}
                    </div>

                    {/* The Action Panel */}
                    <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-indigo-500/20 p-6 flex-shrink-0 shadow-2xl relative overflow-hidden">
                        {/* Elegant background flare */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        {disputeResult && (
                            <div className={`mb-4 border p-4 rounded-xl ${disputeResult.fault && disputeResult.fault.includes('winner:student') ? 'bg-emerald-500/10 border-emerald-500 text-emerald-200' : 'bg-rose-500/10 border-rose-500 text-rose-200'}`}>
                                <h4 className="font-bold mb-1">Dispute Resolution Result</h4>
                                <p className="text-sm opacity-90">{disputeResult.reasoning}</p>
                            </div>
                        )}
                        
                        {!activeLevel ? (
                            <div className="text-center p-8">
                                <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
                                <h2 className="text-xl font-bold text-emerald-400 mb-2">All Levels Completed!</h2>
                                <p className="text-slate-400">The syllabus has been fully executed.</p>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-xs uppercase tracking-wide text-indigo-400 font-bold mb-1">Current Focus</h3>
                                <h2 className="text-2xl font-bold text-white mb-6">Level {activeLevel.levelNumber}: {activeLevel.topicName}</h2>
                                
                                {/* STUDENT DYNAMIC STATE */}
                                {!isTeacher && (
                                    <div className="space-y-4">
                                        {activeLevel.status === 'Upcoming' && (
                                            <div className="bg-slate-900/50 border border-purple-500/30 p-6 rounded-xl flex flex-col items-center justify-center text-center">
                                                <Clock size={32} className="text-purple-400 mb-3" />
                                                <p className="text-purple-200 font-medium mb-2">This module unlocks at scheduled time</p>
                                                <div className="text-3xl font-mono text-white font-bold tracking-widest">{timeRemaining}</div>
                                                <button onClick={() => setShowRescheduleModal(true)} className="mt-6 w-full text-sm bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold py-2 px-4 rounded-xl transition-all hover:bg-amber-500/20">Emergency: Request Reschedule</button>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Active' && (
                                            <div className="bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-xl">
                                                <p className="text-slate-300 mb-6">You are actively working on this level. When you feel you have mastered the topic, request progression.</p>
                                                <button onClick={() => handleAction('request_next')} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)] active:scale-95">
                                                    I'm Ready for the Next Level
                                                </button>
                                                <button onClick={() => setShowRescheduleModal(true)} className="mt-4 w-full text-sm bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold py-2 px-4 rounded-xl transition-all hover:bg-amber-500/20">Emergency: Request Reschedule</button>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Requested Next Level' && (
                                            <div className="bg-slate-700/30 border border-slate-600 p-6 rounded-xl text-center">
                                                <div className="animate-pulse-navy w-12 h-12 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mx-auto mb-4" />
                                                <p className="text-slate-300 font-medium">Awaiting Teacher Review...</p>
                                                <p className="text-sm text-slate-500 mt-2">Your mentor must approve your progression or assign a challenge test.</p>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Reschedule Requested' && (
                                            <div className="bg-amber-500/10 border border-amber-500/50 p-6 rounded-xl text-center">
                                                <AlertTriangle size={32} className="text-amber-500 mx-auto mb-4 animate-pulse" />
                                                <h3 className="text-lg font-bold text-amber-400 mb-2">Emergency Reschedule Requested</h3>
                                                <p className="text-amber-100 text-sm mb-4">Your timeline has been frozen while we wait for your mentor to update your schedule.</p>
                                                <p className="text-amber-500/80 text-xs bg-slate-900/50 border border-amber-500/30 p-3 rounded-lg text-left"><strong>Reason:</strong> {activeLevel.emergencyReason}</p>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Challenge Assigned' && (
                                            <div className="bg-amber-500/10 border border-amber-500/50 p-6 rounded-xl">
                                                <h4 className="font-bold text-amber-400 flex items-center gap-2 mb-3">
                                                    <AlertTriangle size={18} /> Challenge Test Assigned
                                                </h4>
                                                <div className="bg-slate-900 p-4 rounded-lg text-slate-300 text-sm mb-4 border border-slate-700 border-l-4 border-l-amber-500">
                                                    {activeLevel.teacherChallengePrompt}
                                                </div>
                                                <textarea 
                                                    value={challengeSubmission}
                                                    onChange={e => setChallengeSubmission(e.target.value)}
                                                    placeholder="Type your answer or provide a link to your work..."
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-amber-500 h-24 mb-3"
                                                />
                                                <button disabled={!challengeSubmission.trim()} onClick={() => handleAction('submit_challenge', { submission: challengeSubmission })} className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2.5 px-4 rounded-xl transition-all">
                                                    Submit Answer
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TEACHER DYNAMIC STATE */}
                                {isTeacher && (
                                    <div className="space-y-4">
                                        {activeLevel.status === 'Upcoming' && (
                                            <div className="p-4 bg-slate-900/50 rounded-xl text-slate-400 text-sm flex items-center gap-2 border border-slate-700">
                                                <Clock size={16} /> Student is in waiting room. Unlocks automatically.
                                            </div>
                                        )}
                                        {activeLevel.status === 'Active' && (
                                            <div className="p-4 bg-slate-900/50 rounded-xl text-slate-400 text-sm border border-slate-700">
                                                Student is currently studying this module. Waiting for them to request the next level.
                                            </div>
                                        )}
                                        {activeLevel.status === 'Reschedule Requested' && (
                                            <div className="bg-amber-500/10 border border-amber-500/50 p-5 rounded-xl space-y-4">
                                                <h4 className="font-bold text-amber-400 flex items-center gap-2"><AlertTriangle size={18} /> Student Emergency Reschedule</h4>
                                                <div className="bg-slate-900 p-3 rounded text-sm text-slate-300 border border-slate-700">
                                                    <strong className="text-slate-500 block mb-1">Reason provided by student:</strong>
                                                    {activeLevel.emergencyReason || "No specific reason provided."}
                                                </div>
                                                <button onClick={openBulkScheduler} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.4)] active:scale-95 flex items-center justify-center gap-2">
                                                    <Clock size={18} /> Open Bulk Scheduler
                                                </button>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Requested Next Level' && (
                                            <div className="bg-indigo-500/10 border border-indigo-500/30 p-5 rounded-xl space-y-4">
                                                <p className="text-white font-medium">Student has requested to proceed to the next module.</p>
                                                {activeLevel.studentSubmission && (
                                                    <div className="bg-slate-900 p-3 rounded text-sm text-slate-300 border border-slate-700">
                                                        <strong className="text-slate-500 block mb-1">Student Answer:</strong>
                                                        {activeLevel.studentSubmission}
                                                    </div>
                                                )}
                                                <div className="flex gap-3">
                                                    <button onClick={() => handleAction('approve')} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-4 rounded-xl transition-all">
                                                        Approve Progression
                                                    </button>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-slate-700/50">
                                                    <h4 className="text-sm font-bold text-slate-400 mb-2">Or require a test before approving:</h4>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text" 
                                                            placeholder="Type a custom task..." 
                                                            value={testPrompt}
                                                            onChange={e => setTestPrompt(e.target.value)}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                                        />
                                                        <button disabled={!testPrompt.trim()} onClick={() => handleAction('assign_challenge', { prompt: testPrompt })} className="border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white disabled:opacity-50 font-bold py-2 px-4 rounded-lg transition-colors text-sm">
                                                            Conduct Test
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {activeLevel.status === 'Challenge Assigned' && (
                                            <div className="bg-slate-900/50 border border-amber-500/30 p-5 rounded-xl text-sm">
                                                <AlertTriangle size={16} className="text-amber-500 mb-2" />
                                                <p className="text-amber-100 mb-2">You assigned a challenge:</p>
                                                <div className="bg-slate-800 p-2 rounded text-slate-300 italic mb-2">"{activeLevel.teacherChallengePrompt}"</div>
                                                <p className="text-slate-400">Waiting for student to submit their answer...</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Chat Box below Action Panel */}
                    <div className="flex-1 bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/5 flex flex-col overflow-hidden min-h-0">
                        <div className="shrink-0 p-3 bg-slate-800 border-b border-slate-700 font-bold text-sm text-slate-300">Live Mentorship Chat</div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
                            {messages.length === 0 ? (
                                <div className="text-center text-slate-500 mt-10 text-sm">No messages yet. Say hello!</div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const isMe = msg.senderId === currentUser.id;
                                    return (
                                        <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                            <span className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{isMe ? 'You' : msg.senderName}</span>
                                            <div className={`max-w-[85%] px-4 py-2 text-sm ${isMe ? 'bg-indigo-500 text-white rounded-2xl rounded-tr-sm' : 'bg-slate-700 text-slate-100 rounded-2xl rounded-tl-sm'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        <form onSubmit={sendMessage} className="shrink-0 p-3 border-t border-slate-700 bg-slate-800 flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Message your mentor..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button type="submit" disabled={!newMessage.trim()} className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 text-white px-4 rounded-xl transition-colors">
                                <Send size={16} />
                            </button>
                        </form>
                    </div>

                </div>
            </div>

            {showReviewModal && <ReviewModal sessionId={sessionId} onClose={() => navigate('/dashboard')} />}
            
            {showRescheduleModal && (
                <div className="fixed inset-0 min-h-screen bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border-2 border-amber-500/50 rounded-2xl w-full max-w-md p-6 shadow-[0_0_50px_rgba(245,158,11,0.2)]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-amber-500/20 p-3 rounded-full text-amber-500"><AlertTriangle size={24}/></div>
                            <h2 className="text-xl font-bold text-white">Emergency Reschedule</h2>
                        </div>
                        <p className="text-slate-300 mb-4 text-sm">This will instantly pause any active countdown timers. Your mentor will receive an alert to modify the upcoming syllabus dates. Feel free to explain here or chat below.</p>
                        <textarea
                            value={emergencyReason}
                            onChange={(e) => setEmergencyReason(e.target.value)}
                            placeholder="Briefly describe the emergency..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-amber-500 h-24 mb-4"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowRescheduleModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-xl transition-all">Cancel</button>
                            <button disabled={!emergencyReason.trim()} onClick={handleRescheduleSubmit} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2 px-4 rounded-xl transition-all shadow-lg">Submit Request</button>
                        </div>
                    </div>
                </div>
            )}

            {showDisputeModal && (
                <div className="fixed inset-0 min-h-screen bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border-2 border-rose-500/50 rounded-2xl w-full max-w-md p-6 shadow-[0_0_50px_rgba(244,63,94,0.2)]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-rose-500/20 p-3 rounded-full text-rose-500"><AlertTriangle size={24}/></div>
                            <h2 className="text-xl font-bold text-white">Dispute Session</h2>
                        </div>
                        <p className="text-slate-300 mb-4 text-sm">Please explain why you are disputing this session. Our AI Dispute Resolution System will analyze your chat history and reason to determine who gets the credits.</p>
                        <textarea
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder="State your case..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-rose-500 h-24 mb-4"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowDisputeModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-xl transition-all">Cancel</button>
                            <button disabled={!disputeReason.trim()} onClick={handleDisputeSubmit} className="flex-1 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-black font-bold py-2 px-4 rounded-xl transition-all shadow-lg">Submit Dispute</button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkScheduler && (
                <div className="fixed inset-0 min-h-screen bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border-2 border-indigo-500/30 rounded-2xl w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1">Bulk Syllabus Scheduler</h2>
                                <p className="text-indigo-300 text-sm">Reschedule the student's remaining modules.</p>
                            </div>
                            <button onClick={() => setShowBulkScheduler(false)} className="text-slate-400 hover:text-white font-bold p-2 text-xl">&times;</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 mb-6 relative">
                            {bulkScheduleData.filter(l => l.status === 'Locked' || l.status === 'Upcoming' || l.status === 'Reschedule Requested').map((lvl) => (
                                <div key={lvl.levelNumber} className={`bg-slate-900/50 border ${lvl.status === 'Reschedule Requested' ? 'border-amber-500/50' : 'border-slate-700'} rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-slate-800 text-slate-300 text-xs font-bold px-2 py-0.5 rounded">Level {lvl.levelNumber}</span>
                                            {lvl.status === 'Reschedule Requested' && <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Emergency Request</span>}
                                        </div>
                                        <h4 className="text-white font-medium">{lvl.topicName}</h4>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex flex-col">
                                            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Date</label>
                                            <input 
                                                type="date"
                                                value={lvl.scheduledDate}
                                                onChange={(e) => {
                                                    const newArr = [...bulkScheduleData];
                                                    const tIdx = newArr.findIndex(x => x.levelNumber === lvl.levelNumber);
                                                    newArr[tIdx].scheduledDate = e.target.value;
                                                    setBulkScheduleData(newArr);
                                                }}
                                                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Time</label>
                                            <input 
                                                type="time"
                                                value={lvl.scheduledTime}
                                                onChange={(e) => {
                                                    const newArr = [...bulkScheduleData];
                                                    const tIdx = newArr.findIndex(x => x.levelNumber === lvl.levelNumber);
                                                    newArr[tIdx].scheduledTime = e.target.value;
                                                    setBulkScheduleData(newArr);
                                                }}
                                                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {bulkScheduleData.filter(l => l.status === 'Locked' || l.status === 'Upcoming' || l.status === 'Reschedule Requested').length === 0 && (
                                <div className="text-center p-8 text-slate-500">No levels eligible for scheduling.</div>
                            )}
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-white/10 shrink-0">
                            <button onClick={() => setShowBulkScheduler(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl transition-all">Cancel</button>
                            <button onClick={handleBulkScheduleSubmit} className="flex-[2] bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]">Save New Schedule</button>
                        </div>
                    </div>
                </div>
            )}

            {redirectCountdown !== null && disputeResult && (
                <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                    <div className="w-24 h-24 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mb-6 border-2 border-rose-500/50">
                        <AlertTriangle size={48} />
                    </div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-rose-400 to-indigo-400 bg-clip-text text-transparent mb-4">Dispute Resolved</h1>
                    
                    <div className="bg-slate-800 border border-slate-700 p-8 rounded-3xl max-w-2xl w-full mb-8 shadow-[0_0_50px_rgba(244,63,94,0.15)] mt-4">
                        <div className={`text-xl font-bold p-5 rounded-2xl mb-6 flex items-center justify-center gap-3 ${disputeResult.fault?.includes('winner:student') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : (disputeResult.fault?.includes('winner:split') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.2)]')}`}>
                            <CheckCircle size={24} />
                            {disputeResult.fault?.includes('winner:student') 
                                ? "Ruling: In favor of STUDENT (100% Refund)" 
                                : (disputeResult.fault?.includes('winner:split') 
                                    ? "Ruling: Split 50/50" 
                                    : "Ruling: In favor of TEACHER (100% Paid)")}
                        </div>
                        <div className="text-left bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
                            <strong className="block text-slate-400 text-xs tracking-[0.2em] uppercase mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> AI Evaluator Reasoning</strong>
                            <p className="text-slate-200 text-base leading-relaxed whitespace-pre-wrap">
                                {disputeResult.reasoning}
                            </p>
                        </div>
                    </div>

                    <div className="text-slate-400 animate-pulse text-sm font-bold flex items-center justify-center gap-3 bg-slate-800 py-3 px-6 rounded-full border border-slate-700">
                        <Clock size={16} className="text-indigo-400" /> Redirecting to Home in {redirectCountdown}s...
                    </div>
                </div>
            )}
        </div>
    );
}
