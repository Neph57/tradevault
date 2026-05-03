const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

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
  entry REAL NOT NULL,
  exit REAL NOT NULL,
  quantity REAL NOT NULL,
  stop_loss REAL,
  take_profit REAL,
  strategy TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// Register user
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  console.log('📝 Registration attempt:', username);
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, password],
    function(err) {
      if (err) {
        console.log('❌ Registration error:', err.message);
        if (err.message.includes('UNIQUE')) {
          res.status(400).json({ error: 'Username already exists' });
        } else {
          res.status(500).json({ error: err.message });
        }
        return;
      }
      console.log('✅ User created:', username);
      res.json({ id: this.lastID, username });
    }
  );
});

// Login user
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔐 Login attempt:', username);
  
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (err, user) => {
      if (err) {
        console.log('❌ Login error:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!user) {
        console.log('❌ Invalid credentials for:', username);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      console.log('✅ Login successful:', username);
      res.json({ id: user.id, username: user.username });
    }
  );
});

// Get all trades for a user
app.get('/api/trades/:userId', (req, res) => {
  console.log('📊 Fetching trades for user:', req.params.userId);
  
  db.all(`SELECT * FROM trades WHERE user_id = ? ORDER BY date DESC`,
    [req.params.userId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Add new trade
app.post('/api/trades', (req, res) => {
  const { userId, symbol, date, type, entry, exit, quantity, stopLoss, takeProfit, strategy, notes } = req.body;
  console.log('➕ Adding trade for user:', userId, 'Symbol:', symbol);
  
  db.run(`INSERT INTO trades (user_id, symbol, date, type, entry, exit, quantity, stop_loss, take_profit, strategy, notes) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, symbol, date, type, entry, exit, quantity, stopLoss, takeProfit, strategy, notes],
    function(err) {
      if (err) {
        console.log('❌ Error adding trade:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log('✅ Trade added, ID:', this.lastID);
      res.json({ id: this.lastID });
    }
  );
});

// Update trade (FULL update with all fields)
app.put('/api/trades/:id', (req, res) => {
  const { entry, exit, notes, stopLoss, takeProfit, strategy, symbol, date, type, quantity } = req.body;
  const id = req.params.id;
  console.log('✏️ Updating trade:', id);
  
  db.run(`UPDATE trades SET 
    entry = ?, 
    exit = ?, 
    notes = ?, 
    stop_loss = ?, 
    take_profit = ?, 
    strategy = ?,
    symbol = ?,
    date = ?,
    type = ?,
    quantity = ?
    WHERE id = ?`,
    [entry, exit, notes, stopLoss, takeProfit, strategy, symbol, date, type, quantity, id],
    function(err) {
      if (err) {
        console.log('❌ Error updating trade:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log('✅ Trade updated:', id);
      res.json({ updated: true });
    }
  );
});

// Delete trade
app.delete('/api/trades/:id', (req, res) => {
  console.log('🗑️ Deleting trade:', req.params.id);
  
  db.run(`DELETE FROM trades WHERE id = ?`,
    [req.params.id],
    function(err) {
      if (err) {
        console.log('❌ Error deleting trade:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log('✅ Trade deleted:', req.params.id);
      res.json({ deleted: true });
    }
  );
});

      console.log('✅ Trade deleted:', req.params.id);
// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Trading Journal API is ready!`);
  console.log(`💡 Press Ctrl+C to stop the server`);
});