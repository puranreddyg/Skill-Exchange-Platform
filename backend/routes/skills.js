const express = require('express');
const router = express.Router();
const { skills, sessions, messages, users, adminDisputes, reviews, saveData } = require('../store');

const generateId = () => Math.random().toString(36).substr(2, 9);

const enrichSkills = (skillsArray) => {
    return skillsArray.map(skill => {
        let tier = 'Tier B (Mid)';
        const credits = skill.creditsPerHour || 1;
        
        if (credits >= 5) {
            tier = 'Tier A (High)';
        } else if (credits >= 2 && credits <= 4) {
            tier = 'Tier B (Mid)';
        } else {
            tier = 'Tier C (Peer)';
        }

        // Reliability Score (50% Weight)
        const teacherSessions = sessions.filter(s => s.teacherId === skill.teacherId);
        const completedSessions = teacherSessions.filter(s => s.status === 'completed' || s.status === 'disputed');
        
        let reliabilityScore = 0.8; // 80% baseline for new teachers
        let totalSessionsCount = 0;
        
        if (completedSessions.length > 0) {
            totalSessionsCount = completedSessions.length;
            let successCount = 0;
            completedSessions.forEach(s => {
                if (s.status === 'completed') {
                    successCount++;
                } else if (s.status === 'disputed') {
                    const dispute = adminDisputes.find(d => d.sessionId === s.id);
                    // Penalize if teacher was at fault
                    if (dispute && dispute.fault !== 'teacher') {
                        successCount++;
                    }
                }
            });
            reliabilityScore = successCount / totalSessionsCount;
        }

        // Quality Score (50% Weight) via Bayesian Average
        const teacherReviews = reviews.filter(r => r.teacherId === skill.teacherId);
        const BAYES_CONSTANT = 3;
        const BAYES_DEFAULT_RATING = 3.5;
        
        const totalRatingSum = teacherReviews.reduce((sum, r) => sum + r.rating, 0);
        const reviewCount = teacherReviews.length;
        
        const qualityAverage = ((BAYES_CONSTANT * BAYES_DEFAULT_RATING) + totalRatingSum) / (BAYES_CONSTANT + reviewCount);
        const qualityScore = Math.min(qualityAverage / 5.0, 1.0); // Normalize 0-1

        // Final Match Score Computation
        const baseScore = (qualityScore * 0.5) + (reliabilityScore * 0.5);
        const matchScore = Math.max(0, Math.min(Math.round(baseScore * 100), 100));

        return { 
            ...skill, 
            tier, 
            matchScore,
            totalSessionsCount,
            reliabilityScore,
            qualityScore,
            reviewCount
        };
    });
};

router.get('/dual-match', (req, res) => {
    const { query, maxCredits, userId } = req.query;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const maxC = parseInt(maxCredits) || 5;
    const lowerQuery = query.toLowerCase();

    const filtered = skills.filter(skill => {
        if (userId && skill.teacherId === userId) return false;
        if (skill.isAvailable === false) return false;
        const matchesQuery = skill.title.toLowerCase().includes(lowerQuery) || skill.category.toLowerCase().includes(lowerQuery);
        const matchesBudget = (skill.creditsPerHour || 1) <= maxC;
        return matchesQuery && matchesBudget;
    });

    if (filtered.length === 0) {
        return res.json({ premiumMatch: null, valueMatch: null });
    }

    const enriched = enrichSkills(filtered);

    // Premium Match Check: Safest Bet Expert
    const eligiblePremium = enriched.filter(s => s.totalSessionsCount >= 5 && s.reliabilityScore > 0.90);
    eligiblePremium.sort((a, b) => {
        if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
        if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
        return b.totalSessionsCount - a.totalSessionsCount;
    });
    const premiumMatch = eligiblePremium.length > 0 ? eligiblePremium[0] : null;

    // Top Value Check: Best Bang for Credit
    const remainingForValue = enriched.filter(s => (!premiumMatch || s.id !== premiumMatch.id) && (s.creditsPerHour || 1) <= 3);
    remainingForValue.sort((a, b) => {
        const vfmA = Math.pow(a.qualityScore, 2) / (a.creditsPerHour || 1);
        const vfmB = Math.pow(b.qualityScore, 2) / (b.creditsPerHour || 1);
        return vfmB - vfmA;
    });
    
    const valueMatch = remainingForValue.length > 0 ? remainingForValue[0] : null;
    if (valueMatch) valueMatch.topValueChoice = true;

    res.json({ premiumMatch, valueMatch });
});

