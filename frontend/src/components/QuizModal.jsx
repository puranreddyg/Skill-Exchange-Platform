import React, { useState } from 'react';
import { Award, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function QuizModal({ sessionDetails, currentUser, onClose, fetchLatestProfile }) {
    const [step, setStep] = useState('opt-in'); // 'opt-in', 'loading', 'quiz', 'result'
    const [quizData, setQuizData] = useState([]);
    const [userAnswers, setUserAnswers] = useState({});
    const [score, setScore] = useState(0);
    const [isMinting, setIsMinting] = useState(false);

    const handleOptIn = async () => {
        setStep('loading');
        try {
            const res = await fetch('/api/ai/generate-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topicName: sessionDetails.skillTitle })
            });
            if (res.ok) {
                const data = await res.json();
                setQuizData(data.quiz);
                setStep('quiz');
            } else {
                alert("Failed to generate quiz. Skipping to review.");
                onClose();
            }
        } catch (error) {
            console.error(error);
            alert("Error connecting to AI. Skipping to review.");
            onClose();
        }
    };

    const handleOptionSelect = (qIndex, option) => {
        setUserAnswers(prev => ({ ...prev, [qIndex]: option }));
    };

    const handleSubmitQuiz = async () => {
        let correctCount = 0;
        quizData.forEach((q, idx) => {
            if (userAnswers[idx] === q.correctAnswer) {
                correctCount++;
            }
        });
        
        const finalScore = (correctCount / quizData.length) * 100;
        setScore(finalScore);
        
        if (finalScore >= 75) {
            setStep('result');
            setIsMinting(true);
            try {
                const res = await fetch('/api/auth/mint-badge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, topic: sessionDetails.skillTitle })
                });
                if (res.ok) {
                    await fetchLatestProfile(); // refresh badges
                }
            } catch (e) {
                console.error("Minting failed", e);
            } finally {
                setIsMinting(false);
            }
        } else {
            setStep('result');
        }
    };

    return (
        <div className="fixed inset-0 min-h-screen bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            {step === 'opt-in' && (
                <div className="bg-slate-800 border-2 border-indigo-500/50 rounded-2xl w-full max-w-md p-8 shadow-[0_0_50px_rgba(99,102,241,0.2)] text-center animate-fade-in-up">
                    <div className="mx-auto w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 border-2 border-indigo-500">
                        <Award size={40} className="text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Congratulations!</h2>
                    <p className="text-slate-300 mb-6">You've finished <strong>{sessionDetails.skillTitle}</strong>. Want to take a quick AI-generated quiz to earn a Verified Badge for your profile?</p>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all">No thanks</button>
                        <button onClick={handleOptIn} className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)]">Let's do it!</button>
                    </div>
                </div>
            )}

            {step === 'loading' && (
                <div className="text-center animate-pulse">
                    <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-indigo-300 font-bold tracking-widest uppercase">Gemini is generating your test...</p>
                </div>
            )}

            {step === 'quiz' && (
                <div className="bg-slate-800 border-2 border-indigo-500/30 rounded-2xl w-full max-w-3xl p-8 shadow-2xl flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Final Assessment: {sessionDetails.skillTitle}</h2>
                        <span className="text-sm font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">{Object.keys(userAnswers).length} / {quizData.length} Answered</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                        {quizData.map((q, idx) => (
                            <div key={idx} className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-lg font-bold text-white mb-4"><span className="text-indigo-400 mr-2">Q{idx + 1}.</span>{q.question}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {q.options.map((opt, oIdx) => (
                                        <button 
                                            key={oIdx}
                                            onClick={() => handleOptionSelect(idx, opt)}
                                            className={`p-3 rounded-lg text-left text-sm font-medium transition-all border ${userAnswers[idx] === opt ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-indigo-400 hover:bg-slate-700'}`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="pt-6 mt-2 border-t border-slate-700 shrink-0">
                        <button 
                            disabled={Object.keys(userAnswers).length < quizData.length}
                            onClick={handleSubmitQuiz} 
                            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 disabled:grayscale text-white font-bold py-4 rounded-xl transition-all shadow-lg text-lg"
                        >
                            Submit Answers
                        </button>
                    </div>
                </div>
            )}

            {step === 'result' && (
                <div className="bg-slate-800 rounded-2xl w-full max-w-md p-8 text-center relative overflow-hidden shadow-2xl animate-fade-in-up border-2 border-slate-700">
                    {score >= 75 ? (
                        <>
                            {/* Premium Fancy Badge UI */}
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-emerald-500/10 z-0"></div>
                            <div className="relative z-10">
                                <h2 className="text-3xl font-bold text-white mb-2">You Passed!</h2>
                                <p className="text-emerald-400 font-bold mb-8 text-lg">Score: {score}%</p>
                                
                                <div className="group perspective-1000 mx-auto w-48 h-48 mb-8">
                                    <div className="relative w-full h-full transition-transform duration-500 transform-style-3d group-hover:rotate-y-180 drop-shadow-[0_0_30px_rgba(99,102,241,0.6)]">
                                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 rounded-full p-1 shadow-2xl">
                                            <div className="absolute inset-0 bg-white/20 rounded-full blur-md"></div>
                                            <div className="w-full h-full bg-slate-900 rounded-full flex flex-col items-center justify-center relative overflow-hidden border-4 border-black/50">
                                                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent"></div>
                                                <Award size={64} className="text-yellow-400 mb-2 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                                                <span className="text-xs font-bold text-white uppercase tracking-widest opacity-80">Verified</span>
                                                <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 text-center px-2">{sessionDetails.skillTitle}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <p className="text-slate-300 mb-6 text-sm">
                                    {isMinting ? "Minting your fancy badge..." : "This badge has been added to your profile!"}
                                </p>
                                <button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg">Continue to Review</button>
                            </div>
                        </>
                    ) : (
                        <div className="relative z-10">
                            <div className="mx-auto w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-6">
                                <AlertTriangle size={40} className="text-amber-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Good Try!</h2>
                            <p className="text-amber-400 font-bold mb-4 text-lg">Score: {score}%</p>
                            <p className="text-slate-300 mb-6">You need at least 75% to earn the badge. Keep learning and try another quiz on your next course!</p>
                            <button onClick={onClose} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg">Continue to Review</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
