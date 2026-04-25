const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const generateId = () => Math.random().toString(36).substr(2, 9);

// Helper to enrich skills with reliability and quality scores
const enrichSkills = async (skillsArray) => {
    if (skillsArray.length === 0) return [];
    
    // Extract unique teacher IDs
    const teacherIds = [...new Set(skillsArray.map(s => s.teacher_id))];
    
    // Fetch related data for these teachers
    const { rows: sessions } = await db.query('SELECT * FROM sessions WHERE teacher_id = ANY($1)', [teacherIds]);
    const { rows: adminDisputes } = await db.query('SELECT * FROM admin_disputes');
    const { rows: reviews } = await db.query('SELECT * FROM reviews WHERE teacher_id = ANY($1)', [teacherIds]);
    const { rows: users } = await db.query('SELECT id, badges FROM users WHERE id = ANY($1)', [teacherIds]);

    return skillsArray.map(skill => {
        let tier = 'Tier B (Mid)';
        const credits = skill.credits_per_hour || 1;
        
        if (credits >= 5) {
            tier = 'Tier A (High)';
        } else if (credits >= 2 && credits <= 4) {
            tier = 'Tier B (Mid)';
        } else {
            tier = 'Tier C (Peer)';
        }

        // Reliability Score (50% Weight)
        const teacherSessions = sessions.filter(s => s.teacher_id === skill.teacher_id);
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
                    const dispute = adminDisputes.find(d => d.session_id === s.id);
                    // Penalize if teacher was at fault
                    if (dispute && dispute.fault !== 'teacher') {
                        successCount++;
                    }
                }
            });
            reliabilityScore = successCount / totalSessionsCount;
        }

        // Quality Score (50% Weight) via Bayesian Average
        const teacherReviews = reviews.filter(r => r.teacher_id === skill.teacher_id);
        const BAYES_CONSTANT = 3;
        const BAYES_DEFAULT_RATING = 3.5;
        
        const totalRatingSum = teacherReviews.reduce((sum, r) => sum + r.rating, 0);
        const reviewCount = teacherReviews.length;
        
        const qualityAverage = ((BAYES_CONSTANT * BAYES_DEFAULT_RATING) + totalRatingSum) / (BAYES_CONSTANT + reviewCount);
        const qualityScore = Math.min(qualityAverage / 5.0, 1.0); // Normalize 0-1

        // Final Match Score Computation
        const baseScore = (qualityScore * 0.5) + (reliabilityScore * 0.5);
        const matchScore = Math.max(0, Math.min(Math.round(baseScore * 100), 100));

        const teacherUser = users.find(u => u.id === skill.teacher_id);
        const teacherBadges = teacherUser ? (teacherUser.badges || []) : [];

        return { 
            id: skill.id,
            title: skill.title,
            category: skill.category,
            description: skill.description,
            level: skill.level,
            teacherId: skill.teacher_id,
            teacherName: skill.teacher_name,
            createdAt: skill.created_at,
            creditsPerHour: skill.credits_per_hour,
            isAvailable: skill.is_available,
            tier, 
            matchScore,
            totalSessionsCount,
            reliabilityScore,
            qualityScore,
            reviewCount,
            totalDays: skill.total_days,
            syllabus: skill.syllabus,
            teacherBadges
        };
    });
};

