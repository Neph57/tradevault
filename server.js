const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

// ============ REGISTER ============
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check if user exists
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
    
    if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password }])
        .select();
    
    if (error) {
        console.error('Register error:', error);
        return res.status(500).json({ error: error.message });
    }
    
    res.json({ id: data[0].id, username: data[0].username });
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const { data, error } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .eq('password', password)
        .single();
    
    if (error || !data) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ id: data.id, username: data.username });
});

// ============ GET TRADES ============
app.get('/api/trades/:userId', async (req, res) => {
    const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', req.params.userId)
        .order('date', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// ============ ADD TRADE ============
app.post('/api/trades', async (req, res) => {
    const { userId, symbol, date, type, session, entry, exit, quantity, stopLoss, takeProfit, strategy, holding_period, notes } = req.body;
    
    const { data, error } = await supabase
        .from('trades')
        .insert([{
            user_id: userId,
            symbol, date, type, session,
            entry, exit, quantity,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            strategy, holding_period, notes
        }])
        .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
});

// ============ UPDATE TRADE ============
app.put('/api/trades/:id', async (req, res) => {
    const { symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes, screenshot } = req.body;
    
    const { error } = await supabase
        .from('trades')
        .update({ symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes, screenshot })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ updated: true });
});

// ============ DELETE TRADE ============
app.delete('/api/trades/:id', async (req, res) => {
    const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: true });
});

// ============ UPLOAD SCREENSHOT ============
app.post('/api/trades/:id/screenshot', upload.single('screenshot'), async (req, res) => {
    const tradeId = req.params.id;
    const imageUrl = `/uploads/${req.file.filename}`;
    
    const { error } = await supabase
        .from('trades')
        .update({ screenshot: imageUrl })
        .eq('id', tradeId);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ screenshot: imageUrl });
});

// ============ TRACK AFFILIATE CLICKS ============
app.post('/api/track-click', async (req, res) => {
    const { link_name, destination, user_id } = req.body;
    res.json({ tracked: true });
});

// ============ SERVE PAGES ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TradeVault running on port ${PORT}`);
});