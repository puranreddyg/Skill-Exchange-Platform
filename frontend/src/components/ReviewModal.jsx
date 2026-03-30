import React, { useState, useEffect } from 'react';
import { Sparkles, X, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ReviewModal({ sessionId, onClose }) {
    const { currentUser } = useAuth();
    const [rating, setRating] = useState(5);
    // eslint-disable-next-line no-unused-vars
    const [suggestion, setSuggestion] = useState('');
    const [loading, setLoading] = useState(true);
    const [review, setReview] = useState('');
    
    useEffect(() => {
        const fetchAISuggestion = async () => {
            try {
                const res = await fetch('/api/ai/generate-review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                const data = await res.json();
                setSuggestion(data.suggestion);
                setReview(data.suggestion);
            } catch (err) {
                console.error(err);
                setSuggestion('Great class!');
            } finally {
                setLoading(false);
            }
        };
        fetchAISuggestion();
    }, [sessionId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await fetch(`/api/skills/sessions/${sessionId}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    learnerId: currentUser.id,
                    rating,
                    text: review
                })
            });
            alert("Review submitted successfully!");
            onClose();
        } catch (err) {
            console.error(err);
            alert("Failed to submit review.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-2xl w-full max-w-lg border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={20}/></button>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                        Session Completed!
                    </h2>
                    <p className="text-white/80 text-sm">Leave a review for your class.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2">Rate your Teacher</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    className={`transition-colors ${rating >= star ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400/50'}`}
                                >
                                    <Star size={28} fill={rating >= star ? 'currentColor' : 'none'} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={16} className="text-indigo-400" />
                            <label className="text-sm font-medium text-slate-300">AI Suggested Review (Based on chat history)</label>
                        </div>
                        {loading ? (
                            <div className="h-24 bg-slate-700/50 animate-pulse rounded-lg border border-slate-600 flex items-center justify-center text-slate-400 text-sm">
                                Analyzing chat history with Gemini...
                            </div>
                        ) : (
                            <textarea 
                                className="w-full h-24 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={review}
                                onChange={(e) => setReview(e.target.value)}
                            />
                        )}
                        <p className="text-xs text-slate-500 mt-2">Feel free to edit the AI's suggestion before submitting.</p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors">Skip</button>
                        <button type="submit" disabled={loading} className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20">Submit Review</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
