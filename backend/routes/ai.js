const express = require('express');
const router = express.Router();
const db = require('../db');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE');

router.post('/generate-review', async (req, res) => {
    const { sessionId } = req.body;

    try {
        const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        const session = sessionRows[0];
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const { rows: messageRows } = await db.query('SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC', [sessionId]);
        const sessionMessages = messageRows.map(m => ({ role: m.sender_id === session.teacher_id ? 'Teacher' : 'Student', text: m.text }));
        
        if (sessionMessages.length === 0) {
            return res.json({ 
                suggestion: "Great session, learned a lot from this teacher!" 
            });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            const mockSuggestion = `Based on context (${sessionMessages.length} messages analyzed), the teacher provided great support. "Very helpful and clear explanations!"`;
            return res.json({ suggestion: mockSuggestion });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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



router.post('/generate-quiz', async (req, res) => {
    const { topicName } = req.body;
    
    if (!topicName) {
        return res.status(400).json({ error: 'Topic name is required' });
    }

    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            // Mock response if no API key
            const mockQuiz = [
                { question: `What is a core concept of ${topicName}?`, options: ["Concept A", "Concept B", "Concept C", "Concept D"], correctAnswer: "Concept A" },
                { question: `Why is ${topicName} important?`, options: ["Reason 1", "Reason 2", "Reason 3", "Reason 4"], correctAnswer: "Reason 1" },
                { question: `Which tool is used for ${topicName}?`, options: ["Tool X", "Tool Y", "Tool Z", "Tool W"], correctAnswer: "Tool X" },
                { question: `How do you start with ${topicName}?`, options: ["Step 1", "Step 2", "Step 3", "Step 4"], correctAnswer: "Step 1" },
                { question: `What is the final goal of ${topicName}?`, options: ["Goal A", "Goal B", "Goal C", "Goal D"], correctAnswer: "Goal A" }
            ];
            return res.json({ quiz: mockQuiz });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Generate a 5-question multiple-choice quiz about the topic: "${topicName}".
Return the response STRICTLY as a JSON array where each object has:
- "question" (string)
- "options" (array of exactly 4 strings)
- "correctAnswer" (string, must exactly match one of the options)
Do not return any markdown formatting like \`\`\`json, only the raw JSON array.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        let quiz;
        try {
            // Try to parse the JSON directly
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            quiz = JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse Gemini JSON output:", responseText);
            return res.status(500).json({ error: 'Failed to generate a valid quiz format' });
        }

        res.json({ quiz });
    } catch (error) {
        console.error("AI Quiz Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate quiz' });
    }
});

module.exports = router;
