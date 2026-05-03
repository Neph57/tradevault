const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database('./trading.db');

// Create users table
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create trades table with ALL fields
db.run(`CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  session TEXT,
  entry REAL NOT NULL,
  exit REAL NOT NULL,
  quantity REAL NOT NULL,
  stop_loss REAL,
  take_profit REAL,
  strategy TEXT,
  holding_period REAL,
  notes TEXT,
  screenshot TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// Create uploads folder
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images allowed'));
    }
});

app.use('/uploads', express.static('uploads'));

// REGISTER
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, username });
    });
});

// LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json({ id: user.id, username: user.username });
    });
});

// GET ALL TRADES FOR USER
app.get('/api/trades/:userId', (req, res) => {
    db.all(`SELECT * FROM trades WHERE user_id = ? ORDER BY date DESC`, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ADD NEW TRADE
app.post('/api/trades', (req, res) => {
    const { userId, symbol, date, type, session, entry, exit, quantity, stopLoss, takeProfit, strategy, holding_period, notes } = req.body;
    
    db.run(`INSERT INTO trades (user_id, symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, symbol, date, type, session, entry, exit, quantity, stopLoss, takeProfit, strategy, holding_period, notes],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

// UPDATE TRADE - ALL FIELDS
app.put('/api/trades/:id', (req, res) => {
    const { symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes, screenshot } = req.body;
    const id = req.params.id;
    
    db.run(`UPDATE trades SET 
        symbol = ?,
        date = ?,
        type = ?,
        session = ?,
        entry = ?,
        exit = ?,
        quantity = ?,
        stop_loss = ?,
        take_profit = ?,
        strategy = ?,
        holding_period = ?,
        notes = ?,
        screenshot = ?
        WHERE id = ?`,
        [symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes, screenshot, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: true });
        });
});

// DELETE TRADE
app.delete('/api/trades/:id', (req, res) => {
    db.run(`DELETE FROM trades WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// UPLOAD SCREENSHOT
app.post('/api/trades/:id/screenshot', upload.single('screenshot'), (req, res) => {
    const tradeId = req.params.id;
    const imageUrl = `/uploads/${req.file.filename}`;
    db.run(`UPDATE trades SET screenshot = ? WHERE id = ?`, [imageUrl, tradeId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ screenshot: imageUrl });
    });
});

// TRACK AFFILIATE CLICKS
app.post('/api/track-click', (req, res) => {
    const { link_name, destination, user_id } = req.body;
    db.run(`CREATE TABLE IF NOT EXISTS affiliate_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_name TEXT,
        destination TEXT,
        user_id INTEGER,
        clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`INSERT INTO affiliate_clicks (link_name, destination, user_id) VALUES (?, ?, ?)`, [link_name, destination, user_id || null]);
    res.json({ tracked: true });
});


// Serve landing page
app.get('/landing', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});
// SERVE INDEX.HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);

});