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
    const { userId, symbol, date, type, session, entry, exit, quantity, stopLoss, takeProfit, strategy, holding_period, notes, trade_tag } = req.body;
    
    const { data, error } = await supabase
        .from('trades')
        .insert([{
            user_id: userId,
            symbol, date, type, session,
            entry, exit, quantity,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            strategy, holding_period, notes,
            trade_tag: trade_tag
        }])
        .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
});

// ============ UPDATE TRADE ============
app.put('/api/trades/:id/screenshot', async (req, res) => {
    const { id } = req.params;
    const { screenshot } = req.body;
    
    // Allow null to clear screenshot
    const { error } = await supabase
        .from('trades')
        .update({ screenshot: screenshot === null ? null : screenshot })
        .eq('id', id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Screenshot updated' });
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
// Endpoint to save a screenshot URL for a specific trade
app.put('/api/trades/:id', async (req, res) => {
    const { symbol, date, type, session, entry, exit, quantity, stop_loss, take_profit, strategy, holding_period, notes, screenshot, trade_tag } = req.body;
    
    const { error } = await supabase
        .from('trades')
        .update({ 
            symbol, date, type, session, entry, exit, quantity, 
            stop_loss, take_profit, strategy, holding_period, notes, 
            screenshot, trade_tag 
        })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ updated: true });
});
// ============ ADMIN DASHBOARD (Password Protected) ============
app.get('/admin', async (req, res) => {
    // Get password from URL
    const userPassword = req.query.password;
    const adminPassword = 'Hq5kmw@5756'; // Change this to your own password
    
    // If no password or wrong password, show login form
    if (userPassword !== adminPassword) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Login - TradeVault</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
            </head>
            <body class="bg-gray-900 text-white">
                <div class="container mx-auto px-6 py-20 max-w-md">
                    <div class="bg-gray-800 rounded-xl p-8 border border-gray-700">
                        <div class="text-center mb-6">
                            <i class="fas fa-lock text-4xl text-purple-500 mb-3"></i>
                            <h1 class="text-2xl font-bold">Admin Access</h1>
                            <p class="text-gray-400 mt-2">Enter password to continue</p>
                        </div>
                        <form method="GET" action="/admin">
                            <input type="password" name="password" placeholder="Enter admin password" class="w-full bg-gray-700 border-gray-600 rounded-lg p-3 mb-4 text-white focus:outline-none focus:border-purple-500">
                            <button type="submit" class="w-full bg-purple-600 hover:bg-purple-700 rounded-lg p-3 font-semibold transition">
                                <i class="fas fa-sign-in-alt mr-2"></i>Login
                            </button>
                        </form>
                        <p class="text-gray-500 text-xs text-center mt-4">Unauthorized access is prohibited</p>
                    </div>
                </div>
            </body>
            </html>
        `);
        return;
    }
    
    // ============ ADMIN DASHBOARD CONTENT (Only visible with correct password) ============
    
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
    
    // P&L calculation function
    function calcPnL(entry, exit, quantity, symbol, type) {
        const specs = {'EURUSD':0.00001,'GBPUSD':0.00001,'AUDUSD':0.00001,'USDJPY':0.001,'XAUUSD':0.01};
        const tickSize = specs[symbol] || 0.01;
        let diff = type === 'Long' ? exit - entry : entry - exit;
        return (diff / tickSize) * quantity;
    }
    
    // Format date functions
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }
    
    function formatDateTime(dateStr) {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        // Kenya timezone (UTC+3)
        const kenyaTime = new Date(d.getTime() + (3 * 60 * 60 * 1000));
        const hours = String(kenyaTime.getUTCHours()).padStart(2, '0');
        const minutes = String(kenyaTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(kenyaTime.getUTCSeconds()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }
    
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
                .min-w-800 { min-width: 800px; }
            </style>
        </head>
        <body class="text-gray-200">
            <div class="container mx-auto px-6 py-8 max-w-7xl">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h1 class="text-3xl font-bold">Admin Dashboard</h1>
                        <p class="text-gray-500 mt-1">Monitor users and trading activity</p>
                    </div>
                    <div class="flex space-x-3">
                        <a href="/dashboard.html" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition border border-gray-700">
                            <i class="fas fa-chart-line mr-2"></i>Go to App
                        </a>
                        <a href="/admin?password=${adminPassword}" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition border border-gray-700">
                            <i class="fas fa-sync-alt mr-2"></i>Refresh
                        </a>
                    </div>
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
                        <table class="w-full">
                            <thead class="bg-gray-800">
                                <tr>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">ID</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Password</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Signup Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(users || []).map(user => `
                                    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td class="p-3 text-sm">${user.id}</td>
                                        <td class="p-3 text-sm font-medium text-white">${user.username}</span></td>
                                        <td class="p-3 text-sm text-gray-400">••••••••</td>
                                        <td class="p-3 text-sm text-gray-400">${formatDateTime(user.created_at)}</td>
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
                        <table class="w-full min-w-[900px]">
                            <thead class="bg-gray-800">
                                <tr>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">User</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Symbol</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Type</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Session</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Entry</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Exit</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">SL</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">TP</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Lot Size</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">P&L</th>
                                    <th class="p-3 text-left text-xs font-semibold text-gray-400 uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(tradesWithUsers || []).slice(0, 20).map(trade => {
                                    const pnl = calcPnL(trade.entry, trade.exit, trade.quantity, trade.symbol, trade.type);
                                    return `
                                        <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td class="p-3 text-sm font-medium text-white">${escapeHtml(trade.username)}</td>
                                            <td class="p-3 text-sm text-gray-300">${escapeHtml(trade.symbol)}</td>
                                            <td class="p-3 text-sm ${trade.type === 'Long' ? 'text-green-500' : 'text-red-500'} font-medium">${trade.type}</td>
                                            <td class="p-3 text-sm text-gray-300">${escapeHtml(trade.session || '-')}</td>
                                            <td class="p-3 text-sm text-gray-300">${trade.entry}</td>
                                            <td class="p-3 text-sm text-gray-300">${trade.exit}</td>
                                            <td class="p-3 text-sm text-gray-300">${trade.stop_loss || '-'}</td>
                                            <td class="p-3 text-sm text-gray-300">${trade.take_profit || '-'}</td>
                                            <td class="p-3 text-sm text-gray-300">${trade.quantity}</td>
                                            <td class="p-3 text-sm ${pnl >= 0 ? 'text-green-500' : 'text-red-500'} font-bold">$${pnl.toFixed(2)}</td>
                                            <td class="p-3 text-sm text-gray-400">${formatDate(trade.date)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                                ${(!tradesWithUsers || tradesWithUsers.length === 0) ? '<tr><td colspan="11" class="text-center text-gray-500 py-8">No trades yet</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TradeVault running on port ${PORT}`);
});