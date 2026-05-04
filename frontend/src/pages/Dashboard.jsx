import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { BookOpen, PlusCircle, LogOut, Award, User, Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export default function Dashboard() {
    const { currentUser, logout, updateCredits, fetchLatestProfile } = useAuth();
    const socket = useSocket();
    const navigate = useNavigate();

    const [skills, setSkills] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [historySessions, setHistorySessions] = useState([]);
    const [showPublishForm, setShowPublishForm] = useState(false);
    const [newSkill, setNewSkill] = useState({ title: '', category: '', description: '', level: 'Beginner', totalDays: 1, syllabus: [] });
    const [maxCredits, setMaxCredits] = useState(5);
    const [searchQuery, setSearchQuery] = useState('');
    const [dualMatchResults, setDualMatchResults] = useState(null);
    const [toast, setToast] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [mySkills, setMySkills] = useState([]);
    const [activeTab, setActiveTab] = useState('explore'); // 'explore' or 'teaching'
    const [expandedSkills, setExpandedSkills] = useState({});

    useEffect(() => {
        if (!currentUser) {
            navigate('/');
            return;
        }

        fetch(`/api/skills?userId=${currentUser.id}`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setSkills(data); });

        fetch(`/api/skills/my-skills/${currentUser.id}`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setMySkills(data); });

        fetch(`/api/skills/sessions/active/${currentUser.id}`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setActiveSessions(data); });

        fetch(`/api/skills/sessions/history/${currentUser.id}`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setHistorySessions(data); });

        if (socket) {
            socket.emit('join_dashboard');
            socket.emit('join_user_room', currentUser.id);

            const handleNewSkill = (skill) => {
                if (skill.teacherId === currentUser.id) {
                    setMySkills(prev => [skill, ...prev]);
                } else {
                    setSkills(prev => [skill, ...prev]);
                }
            };

            const handleNewEnrollment = (session) => {
                const learnerName = session.learnerName || 'A student';
                setToast({
                    title: 'New Enrollment!',
                    message: `${learnerName} just enrolled in your skill "${session.skillTitle}"! Click here to start the session.`,
                    sessionId: session.id
                });
                setTimeout(() => setToast(null), 5000);
                setActiveSessions(prev => [...prev, session]);
            };

            const handleNewChatMessage = (data) => {
                setToast({
                    title: `New Message from ${data.senderName}`,
                    message: data.text,
                    sessionId: data.sessionId
                });
                setTimeout(() => setToast(null), 5000);
            };

            const handleSkillUnavailable = (skillId) => {
                setSkills(prev => prev.filter(s => s.id !== skillId));
                setDualMatchResults(prev => {
                    if (!prev) return prev;
                    if (prev.premiumMatch?.id === skillId || prev.valueMatch?.id === skillId) return null;
                    return prev;
                });
            };

            const handleGlobalSessionCompleted = (completedSession) => {
                if (completedSession.teacherId === currentUser.id || completedSession.learnerId === currentUser.id) {
                    setActiveSessions(prev => prev.filter(s => s.id !== completedSession.id));
                    setHistorySessions(prev => {
                        if (prev.find(s => s.id === completedSession.id)) return prev;
                        return [completedSession, ...prev];
                    });
                    fetchLatestProfile();
                }
            };

            socket.on('new_skill', handleNewSkill);
            socket.on('new_enrollment', handleNewEnrollment);
            socket.on('new_chat_message', handleNewChatMessage);
            socket.on('skill_unavailable', handleSkillUnavailable);
            socket.on('global_session_completed', handleGlobalSessionCompleted);

            return () => {
                socket.off('new_skill', handleNewSkill);
                socket.off('new_enrollment', handleNewEnrollment);
                socket.off('new_chat_message', handleNewChatMessage);
                socket.off('skill_unavailable', handleSkillUnavailable);
                socket.off('global_session_completed', handleGlobalSessionCompleted);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, socket, navigate]);

    // PUBLISH SKILL LOGIC
    // EXPLANATION: This function processes the teacher's new course syllabus. It validates the 
    // scheduled dates to ensure they fit within the stated course duration. Once validated, 
    // it saves the course to the database and broadcasts the new skill in real-time via WebSockets.
    const handlePublish = async (e) => {
        e.preventDefault();

        if (newSkill.syllabus.length > 0) {
            const validDates = newSkill.syllabus.map(l => l.scheduledDate).filter(Boolean).sort();
            if (validDates.length > 0) {
                const startD = new Date(validDates[0]);
                const maxPicked = validDates[validDates.length - 1];
                const maxD = new Date(startD);
                maxD.setDate(maxD.getDate() + (newSkill.totalDays > 0 ? newSkill.totalDays - 1 : 0));
                if (new Date(maxPicked) > maxD) {
                    alert(`Dates in syllabus must fall within the ${newSkill.totalDays}-day duration from your earliest scheduled date.`);
                    return;
                }
            }
        }

        const skillData = { ...newSkill, teacherId: currentUser.id, teacherName: currentUser.name };

        const res = await fetch('/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(skillData)
        });

        if (res.ok) {
            const publishedSkill = await res.json();
            socket.emit('publish_skill', publishedSkill);
            setShowPublishForm(false);
            setNewSkill({ title: '', category: '', description: '', level: 'Beginner', totalDays: 1, syllabus: [] });
        }
    };

    const handleEnroll = async (skillId) => {
        if (currentUser.credits < 1) {
            alert("Not enough credits!");
            return;
        }

        const res = await fetch(`/api/skills/${skillId}/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ learnerId: currentUser.id })
        });

        if (res.ok) {
            const newSession = await res.json();
            updateCredits(currentUser.credits - 1);
            navigate(`/session/${newSession.id}`);
        } else {
            const err = await res.json();
            alert(err.error);
        }
    };

    // DUAL-MATCH SEARCH ENGINE UI LOGIC
    // EXPLANATION: This function triggers when the user clicks the "Find Mentors" button.
    // It captures the user's search query and their budget constraint (from the slider) and sends them to the backend.
    // Rather than returning a massive list of profiles, it expects a curated response of exactly two cards:
    // a "Premium Match" (highest quality) and a "Top Value Choice" (best ratio of quality-to-cost).
    const handleFindTutors = async () => {
        if (!searchQuery) return;
        const res = await fetch(`/api/skills/dual-match?query=${encodeURIComponent(searchQuery)}&maxCredits=${maxCredits}&userId=${currentUser.id}`);
        const data = await res.json();
        setDualMatchResults(data);
    };

    if (!currentUser) return null;

    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const validSyllabusDates = newSkill.syllabus.map(l => l.scheduledDate).filter(Boolean).sort();
    const startTimelineDateStr = validSyllabusDates.length > 0 ? validSyllabusDates[0] : null;
    let maxDateStr = undefined;
    if (startTimelineDateStr) {
        const d = new Date(startTimelineDateStr);
        d.setDate(d.getDate() + (newSkill.totalDays > 0 ? newSkill.totalDays - 1 : 0));
        maxDateStr = d.toISOString().split('T')[0];
    }

    return (
        <div className="min-h-screen p-8 max-w-7xl mx-auto relative">
            {toast && (
                <div
                    onClick={() => navigate(`/session/${toast.sessionId}`)}
                    className="fixed bottom-4 right-4 z-50 cursor-pointer bg-slate-800 text-white p-4 rounded-xl shadow-2xl border-l-4 border-indigo-500 animate-bounce flex flex-col gap-1 w-80"
                >
                    <div className="font-bold flex items-center gap-2"><Award size={18} className="text-indigo-400" /> {toast.title || 'Notification'}</div>
                    <div className="text-sm text-slate-300">{toast.message}</div>
                </div>
            )}
            <header className="flex justify-between items-center mb-12 glass p-4 rounded-2xl animate-fade-in-up">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 animate-float-slow">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Dashboard</h1>
                        <p className="text-slate-400 text-sm">Welcome back, {currentUser.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
                        <Award className="text-yellow-400" size={20} />
                        <span className="font-bold font-mono text-lg">{currentUser.credits}</span>
                        <span className="text-slate-400 text-sm">Credits</span>
                    </div>
                    <button onClick={() => { logout(); navigate('/'); }} className="text-slate-400 hover:text-white transition-colors">
                        <LogOut size={24} />
                    </button>
                </div>
            </header>

            {/* =========================================================================
                DASHBOARD LAYOUT & NAVIGATION
                =========================================================================
                EXPLANATION: This section defines the main grid layout of the dashboard.
                The tabs ('Explore Skills', 'My Teaching', etc.) act as a state-driven router.
                Clicking a tab updates the 'activeTab' state, which instantly swaps the rendered 
                components below without reloading the page. The 'Publish Skill' button toggles
                the visibility of the course creation form. 
            */}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6 animate-fade-in-up delay-100">
                    <div className="flex justify-between items-center">
                        <div className="flex bg-slate-800/50 p-1 rounded-xl">
                            <button onClick={() => setActiveTab('explore')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'explore' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Explore Skills</button>
                            <button onClick={() => setActiveTab('teaching')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'teaching' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>My Teaching</button>
                            <button onClick={() => setActiveTab('learning')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'learning' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>My Learning</button>
                            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'history' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>History</button>
                            <button onClick={() => setActiveTab('badges')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'badges' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>My Badges</button>
                        </div>
                        <button onClick={() => setShowPublishForm(!showPublishForm)} className="group bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-indigo-500/50">
                            <PlusCircle size={18} className="group-hover:rotate-90 transition-transform duration-300" /> Publish Skill
                        </button>
                    </div>

                    {activeTab === 'explore' ? (
                        <>
                            <div className="glass p-5 rounded-2xl my-6 border border-indigo-500/20 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300">
                                <h3 className="text-lg font-bold mb-4">Dual-Match Search Flow</h3>
                                <div className="flex flex-col md:flex-row gap-4 mb-4">
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-slate-300 block mb-2">Skill Search Bar</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Design, Web Dev, Java..."
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-white"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-slate-300 flex justify-between mb-2">
                                            <span>Budget Filter</span>
                                            <span className="text-indigo-400 font-bold">Max Budget: {maxCredits === 10 ? '10+' : maxCredits} Credits/hr</span>
                                        </label>
                                        <input
                                            type="range" min="1" max="10" value={maxCredits}
                                            onChange={(e) => {
                                                setMaxCredits(parseInt(e.target.value));
                                                setDualMatchResults(null);
                                            }}
                                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-2"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleFindTutors}
                                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 shadow-lg hover:shadow-indigo-500/40 hover:-translate-y-1 active:scale-95 transition-all duration-300"
                                >
                                    Find Tutors
                                </button>
                            </div>

                            {dualMatchResults && (
                                <div className="mb-8">
                                    <h3 className="text-xl font-bold mb-4">Match Results</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {dualMatchResults.premiumMatch ? (
                                            <div className="glass p-6 rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/10 to-transparent relative hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(234,179,8,0.3)] transition-all duration-300 cursor-default">
                                                <div className="absolute -top-3 left-6 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Premium Match - Highest Rated</div>
                                                <h3 className="text-xl font-bold mt-2 text-yellow-400">{dualMatchResults.premiumMatch.title}</h3>
                                                <p className="text-sm text-slate-300 mb-4">{dualMatchResults.premiumMatch.category}</p>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-400">Taught by {dualMatchResults.premiumMatch.teacherName}</span>
                                                    <span className="font-bold text-yellow-400">{dualMatchResults.premiumMatch.creditsPerHour || 1} Credits/hr</span>
                                                </div>
                                                <button onClick={() => handleEnroll(dualMatchResults.premiumMatch.id)} className="w-full mt-4 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 border border-yellow-500/50 py-2 rounded-lg transition-colors font-medium">Enroll Now</button>
                                            </div>
                                        ) : (
                                            <div className="glass p-6 rounded-2xl border border-slate-700 flex items-center justify-center text-slate-500">No Premium Match found.</div>
                                        )}

                                        {dualMatchResults.valueMatch ? (
                                            <div className="glass p-6 rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-transparent relative hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all duration-300 cursor-default">
                                                <div className="absolute -top-3 left-6 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Top Value Choice - Best Bang for your Credits</div>
                                                <h3 className="text-xl font-bold mt-2 text-emerald-400">{dualMatchResults.valueMatch.title}</h3>
                                                <p className="text-sm text-slate-300 mb-4">{dualMatchResults.valueMatch.category}</p>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-400">Taught by {dualMatchResults.valueMatch.teacherName}</span>
                                                    <span className="font-bold text-emerald-400">{dualMatchResults.valueMatch.creditsPerHour || 1} Credits/hr</span>
                                                </div>
                                                <button onClick={() => handleEnroll(dualMatchResults.valueMatch.id)} className="w-full mt-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/50 py-2 rounded-lg transition-colors font-medium">Enroll Now</button>
                                            </div>
                                        ) : (
                                            <div className="glass p-6 rounded-2xl border border-slate-700 flex items-center justify-center text-slate-500">No Top Value Choice found.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {showPublishForm && (
                                <form onSubmit={handlePublish} className="glass p-6 rounded-2xl space-y-4 shadow-xl border border-indigo-500/30">
                                    <h3 className="font-bold text-lg">Publish a Skill to Teach</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input type="text" placeholder="Skill Title" required className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={newSkill.title} onChange={e => setNewSkill({ ...newSkill, title: e.target.value })} />
                                        <input type="text" placeholder="Category (e.g. Design)" required className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={newSkill.category} onChange={e => setNewSkill({ ...newSkill, category: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={newSkill.level} onChange={e => setNewSkill({ ...newSkill, level: e.target.value })}>
                                            <option value="Beginner">Beginner (1 Credit)</option>
                                            <option value="Intermediate">Intermediate (3 Credits)</option>
                                            <option value="Advanced">Advanced (5 Credits)</option>
                                        </select>
                                        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3">
                                            <label className="text-sm font-medium text-slate-300 whitespace-nowrap">Total Days:</label>
                                            <input type="number" min="1" required className="bg-transparent outline-none text-white w-full py-2" value={newSkill.totalDays} onChange={e => setNewSkill({ ...newSkill, totalDays: parseInt(e.target.value) || 1 })} />
                                        </div>
                                    </div>
                                    <textarea placeholder="Description" required className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none w-full h-24" value={newSkill.description} onChange={e => setNewSkill({ ...newSkill, description: e.target.value })}></textarea>

                                    {/* Syllabus Section */}
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/20 space-y-3">
                                        <h4 className="font-bold flex justify-between items-center text-sm">
                                            Course Syllabus
                                            <button
                                                type="button"
                                                onClick={() => setNewSkill({ ...newSkill, syllabus: [...newSkill.syllabus, { levelNumber: newSkill.syllabus.length + 1, topicName: '', scheduledDate: '', scheduledTime: '' }] })}
                                                className="text-xs bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 px-2 py-1 rounded-md transition-colors"
                                            >
                                                + Add Level
                                            </button>
                                        </h4>
                                        {newSkill.syllabus.map((level, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                                                <div className="col-span-2 sm:col-span-1 flex items-center justify-center font-bold text-slate-400 bg-slate-800 rounded">{level.levelNumber}</div>
                                                <input type="text" placeholder="Topic Name" required className="col-span-10 sm:col-span-5 bg-slate-800 text-sm border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500" value={level.topicName} onChange={e => { const s = [...newSkill.syllabus]; s[idx].topicName = e.target.value; setNewSkill({ ...newSkill, syllabus: s }); }} />
                                                <input type="date" required min={todayStr} max={maxDateStr} className="col-span-6 sm:col-span-3 bg-slate-800 text-sm border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500" value={level.scheduledDate} onChange={e => { const s = [...newSkill.syllabus]; s[idx].scheduledDate = e.target.value; setNewSkill({ ...newSkill, syllabus: s }); }} />
                                                <input type="time" required className="col-span-4 sm:col-span-2 bg-slate-800 text-sm border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500" value={level.scheduledTime} onChange={e => { const s = [...newSkill.syllabus]; s[idx].scheduledTime = e.target.value; setNewSkill({ ...newSkill, syllabus: s }); }} />
                                                <button type="button" onClick={() => { const s = newSkill.syllabus.filter((_, i) => i !== idx).map((l, i) => ({ ...l, levelNumber: i + 1 })); setNewSkill({ ...newSkill, syllabus: s }); }} className="col-span-2 sm:col-span-1 text-red-400 hover:text-red-300 font-bold">X</button>
                                            </div>
                                        ))}
                                    </div>

                                    <button type="submit" className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-medium py-2 rounded-lg transition-colors">Publish to Feed</button>
                                </form>
                            )}

                            <div className="space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {(() => {
                                    const filteredSkills = skills.filter(s => (s.creditsPerHour || 1) <= maxCredits).sort((a, b) => (b.topValueChoice === a.topValueChoice ? 0 : b.topValueChoice ? 1 : -1));
                                    if (filteredSkills.length === 0) return (
                                        <div className="text-center p-12 glass rounded-2xl border-dashed border-slate-600 border-2">
                                            <p className="text-slate-400">No skills found within this budget. Try increasing max credits!</p>
                                        </div>
                                    );
                                    return filteredSkills.map(skill => {
                                        const skillCost = skill.creditsPerHour || 1;
                                        const dynamicScore = skill.matchScore || 0;
                                        const tierStr = skill.tier || (skillCost >= 5 ? 'Tier A' : (skillCost >= 2 ? 'Tier B' : 'Tier C'));
                                        const tierColor = tierStr.includes('Tier A') ? 'bg-red-500/20 text-red-400' : tierStr.includes('Tier B') ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400';
                                        return (
                                            <div key={skill.id} className="glass p-6 rounded-2xl hover:border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] hover:-translate-y-1 transition-all duration-300 group">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-bold px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-md uppercase tracking-wider">{skill.category}</span>
                                                            <span className="text-xs font-bold px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md uppercase tracking-wider">{skill.level}</span>
                                                            <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${tierColor}`}>{tierStr}</span>
                                                            {skill.topValueChoice && <span className="text-xs font-bold px-2 py-1 bg-yellow-500/20 text-yellow-500 rounded-md uppercase tracking-wider border border-yellow-500/30 flex items-center gap-1">✦ Top Value Choice</span>}
                                                        </div>
                                                        <h3 className="text-xl font-bold group-hover:text-indigo-300 transition-colors">{skill.title}</h3>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-bold text-indigo-400 mb-1">{skill.creditsPerHour || 1} <span className="text-xs text-slate-500 block font-normal">Credits/hr</span></div>
                                                        <div className="text-sm font-medium text-emerald-400 mb-2">{skill.totalDays || 1} <span className="text-xs text-slate-500 block font-normal">Days</span></div>
                                                        {skill.teacherId !== currentUser.id ? (
                                                            <button onClick={() => handleEnroll(skill.id)} className="bg-slate-800 hover:bg-indigo-500 text-white border border-slate-700 hover:border-indigo-500 px-4 py-2 rounded-lg text-sm font-medium transition-all">
                                                                Enroll
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">Your Skill</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-slate-300 text-sm mb-4 leading-relaxed">{skill.description}</p>

                                                {skill.syllabus && skill.syllabus.length > 0 && (
                                                    <div className="mb-4">
                                                        <button onClick={() => setExpandedSkills(prev => ({ ...prev, [skill.id]: !prev[skill.id] }))} className="flex items-center justify-between w-full bg-slate-800/80 hover:bg-slate-700/80 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-slate-700 text-slate-300">
                                                            <span>Course Syllabus ({skill.syllabus.length} Levels)</span>
                                                            {expandedSkills[skill.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </button>
                                                        {expandedSkills[skill.id] && (
                                                            <div className="mt-2 space-y-2 animate-fade-in-up origin-top">
                                                                {skill.syllabus.map((lvl, i) => (
                                                                    <div key={i} className="flex flex-col bg-slate-900/50 p-3 rounded-lg border border-indigo-500/10 hover:border-indigo-500/30 transition-colors">
                                                                        <div className="flex justify-between items-center mb-1">
                                                                            <span className="font-bold text-sm text-indigo-300">Level {lvl.levelNumber}: {lvl.topicName}</span>
                                                                        </div>
                                                                        <div className="flex gap-4 text-xs text-slate-400">
                                                                            <span className="flex items-center gap-1"><Calendar size={12} />{lvl.scheduledDate}</span>
                                                                            <span className="flex items-center gap-1"><Clock size={12} />{lvl.scheduledTime}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center text-sm text-slate-400 border-t border-slate-700/50 pt-4 mt-2">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2"><User size={16} /><span>Taught by <strong className="text-white">{skill.teacherName}</strong></span></div>
                                                        {skill.teacherBadges && skill.teacherBadges.length > 0 && (
                                                            <div className="flex gap-1 mt-1">
                                                                {skill.teacherBadges.slice(0, 3).map((b, idx) => (
                                                                    <div key={idx} className="flex items-center gap-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-full text-[10px] text-indigo-300 font-bold uppercase tracking-wider">
                                                                        <Award size={10} className="text-yellow-400" /> {b.topic}
                                                                    </div>
                                                                ))}
                                                                {skill.teacherBadges.length > 3 && <span className="text-[10px] text-slate-500">+{skill.teacherBadges.length - 3}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">✨ Match Score: {dynamicScore}%</div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </>
                    ) : activeTab === 'teaching' ? (
                        <div className="space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {(() => {
                                const teachingSessions = activeSessions.filter(s => s.teacherId === currentUser.id);
                                if (teachingSessions.length === 0) return (
                                    <div className="text-center p-12 glass rounded-2xl border-dashed border-slate-600 border-2">
                                        <p className="text-slate-400">You don't have any active students right now.</p>
                                    </div>
                                );

                                // Sort so that actionable sessions are at the top
                                teachingSessions.sort((a, b) => {
                                    const aLvl = a.syllabus?.[a.currentLevel - 1];
                                    const bLvl = b.syllabus?.[b.currentLevel - 1];
                                    const aActionable = (aLvl?.status === 'Requested Next Level' || aLvl?.status === 'Reschedule Requested') ? 1 : 0;
                                    const bActionable = (bLvl?.status === 'Requested Next Level' || bLvl?.status === 'Reschedule Requested') ? 1 : 0;
                                    return bActionable - aActionable;
                                });

                                return teachingSessions.map(session => {
                                    const activeLevel = session.syllabus?.[session.currentLevel - 1];
                                    const isActionable = activeLevel?.status === 'Requested Next Level' || activeLevel?.status === 'Reschedule Requested';
                                    const isEmergency = activeLevel?.status === 'Reschedule Requested';
                                    const isWaiting = activeLevel?.status === 'Challenge Assigned';
                                    const isStudying = activeLevel?.status === 'Active' || activeLevel?.status === 'Upcoming';

                                    return (
                                        <div key={session.id} className={`p-6 rounded-2xl border-2 flex flex-col md:flex-row justify-between items-center group transition-all duration-300 ${isActionable ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-slate-800/80 border-slate-700'}`}>
                                            <div className="flex-1 w-full relative">
                                                {isActionable && <div className="absolute -top-3 -left-2 flex items-center gap-1 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-pulse"><Award size={12} /> {isEmergency ? 'EMERGENCY' : 'ACTION REQUIRED'}</div>}
                                                <div className="flex items-center gap-2 mb-2 mt-2">
                                                    <span className="text-xs font-bold px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-md uppercase tracking-wider">{session.skillTitle}</span>
                                                    <span className="text-xs text-slate-400 bg-slate-900 border border-slate-700 px-2 py-1 rounded-md">Lvl {session.currentLevel} / {session.syllabus?.length}</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-white mb-1">Student: {session.learnerName}</h3>
                                                <p className={`text-sm font-medium ${isActionable ? 'text-amber-400' : isWaiting ? 'text-purple-400' : 'text-slate-400'}`}>
                                                    {isEmergency && 'Student requested an emergency reschedule!'}
                                                    {!isEmergency && isActionable && 'Student requested progression or submitted challenge!'}
                                                    {isWaiting && 'Awaiting student to complete your custom challenge...'}
                                                    {isStudying && 'Student is currently studying the module.'}
                                                </p>
                                            </div>
                                            <div className="mt-4 md:mt-0 ml-4 shrink-0">
                                                <button onClick={() => navigate(`/session/${session.id}`)} className={`px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 ${isActionable ? 'bg-amber-500 hover:bg-amber-400 text-black hover:-translate-y-1' : 'bg-indigo-500 hover:bg-indigo-400 text-white'}`}>
                                                    {isActionable ? 'Review Student' : 'Open Workspace'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : activeTab === 'learning' ? (
                        <div className="space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {(() => {
                                const learningSessions = activeSessions.filter(s => s.learnerId === currentUser.id);
                                if (learningSessions.length === 0) return (
                                    <div className="text-center p-12 glass rounded-2xl border-dashed border-slate-600 border-2">
                                        <p className="text-slate-400">You aren't enrolled in any active skills yet. Explore the feed to find a tutor!</p>
                                    </div>
                                );
                                return learningSessions.map(session => (
                                    <div key={session.id} className="glass p-6 rounded-2xl border border-slate-700 flex justify-between items-center group">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${session.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>{session.status === 'active' ? 'ACTIVE' : 'DISPUTED'}</span>
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-2">{session.skillTitle}</h3>
                                            <p className="text-sm text-slate-400 mb-2">Taught by {session.teacherName}</p>
                                        </div>
                                        <button onClick={() => navigate(`/session/${session.id}`)} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/25">
                                            Open Chat
                                        </button>
                                    </div>
                                ));
                            })()}
                        </div>
                    ) : activeTab === 'history' ? (
                        <div className="space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {historySessions.length === 0 ? (
                                <div className="text-center p-12 glass rounded-2xl border-dashed border-slate-600 border-2">
                                    <p className="text-slate-400">You don't have any completed sessions yet.</p>
                                </div>
                            ) : (
                                historySessions.map(session => (
                                    <div key={session.id} className="glass p-6 rounded-2xl border border-slate-700 flex justify-between items-center group bg-slate-800/30">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold px-2 py-1 bg-slate-700 text-slate-300 rounded-md uppercase tracking-wider">COMPLETED</span>
                                                <span className="text-xs font-medium text-slate-400 border border-slate-600 px-2 py-1 rounded-md">{session.teacherId === currentUser.id ? 'You Taught' : 'You Learned'}</span>
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-300 mb-2">{session.skillTitle}</h3>
                                        </div>
                                        <button onClick={() => navigate(`/session/${session.id}`)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 border border-slate-600">
                                            View Chat
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : activeTab === 'badges' ? (
                        <div className="space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {(!currentUser.badges || currentUser.badges.length === 0) ? (
                                <div className="text-center p-12 glass rounded-2xl border-dashed border-slate-600 border-2">
                                    <Award size={48} className="text-slate-600 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-slate-300 mb-2">No Badges Yet</h3>
                                    <p className="text-slate-400">Complete a course and pass the AI quiz to earn your first verified badge!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    {currentUser.badges.map((badge, idx) => (
                                        <div key={idx} className="group perspective-1000 w-full aspect-square">
                                            <div className="relative w-full h-full transition-transform duration-500 transform-style-3d group-hover:rotate-y-180 drop-shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 rounded-2xl p-1 shadow-2xl">
                                                    <div className="absolute inset-0 bg-white/20 rounded-2xl blur-sm"></div>
                                                    <div className="w-full h-full bg-slate-900 rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden border-2 border-black/50">
                                                        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent"></div>
                                                        <Award size={40} className="text-yellow-400 mb-2 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]" />
                                                        <span className="text-[10px] font-bold text-white uppercase tracking-widest opacity-80">Verified</span>
                                                        <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 text-center px-2 mt-1">{badge.topic}</span>
                                                        <span className="text-[9px] text-slate-500 absolute bottom-3">{new Date(badge.earnedAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="space-y-6 animate-fade-in-up delay-300">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Award size={20} className="text-green-400 animate-float-slow" /> My Sessions</h2>
                    <div className="space-y-3">
                        {activeSessions.length === 0 ? (
                            <div className="text-sm p-4 glass rounded-xl text-center text-slate-400">No active sessions.</div>
                        ) : (
                            activeSessions.map(session => (
                                <div key={session.id} className="glass p-4 rounded-xl border border-slate-700 flex flex-col">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-bold truncate pr-2">{session.skillTitle}</h4>
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${session.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                            {session.status === 'active' ? 'ACTIVE' : 'DISPUTED'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mb-3">
                                        {session.teacherId === currentUser.id ? 'Teaching' : 'Learning'}
                                    </p>
                                    <button onClick={() => navigate(`/session/${session.id}`)} className="w-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                        Chat
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