router.get('/', (req, res) => {
    const { userId } = req.query;
    let filtered = skills.filter(s => s.isAvailable !== false);
    if (userId) {
        filtered = filtered.filter(s => s.teacherId !== userId);
    }
    res.json(enrichSkills(filtered));
});

router.get('/my-skills/:userId', (req, res) => {
    const { userId } = req.params;
    const mySkills = skills.filter(s => s.teacherId === userId);
    res.json(enrichSkills(mySkills));
});

router.post('/', (req, res) => {
    const { title, category, description, level, teacherId, teacherName } = req.body;

    if (!title || !category || !description || !level || !teacherId) {
        return res.status(400).json({ error: 'Missing required skill fields' });
    }

    const creditsPerHour = level === 'Advanced' ? 5 : (level === 'Intermediate' ? 3 : 1);

    const newSkill = {
        id: generateId(),
        title,
        category,
        description,
        level,
        teacherId,
        teacherName,
        createdAt: new Date().toISOString(),
        creditsPerHour,
        completionRate: 0.90,
        subjectAuthority: 1,
        sentimentScore: 4.0,
        teachingStyle: 'hands-on',
        isAvailable: true
    };

    skills.push(newSkill);
    saveData();
    const enriched = enrichSkills([newSkill])[0];
    res.status(201).json(enriched);
});

router.post('/:skillId/enroll', (req, res) => {
    const { learnerId } = req.body;
    const { skillId } = req.params;

    const skill = skills.find(s => s.id === skillId);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    if (skill.isAvailable === false) {
        return res.status(400).json({ error: 'Skill is no longer available!' });
    }

    if (skill.teacherId === learnerId) {
        return res.status(400).json({ error: 'Cannot enroll in your own skill' });
    }

    const learner = users.find(u => u.id === learnerId);
    if (!learner) return res.status(404).json({ error: 'Learner not found' });

    if (learner.credits < skill.creditsPerHour) {
        return res.status(400).json({ error: 'Insufficient credits to enroll' });
    }

    // Deduct credits to Escrow
    learner.credits -= skill.creditsPerHour;
    
    // Set availability to false to remove from feed
    skill.isAvailable = false;

    if (req.io) {
        req.io.to('dashboard').emit('skill_unavailable', skill.id);
    }

    const newSessionId = generateId();
    const newSession = {
        id: newSessionId,
        skillId: skill.id,
        skillTitle: skill.title,
        teacherId: skill.teacherId,
        teacherName: skill.teacherName,
        learnerId,
        learnerName: learner.name,
        status: 'active',
        escrowAmount: skill.creditsPerHour,
        createdAt: new Date().toISOString()
    };

    sessions.push(newSession);
    saveData();
    if (req.io) {
        req.io.to(skill.teacherId).emit('new_enrollment', newSession);
    }
    res.status(201).json(newSession);
});

router.get('/sessions/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

router.get('/sessions/active/:userId', (req, res) => {
    const { userId } = req.params;
    const userSessions = sessions.filter(s => 
        (s.teacherId === userId || s.learnerId === userId) &&
        (s.status === 'active')
    );
    res.json(userSessions);
});

router.get('/sessions/history/:userId', (req, res) => {
    const { userId } = req.params;
    const userSessions = sessions.filter(s => 
        (s.teacherId === userId || s.learnerId === userId) &&
        (s.status === 'completed' || s.status === 'disputed')
    );
    res.json(userSessions);
});

router.post('/sessions/:sessionId/complete', (req, res) => {
    const { sessionId } = req.params;
    
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session is not active' });
    }

    session.status = 'completed';

    // Transfer Escrow to Teacher
    const teacher = users.find(u => u.id === session.teacherId);
    if (teacher && session.escrowAmount) {
        teacher.credits += session.escrowAmount;
    }

    if (req.io) {
        req.io.to(sessionId).emit('session_completed', session);
        req.io.to('dashboard').emit('global_session_completed', session);
    }

    saveData();
    res.json({ message: 'Session completed successfully', session });
});

