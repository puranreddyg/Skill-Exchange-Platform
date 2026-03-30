const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const users = []; 
const skills = [];
const sessions = []; 
const messages = {}; 
const adminDisputes = [];
const reviews = [];

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            // Clear current arrays
            users.length = 0;
            skills.length = 0;
            sessions.length = 0;
            for (let key in messages) delete messages[key];
            adminDisputes.length = 0;
            reviews.length = 0;
            
            if (parsed.users) users.push(...parsed.users);
            if (parsed.skills) skills.push(...parsed.skills);
            if (parsed.sessions) sessions.push(...parsed.sessions);
            if (parsed.messages) Object.assign(messages, parsed.messages);
            if (parsed.adminDisputes) adminDisputes.push(...parsed.adminDisputes);
            if (parsed.reviews) reviews.push(...parsed.reviews);
            
            console.log('Data successfully loaded from disk.');
        } catch (error) {
            console.error('Error loading data from disk:', error);
        }
    } else {
        console.log('No existing data file found. Starting fresh.');
        saveData(); 
    }
}

function saveData() {
    const backupData = { users, skills, sessions, messages, adminDisputes, reviews };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(backupData, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving data to disk:', error);
    }
}

// Initial load
loadData();

module.exports = { users, skills, sessions, messages, adminDisputes, reviews, saveData };