router.get('/dual-match', async (req, res) => {
    const { query, maxCredits, userId } = req.query;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const maxC = parseInt(maxCredits) || 5;
    const lowerQuery = `%${query.toLowerCase()}%`;

    try {
        let sql = `SELECT s.* FROM skills s JOIN users u ON s.teacher_id = u.id WHERE u.is_available_for_teaching = true AND s.is_available = true AND (LOWER(s.title) LIKE $1 OR LOWER(s.category) LIKE $1) AND s.credits_per_hour <= $2`;
        const params = [lowerQuery, maxC];

        if (userId) {
            sql += ` AND s.teacher_id != $3`;
            params.push(userId);
        }

        const { rows: filtered } = await db.query(sql, params);

        if (filtered.length === 0) {
            return res.json({ premiumMatch: null, valueMatch: null });
        }

        const enriched = await enrichSkills(filtered);

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/', async (req, res) => {
    const { userId } = req.query;
    try {
        let sql = `SELECT s.* FROM skills s JOIN users u ON s.teacher_id = u.id WHERE u.is_available_for_teaching = true AND s.is_available = true`;
        const params = [];
        if (userId) {
            sql += ` AND s.teacher_id != $1`;
            params.push(userId);
        }
        const { rows } = await db.query(sql, params);
        const enriched = await enrichSkills(rows);
        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/my-skills/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const { rows } = await db.query(`SELECT * FROM skills WHERE teacher_id = $1`, [userId]);
        const enriched = await enrichSkills(rows);
        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const { title, category, description, level, teacherId, teacherName, totalDays, syllabus } = req.body;

    if (!title || !category || !description || !level || !teacherId) {
        return res.status(400).json({ error: 'Missing required skill fields' });
    }

    const creditsPerHour = level === 'Advanced' ? 5 : (level === 'Intermediate' ? 3 : 1);
    const newId = generateId();
    const days = parseInt(totalDays) || 1;
    const syll = JSON.stringify(syllabus || []);

    try {
        const { rows } = await db.query(
            `INSERT INTO skills (id, title, category, description, level, teacher_id, teacher_name, credits_per_hour, total_days, syllabus)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [newId, title, category, description, level, teacherId, teacherName, creditsPerHour, days, syll]
        );
        
        const enriched = await enrichSkills([rows[0]]);
        res.status(201).json(enriched[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/:skillId/enroll', async (req, res) => {
    const { learnerId } = req.body;
    const { skillId } = req.params;

    try {
        const { rows: skillRows } = await db.query('SELECT * FROM skills WHERE id = $1', [skillId]);
        const skill = skillRows[0];
        
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        if (skill.is_available === false) return res.status(400).json({ error: 'Skill is no longer available!' });
        if (skill.teacher_id === learnerId) return res.status(400).json({ error: 'Cannot enroll in your own skill' });

        const { rows: learnerRows } = await db.query('SELECT * FROM users WHERE id = $1', [learnerId]);
        const learner = learnerRows[0];
        
        if (!learner) return res.status(404).json({ error: 'Learner not found' });
        if (learner.credits < skill.credits_per_hour) return res.status(400).json({ error: 'Insufficient credits to enroll' });

        // Transaction DB
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Deduct credits
            await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [skill.credits_per_hour, learnerId]);
            
            // Set availability to false for teacher and skill
            await client.query('UPDATE users SET is_available_for_teaching = false WHERE id = $1', [skill.teacher_id]);
            await client.query('UPDATE skills SET is_available = false WHERE id = $1', [skillId]);

            // Build time-gated syllabus
            const now = new Date();
            const sessionSyllabus = (skill.syllabus || []).map((lvl, idx) => {
                let status = 'Locked';
                if (idx === 0) {
                    const scheduled = new Date(`${lvl.scheduledDate}T${lvl.scheduledTime || '00:00'}`);
                    status = scheduled > now ? 'Upcoming' : 'Active';
                }
                return {
                    ...lvl,
                    studentSubmission: '',
                    teacherChallengePrompt: '',
                    status
                };
            });
            const syllabusJson = JSON.stringify(sessionSyllabus);

            const newSessionId = generateId();
            const { rows: sessionRows } = await client.query(
                `INSERT INTO sessions (id, skill_id, skill_title, teacher_id, teacher_name, learner_id, learner_name, escrow_amount, syllabus)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [newSessionId, skill.id, skill.title, skill.teacher_id, skill.teacher_name, learnerId, learner.name, skill.credits_per_hour, syllabusJson]
            );

            await client.query('COMMIT');

            if (req.io) {
                req.io.to('dashboard').emit('skill_unavailable', skill.id);
            }

            // Convert DB naming back to matched JS naming
            const createdSession = sessionRows[0];
            const returnSession = {
                id: createdSession.id,
                skillId: createdSession.skill_id,
                skillTitle: createdSession.skill_title,
                teacherId: createdSession.teacher_id,
                teacherName: createdSession.teacher_name,
                learnerId: createdSession.learner_id,
                learnerName: createdSession.learner_name,
                status: createdSession.status,
                escrowAmount: createdSession.escrow_amount,
                createdAt: createdSession.created_at
            };

            if (req.io) {
                req.io.to(skill.teacher_id).emit('new_enrollment', returnSession);
            }
            res.status(201).json(returnSession);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Format DB Session to app naming
const formatSession = (dbSession) => ({
    id: dbSession.id,
    skillId: dbSession.skill_id,
    skillTitle: dbSession.skill_title,
    teacherId: dbSession.teacher_id,
    teacherName: dbSession.teacher_name,
    learnerId: dbSession.learner_id,
    learnerName: dbSession.learner_name,
    status: dbSession.status,
    escrowAmount: dbSession.escrow_amount,
    createdAt: dbSession.created_at,
    meetingLink: dbSession.meeting_link,
    currentLevel: dbSession.current_level,
    syllabus: dbSession.syllabus
});

router.get('/sessions/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { rows } = await db.query(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        
        const session = rows[0];
        let updated = false;
        const now = new Date();
        const evalSyllabus = (session.syllabus || []).map(lvl => {
            if (lvl.status === 'Upcoming') {
                const scheduled = new Date(`${lvl.scheduledDate}T${lvl.scheduledTime || '00:00'}`);
                if (scheduled <= now) {
                    lvl.status = 'Active';
                    updated = true;
                }
            }
            return lvl;
        });
        
        if (updated) {
            await db.query('UPDATE sessions SET syllabus = $1 WHERE id = $2', [JSON.stringify(evalSyllabus), session.id]);
            session.syllabus = evalSyllabus;
        }

        res.json(formatSession(session));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/sessions/active/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const { rows } = await db.query(
            `SELECT * FROM sessions WHERE (teacher_id = $1 OR learner_id = $1) AND status = 'active'`,
            [userId]
        );
        
        // Dynamically evaluate Upcoming -> Active on fetch
        const now = new Date();
        const evaluatedRows = [];
        for (const session of rows) {
            let updated = false;
            const evalSyllabus = (session.syllabus || []).map(lvl => {
                if (lvl.status === 'Upcoming') {
                    const scheduled = new Date(`${lvl.scheduledDate}T${lvl.scheduledTime || '00:00'}`);
                    if (scheduled <= now) {
                        lvl.status = 'Active';
                        updated = true;
                    }
                }
                return lvl;
            });
            if (updated) {
                await db.query('UPDATE sessions SET syllabus = $1 WHERE id = $2', [JSON.stringify(evalSyllabus), session.id]);
                session.syllabus = evalSyllabus;
            }
            evaluatedRows.push(session);
        }

        res.json(evaluatedRows.map(formatSession));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/sessions/history/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const { rows } = await db.query(
            `SELECT * FROM sessions WHERE (teacher_id = $1 OR learner_id = $1) AND (status = 'completed' OR status = 'disputed')`,
            [userId]
        );
        res.json(rows.map(formatSession));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sessions/:sessionId/complete', async (req, res) => {
    const { sessionId } = req.params;
    
    try {
        const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        const session = sessionRows[0];
        
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("UPDATE sessions SET status = 'completed' WHERE id = $1", [sessionId]);
            
            if (session.escrow_amount > 0) {
                await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [session.escrow_amount, session.teacher_id]);
            }
            
            await client.query('COMMIT');
            
            const formatted = formatSession({...session, status: 'completed'});

            if (req.io) {
                req.io.to(sessionId).emit('session_completed', formatted);
                req.io.to('dashboard').emit('global_session_completed', formatted);
            }
            
            res.json({ message: 'Session completed successfully', session: formatted });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sessions/:sessionId/dispute', async (req, res) => {
    const { sessionId } = req.params;
    const { reason } = req.body || {};
    const disputeReason = reason || "Unspecified reason";
    
    try {
        const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        const session = sessionRows[0];
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });

        const { rows: messagesRows } = await db.query('SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC', [sessionId]);
        const chatTranscript = messagesRows.map(m => `${m.sender_name} (${m.sender_id === session.teacher_id ? 'Teacher' : 'Student'}): ${m.text}`).join("\n");

        let winner = "split";
        let reasoning = "A standard 50/50 split was applied.";

        if (chatTranscript.trim().length === 0) {
            reasoning = "Unable to determine winner due to missing Chat logs. A standard 50/50 split was applied.";
        } else if (!process.env.GEMINI_API_KEY) {
            reasoning = "Gemini API Key missing. Applied standard 50/50 split fallback. Check backend/.env";
        } else {
            try {
                const prompt = `You are an impartial arbitrator for a peer-to-peer skill exchange platform. Read the following chat transcript between a 'Teacher' and a 'Student'. The student has opened a dispute. Your job is to determine who is at fault based on the conversation (e.g., did the teacher fail to provide the agreed-upon help, or is the student trying to unfairly keep their credits?). Return your response ONLY in JSON format with two keys: "winner" (value must be either 'student' or 'teacher') and "reason" (a brief explanation of your decision).

Chat Transcript:
${chatTranscript}

Dispute Reason from Student: "${disputeReason}"`;

                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
                // The correct Google AI Studio model identifier is 'gemini-2.5-flash'
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                
                const result = await model.generateContent(prompt);
                const response = await result.response;
                let text = response.text().trim();
                
                if (text) {
                    if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
                    const parsed = JSON.parse(text);
                    winner = parsed.winner || "split";
                    reasoning = parsed.reason || "AI decided this resolution.";
                } else {
                    throw new Error("No text content returned from Gemini");
                }
            } catch (error) {
                console.error("Gemini API Error:", error);
                const emsg = error.message ? error.message : "Service Unavailable";
                return res.status(503).json({ 
                    error: `AI Evaluator failed: ${emsg}. Please try clicking 'Dispute' again in a few moments.` 
                });
            }
        }

        let messageToUser = '';
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const total = session.escrow_amount;
            if (total > 0) {
                if (winner === 'student') {
                    // Student wins, refund credits to student
                    await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [total, session.learner_id]);
                    messageToUser = "100% Refunded to Student. AI ruled in favor of the student.";
                } else if (winner === 'teacher') {
                    // Teacher wins, release credits to teacher
                    await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [total, session.teacher_id]);
                    messageToUser = "100% Paid to Teacher. AI ruled in favor of the teacher.";
                } else {
                    const halfAmount = Math.floor(total / 2);
                    const rem = total - halfAmount;
                    await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [halfAmount, session.teacher_id]);
                    await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [rem, session.learner_id]);
                    messageToUser = "Credits Split 50/50 between Teacher and Student.";
                }
            }
            
            await client.query("UPDATE sessions SET status = 'disputed', escrow_amount = 0 WHERE id = $1", [sessionId]);
            
            const disputeId = generateId();
            await client.query(
                `INSERT INTO admin_disputes (id, session_id, dispute_reason, fault, reasoning) VALUES ($1, $2, $3, $4, $5)`,
                [disputeId, sessionId, disputeReason, `winner:${winner}`, reasoning]
            );

            await client.query('COMMIT');

            const formatted = formatSession({...session, status: 'disputed', escrow_amount: 0});
            if (req.io) {
                req.io.to(sessionId).emit('session_disputed', { session: formatted, disputeRecord: { id: disputeId, fault: `winner:${winner}`, reasoning }, message: messageToUser });
                req.io.to('dashboard').emit('global_session_completed', formatted);
            }

            res.json({ message: messageToUser, session: formatted, disputeRecord: { id: disputeId, fault: `winner:${winner}`, reasoning } });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/sessions/:sessionId/messages', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { rows } = await db.query('SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC', [sessionId]);
        const mapping = rows.map(m => ({
            id: m.id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            text: m.text,
            timestamp: m.timestamp
        }));
        res.json(mapping);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sessions/:sessionId/review', async (req, res) => {
    const { sessionId } = req.params;
    const { learnerId, rating, text } = req.body;

    try {
        const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        const session = sessionRows[0];
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.learner_id !== learnerId) return res.status(403).json({ error: 'Only the learner can submit a review' });

        const newId = generateId();
        const score = Number(rating) || 5;

        const { rows } = await db.query(
            `INSERT INTO reviews (id, session_id, teacher_id, learner_id, rating, text) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [newId, sessionId, session.teacher_id, learnerId, score, text || '']
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sessions/:sessionId/progress', async (req, res) => {
    // Deprecated for the new specific /level-action
    res.status(405).json({ error: 'Use /sessions/:sessionId/level-action' });
});

router.post('/sessions/:sessionId/level-action', async (req, res) => {
    const { sessionId } = req.params;
    const { levelNumber, action, payload } = req.body; 

    try {
        const { rows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = rows[0];
        let syllabus = session.syllabus || [];
        
        const lvlIdx = syllabus.findIndex(l => parseInt(l.levelNumber) === parseInt(levelNumber));
        if (lvlIdx === -1) return res.status(404).json({ error: 'Level not found' });

        if (action === 'request_next') {
            syllabus[lvlIdx].status = 'Requested Next Level';
        } else if (action === 'request_reschedule') {
            syllabus[lvlIdx].status = 'Reschedule Requested';
            syllabus[lvlIdx].emergencyReason = payload?.emergencyReason || '';
        } else if (action === 'activate_level') {
            syllabus[lvlIdx].status = 'Active';
        } else if (action === 'assign_challenge') {
            syllabus[lvlIdx].status = 'Challenge Assigned';
            syllabus[lvlIdx].teacherChallengePrompt = payload?.prompt || '';
            syllabus[lvlIdx].studentSubmission = ''; // reset just in case
        } else if (action === 'submit_challenge') {
            syllabus[lvlIdx].status = 'Requested Next Level';
            syllabus[lvlIdx].studentSubmission = payload?.submission || '';
        } else if (action === 'approve') {
            syllabus[lvlIdx].status = 'Completed';
            session.current_level = parseInt(levelNumber) + 1;
            
            // Time gate the next level if exists
            if (lvlIdx + 1 < syllabus.length) {
                const nextLvl = syllabus[lvlIdx + 1];
                const now = new Date();
                const scheduled = new Date(`${nextLvl.scheduledDate}T${nextLvl.scheduledTime || '00:00'}`);
                nextLvl.status = scheduled > now ? 'Upcoming' : 'Active';
            } else {
                // All levels completed! Reset teacher availability
                await db.query('UPDATE users SET is_available_for_teaching = true WHERE id = $1', [session.teacher_id]);
                // We'll let the user explicitly click complete session to release credits.
            }
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: updatedRows } = await client.query(
                'UPDATE sessions SET syllabus = $1, current_level = $2 WHERE id = $3 RETURNING *',
                [JSON.stringify(syllabus), session.current_level, sessionId]
            );
            await client.query('COMMIT');
            
            const formatted = formatSession(updatedRows[0]);
            if (req.io) {
                req.io.to(sessionId).emit('session_updated', formatted);
                req.io.to('dashboard').emit('global_session_updated', formatted);
            }
            res.json(formatted);
        } catch(e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/sessions/:sessionId/bulk-schedule', async (req, res) => {
    const { sessionId } = req.params;
    const { updates } = req.body; 

    try {
        const { rows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = rows[0];
        let syllabus = session.syllabus || [];
        const now = new Date();

        if (Array.isArray(updates)) {
            updates.forEach(update => {
                const idx = syllabus.findIndex(l => parseInt(l.levelNumber) === parseInt(update.levelNumber));
                if (idx !== -1) {
                    if (update.scheduledDate) syllabus[idx].scheduledDate = update.scheduledDate;
                    if (update.scheduledTime) syllabus[idx].scheduledTime = update.scheduledTime;
                    
                    if (syllabus[idx].status === 'Reschedule Requested') {
                        const scheduled = new Date(`${syllabus[idx].scheduledDate}T${syllabus[idx].scheduledTime || '00:00'}`);
                        syllabus[idx].status = scheduled > now ? 'Upcoming' : 'Active';
                    }
                }
            });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: updatedRows } = await client.query(
                'UPDATE sessions SET syllabus = $1 WHERE id = $2 RETURNING *',
                [JSON.stringify(syllabus), sessionId]
            );
            await client.query('COMMIT');
            
            const formatted = formatSession(updatedRows[0]);
            if (req.io) {
                req.io.to(sessionId).emit('session_updated', formatted);
                req.io.to('dashboard').emit('global_session_updated', formatted);
            }
            res.json(formatted);
        } catch(e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