router.post('/sessions/:sessionId/dispute', async (req, res) => {
    const { sessionId } = req.params;
    const { reason } = req.body || {};
    const disputeReason = reason || "Unspecified reason";
    
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session is not active' });
    }

    const teacher = users.find(u => u.id === session.teacherId);
    const learner = users.find(u => u.id === session.learnerId);
    const chatHistory = messages[sessionId] || [];

    const chatTranscript = chatHistory.map(m => `${m.senderName} (${m.senderId === session.teacherId ? 'Teacher' : 'Student'}): ${m.text}`).join("\n");

    let fault = "split";
    let reasoning = "Unable to determine fault due to missing Chat logs. A standard 50/50 split was applied.";

    if (process.env.GEMINI_API_KEY && chatTranscript.trim().length > 0) {
        try {
            const prompt = `You are an impartial dispute resolution AI for a skill exchange platform.
Teacher ID: ${session.teacherId} (${session.teacherName})
Student ID: ${session.learnerId}
Dispute Reason from Student: "${disputeReason}"

Here is the chat transcript:
${chatTranscript}

Analyze the chat logically. If the teacher was professional and provided the service but the student is trolling, fault the student. If the teacher no-showed, ignored messages, or was unhelpful, fault the teacher. If it's a mutual misunderstanding, choose 'split'.

Return ONLY a valid JSON object in this exact format, with no markdown formatting around it:
{ "fault": "teacher" | "student" | "split", "reasoning": "A 1-2 sentence explanation." }`;

            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const aiData = await geminiRes.json();
            if (aiData.candidates && aiData.candidates[0].content.parts[0].text) {
                let text = aiData.candidates[0].content.parts[0].text.trim();
                if (text.startsWith('\`\`\`json')) text = text.replace(/^\`\`\`json\s*/, '').replace(/\`\`\`$/, '').trim();
                const parsed = JSON.parse(text);
                fault = parsed.fault || "split";
                reasoning = parsed.reasoning || "AI decided this resolution.";
            }
        } catch (error) {
            console.error("Gemini API Error:", error);
            reasoning = "AI API encountered an error. Applied standard 50/50 split fallback.";
            fault = "split";
        }
    } else if (!process.env.GEMINI_API_KEY) {
         reasoning = "Gemini API Key missing. Applied standard 50/50 split fallback. Check backend/.env";
    }

    let messageToUser = '';
    if (session.escrowAmount) {
        const total = session.escrowAmount;
        if (fault === 'teacher') {
            if (learner) learner.credits += total;
            messageToUser = "100% Refunded to Student. Teacher was found at fault by AI.";
        } else if (fault === 'student') {
            if (teacher) teacher.credits += total;
            messageToUser = "100% Paid to Teacher. Student was found at fault by AI.";
        } else {
            const halfAmount = total / 2;
            if (teacher) teacher.credits += halfAmount;
            if (learner) learner.credits += (total - halfAmount);
            messageToUser = "Credits Split 50/50 between Teacher and Student.";
        }
        session.escrowAmount = 0;
    }

    session.status = 'disputed';

    if (req.io) {
        req.io.to(sessionId).emit('session_completed', session);
        req.io.to('dashboard').emit('global_session_completed', session);
    }

    const disputeRecord = {
        id: generateId(),
        sessionId,
        disputeReason,
        fault,
        reasoning,
        createdAt: new Date().toISOString()
    };

    adminDisputes.push(disputeRecord);

    saveData();
    res.json({ message: messageToUser, session, disputeRecord });
});

router.get('/sessions/:sessionId/messages', (req, res) => {
    const { sessionId } = req.params;
    res.json(messages[sessionId] || []);
});

router.post('/sessions/:sessionId/review', (req, res) => {
    const { sessionId } = req.params;
    const { learnerId, rating, text } = req.body;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.learnerId !== learnerId) {
        return res.status(403).json({ error: 'Only the learner can submit a review' });
    }

    const newReview = {
        id: generateId(),
        sessionId,
        teacherId: session.teacherId,
        learnerId,
        rating: Number(rating) || 5, // fallback to 5
        text: text || '',
        createdAt: new Date().toISOString()
    };
    
    reviews.push(newReview);
    saveData();
    res.status(201).json(newReview);
});

module.exports = router;
