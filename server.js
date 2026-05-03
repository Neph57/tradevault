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


// ============ ADMIN DASHBOARD ============
app.get('/admin', async (req, res) => {
    // Get all users
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
    
    // Get all trades
    const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false });
    
    // Get user count
    const { count: userCount, error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
    
    // Get trades with user info
    const tradesWithUsers = await Promise.all((trades || []).map(async (trade) => {
        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', trade.user_id)
            .single();
        return { ...trade, username: user?.username || 'Unknown' };
    }));
    
    // Count new users today
    const today = new Date().toISOString().split('T')[0];
    const newToday = (users || []).filter(u => u.created_at?.startsWith(today)).length;
    
    // Count new users this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();
    const newThisWeek = (users || []).filter(u => u.created_at >= weekAgoStr).length;
    
    // Simple HTML admin page
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TradeVault Admin Dashboard</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
            <style>
                body { background: #0a0a0c; font-family: 'Inter', sans-serif; }
                .stat-card { background: #1a1a1f; border-radius: 12px; padding: 20px; border: 1px solid #2a2a2f; }
                .stat-value { font-size: 32px; font-weight: 700; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #2a2a2f; }
                th { color: #9ca3af; font-weight: 500; font-size: 12px; text-transform: uppercase; }
                .badge { background: #22c55e20; color: #22c55e; padding: 4px 8px; border-radius: 20px; font-size: 12px; }
            </style>
        </head>
        <body class="text-gray-200">
            <div class="container mx-auto px-6 py-8 max-w-7xl">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h1 class="text-3xl font-bold">Admin Dashboard</h1>
                        <p class="text-gray-500 mt-1">Monitor users and trading activity</p>
                    </div>
                    <a href="/dashboard.html" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition border border-gray-700">
                        <i class="fas fa-chart-line mr-2"></i>Go to App
                    </a>
                </div>
                
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="stat-card">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm">Total Users</p>
                                <p class="stat-value text-purple-400">${userCount || 0}</p>
                            </div>
                            <i class="fas fa-users text-3xl text-purple-500 opacity-50"></i>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm">New Today</p>
                                <p class="stat-value text-green-400">${newToday}</p>
                            </div>
                            <i class="fas fa-user-plus text-3xl text-green-500 opacity-50"></i>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm">New This Week</p>
                                <p class="stat-value text-blue-400">${newThisWeek}</p>
                            </div>
                            <i class="fas fa-calendar-week text-3xl text-blue-500 opacity-50"></i>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm">Total Trades</p>
                                <p class="stat-value text-yellow-400">${trades?.length || 0}</p>
                            </div>
                            <i class="fas fa-chart-line text-3xl text-yellow-500 opacity-50"></i>
                        </div>
                    </div>
                </div>
                
                <!-- Users Table -->
                <div class="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 mb-8">
                    <div class="p-4 border-b border-gray-800">
                        <h2 class="text-lg font-semibold"><i class="fas fa-users mr-2 text-purple-400"></i>All Users</h2>
                    </div>
                    <div class="overflow-x-auto">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Username</th>
                                    <th>Password</th>
                                    <th>Signup Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(users || []).map(user => `
                                    <tr class="hover:bg-gray-800/50">
                                        <td>${user.id}</td>
                                        <td><span class="font-medium">${user.username}</span></td>
                                        <td><span class="text-gray-500 text-sm">••••••••</span></td>
                                        <td class="text-gray-400 text-sm">${new Date(user.created_at).toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                ${(!users || users.length === 0) ? '<tr><td colspan="4" class="text-center text-gray-500 py-8">No users yet</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Recent Trades Table -->
                <div class="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
                    <div class="p-4 border-b border-gray-800">
                        <h2 class="text-lg font-semibold"><i class="fas fa-list mr-2 text-green-400"></i>Recent Trades</h2>
                    </div>
                    <div class="overflow-x-auto">
                        <table>
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Symbol</th>
                                    <th>Type</th>
                                    <th>Entry</th>
                                    <th>Exit</th>
                                    <th>P&L</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(tradesWithUsers || []).slice(0, 20).map(trade => `
                                    <tr class="hover:bg-gray-800/50">
                                        <td><span class="font-medium">${trade.username}</span></td>
                                        <td>${trade.symbol}</td>
                                        <td class="${trade.type === 'Long' ? 'text-green-500' : 'text-red-500'}">${trade.type}</td>
                                        <td>${trade.entry}</td>
                                        <td>${trade.exit}</td>
                                        <td class="${trade.exit - trade.entry >= 0 ? 'text-green-500' : 'text-red-500'}">$${((trade.exit - trade.entry) * trade.quantity).toFixed(2)}</td>
                                        <td class="text-gray-400 text-sm">${trade.date}</td>
                                    </tr>
                                `).join('')}
                                ${(!tradesWithUsers || tradesWithUsers.length === 0) ? '<tr><td colspan="7" class="text-center text-gray-500 py-8">No trades yet</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});
// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TradeVault running on port ${PORT}`);
});