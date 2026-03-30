const express = require('express');
const router = express.Router();
const { messages, sessions } = require('../store');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE');

router.post('/generate-review', async (req, res) => {
    const { sessionId } = req.body;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionMessages = messages[sessionId] || [];
    
    if (sessionMessages.length === 0) {
        return res.json({ 
            suggestion: "Great session, learned a lot from this teacher!" 
        });
    }

    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            const mockSuggestion = `Based on context (${sessionMessages.length} messages analyzed), the teacher provided great support. "Very helpful and clear explanations!"`;
            return res.json({ suggestion: mockSuggestion });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chatContext = sessionMessages.map(m => `${m.role}: ${m.text}`).join('\n');
        const prompt = `Based on the following chat context between a student and a teacher, generate a short, positive, 1-2 sentence review from the perspective of the student about the teacher's help.\n\nContext:\n${chatContext}`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const suggestion = response.text();

        res.json({ suggestion });
    } catch (error) {
        console.error("AI Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate review' });
    }
});

router.post('/assistant', async (req, res) => {
    const { query } = req.body; 

    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            let reply = "I'm the Platform Assistant! (Plug in Gemini API to unlock my full potential!) ";
            if (query.toLowerCase().includes('credit')) {
                reply += "You earn default credits, and spend them to enroll!";
            } else if (query.toLowerCase().includes('skill')) {
                reply += "You can publish a skill using the publishing form on the Dashboard!";
            } else {
                reply += `I got your question: "${query}". How can I help?`;
            }
            return res.json({ reply });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `You are a helpful AI assistant for a Skill Exchange Platform.
Context rules:
- Users earn credits to spend on enrolling in skills (budget-friendly match).
- Users can publish a skill using the "Publish Skill" button on the Dashboard.
- Users can access the "My Learning" and "My Teaching" tabs to see their sessions.

Answer the user's question concisely and conversationally.
User Question: ${query}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        res.json({ reply: response.text() });
    } catch (error) {
        console.error("AI Chatbot Error:", error);
        res.status(500).json({ error: 'AI is unavailable' });
    }
});

module.exports = router;
