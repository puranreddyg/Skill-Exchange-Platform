const db = require('./backend/db');
async function test() {
    try {
        const res = await db.query('SELECT * FROM messages');
        console.log("MESSAGES:", res.rows);
    } catch (e) { console.error(e); }
    process.exit(0);
}
test();
