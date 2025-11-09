const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mineflayer = require('mineflayer');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const BOTS_DIR = path.join(__dirname, 'public', 'bots');

app.use(express.json());
app.use(express.static('public'));

const bots = new Map();
const botLogs = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;

function setBotStopping(name, isStopping) {
    const botData = bots.get(name);
    if (botData) {
        botData.isStopping = isStopping;
    }
}

function addBotLog(name, type, message) {
    if (!botLogs.has(name)) {
        botLogs.set(name, []);
    }
    const timestamp = new Date().toLocaleTimeString();
    botLogs.get(name).push({ type, message, timestamp });
    io.emit('bot-log', { name, type, message });
}

fs.ensureDirSync(BOTS_DIR);

function loadBots() {
    const files = fs.readdirSync(BOTS_DIR).filter(f => f.endsWith('.json'));
    files.forEach(file => {
        try {
            const data = fs.readFileSync(path.join(BOTS_DIR, file), 'utf8');
            const config = JSON.parse(data);
            bots.set(config.name, {
                config,
                instance: null,
                instances: [],
                state: 'offline',
                antiAfkTimers: {},
                reconnectAttempts: 0,
                isStopping: false,
                spammerConnecting: false
            });
            if (config.autoStart) {
                startBot(config.name);
            }
        } catch (e) {
            console.error(`Error loading bot ${file}:`, e.message);
        }
    });
}

function validateBotName(name) {
    return /^[A-Za-z0-9_-]+$/.test(name);
}

function startBot(name) {
    const botData = bots.get(name);
    if (!botData) return;

    const { config } = botData;

    if (config.mode === 'SPAMMER') {
        startSpammerBots(name);
    } else {
        startHolderBot(name);
    }
}

function startHolderBot(name) {
    const botData = bots.get(name);
    if (!botData || botData.instance) return;

    const { config } = botData;
    
    try {
        const bot = mineflayer.createBot({
            host: config.ip,
            port: config.port,
            username: config.name,
            version: config.version
        });

        botData.instance = bot;
        botData.state = 'connecting';
        io.emit('bot-state-changed', { name, state: 'connecting' });

        bot.on('login', () => {
            botData.state = 'online';
            botData.reconnectAttempts = 0;
            io.emit('bot-state-changed', { name, state: 'online' });
            addBotLog(name, 'system', 'Bot connected successfully');
            
            if (config.antiAfk.jump) {
                botData.antiAfkTimers.jump = setInterval(() => {
                    if (bot && bot.entity) {
                        bot.setControlState('jump', true);
                        setTimeout(() => bot.setControlState('jump', false), 100);
                    }
                }, 600);
            }
            
            if (config.antiAfk.sneak) {
                bot.setControlState('sneak', true);
            }
        });

        bot.on('message', (jsonMsg) => {
            let message;
            try {
                const parsed = JSON.parse(JSON.stringify(jsonMsg));
                
                if (parsed.unsigned && parsed.unsigned.with && parsed.unsigned.with[0] && parsed.unsigned.with[0].extra) {
                    const extra = parsed.unsigned.with[0].extra;
                    let username = 'Unknown';
                    let text = '';
                    
                    for (let i = 0; i < extra.length; i++) {
                        if (extra[i].color === 'white' && extra[i].text && !extra[i].text.includes(':')) {
                            username = extra[i].text;
                        }
                        if (extra[i].text && extra[i].text.startsWith(':')) {
                            text = extra[i].text.substring(2);
                        }
                    }
                    
                    message = `<${username}> ${text}`;
                } else if (parsed.translate === 'chat.type.text' && parsed.with && parsed.with.length >= 2) {
                    const username = typeof parsed.with[0] === 'string' ? parsed.with[0] : (parsed.with[0].text || parsed.with[0].insertion || 'Unknown');
                    const text = typeof parsed.with[1] === 'string' ? parsed.with[1] : (parsed.with[1].text || 'Unknown');
                    message = `<${username}> ${text}`;
                } else {
                    message = jsonMsg.toString();
                    message = message.replace(/§[0-9a-fk-or]/gi, '');
                }
            } catch (e) {
                message = jsonMsg.toString();
                message = message.replace(/§[0-9a-fk-or]/gi, '');
            }
            addBotLog(name, 'chat', message);
        });

        bot.on('error', (err) => {
            addBotLog(name, 'error', err.message);
        });

        bot.on('kicked', (reason) => {
            addBotLog(name, 'error', `Kicked: ${reason}`);
            handleDisconnect(name);
        });

        bot.on('end', () => {
            addBotLog(name, 'system', 'Bot disconnected');
            handleDisconnect(name);
        });

    } catch (e) {
        addBotLog(name, 'error', e.message);
        botData.state = 'offline';
        io.emit('bot-state-changed', { name, state: 'offline' });
    }
}

function startSpammerBots(name) {
    const botData = bots.get(name);
    if (!botData || botData.spammerConnecting) return;

    const { config } = botData;
    
    botData.instances = [];
    botData.spammerConnecting = true;
    botData.state = 'connecting';
    io.emit('bot-state-changed', { name, state: 'connecting' });

    let connectedCount = 0;
    let totalBots = 0;
    const maxBots = config.spammerMaxBots || 5;
    const delay = (config.spammerDelay || 3) * 1000;

    const connectBot = (index) => {
        if (index >= maxBots || botData.isStopping) {
            if (index >= maxBots) {
                botData.spammerConnecting = false;
                if (connectedCount > 0) {
                    botData.state = 'online';
                    io.emit('bot-state-changed', { name, state: 'online' });
                    addBotLog(name, 'system', `Connected ${connectedCount}/${maxBots} bots successfully`);
                } else {
                    botData.state = 'offline';
                    io.emit('bot-state-changed', { name, state: 'offline' });
                    addBotLog(name, 'error', 'Failed to connect any bots');
                }
            }
            return;
        }

        try {
            const botUsername = `${config.name}_${index + 1}`;
            totalBots++;
            
            addBotLog(name, 'system', `Connecting ${botUsername}... (${totalBots}/${maxBots})`);
            
            const bot = mineflayer.createBot({
                host: config.ip,
                port: config.port,
                username: botUsername,
                version: config.version
            });

            botData.instances.push(bot);

            let botConnected = false;
            let botErrored = false;

            bot.on('login', () => {
                if (botConnected || botErrored) return;
                botConnected = true;
                connectedCount++;
                addBotLog(name, 'system', `${botUsername} connected successfully (${connectedCount}/${maxBots})`);
                
                if (config.antiAfk.jump) {
                    const jumpTimer = setInterval(() => {
                        if (bot && bot.entity) {
                            bot.setControlState('jump', true);
                            setTimeout(() => bot.setControlState('jump', false), 100);
                        }
                    }, 600);
                    if (!botData.antiAfkTimers.jump) {
                        botData.antiAfkTimers.jump = [];
                    }
                    botData.antiAfkTimers.jump.push(jumpTimer);
                }
                
                if (config.antiAfk.sneak) {
                    bot.setControlState('sneak', true);
                }

                setTimeout(() => connectBot(index + 1), delay);
            });

            bot.on('message', (jsonMsg) => {
                let message;
                try {
                    const parsed = JSON.parse(JSON.stringify(jsonMsg));
                    
                    if (parsed.unsigned && parsed.unsigned.with && parsed.unsigned.with[0] && parsed.unsigned.with[0].extra) {
                        const extra = parsed.unsigned.with[0].extra;
                        let username = 'Unknown';
                        let text = '';
                        
                        for (let i = 0; i < extra.length; i++) {
                            if (extra[i].color === 'white' && extra[i].text && !extra[i].text.includes(':')) {
                                username = extra[i].text;
                            }
                            if (extra[i].text && extra[i].text.startsWith(':')) {
                                text = extra[i].text.substring(2);
                            }
                        }
                        
                        message = `<${username}> ${text}`;
                    } else if (parsed.translate === 'chat.type.text' && parsed.with && parsed.with.length >= 2) {
                        const username = typeof parsed.with[0] === 'string' ? parsed.with[0] : (parsed.with[0].text || parsed.with[0].insertion || 'Unknown');
                        const text = typeof parsed.with[1] === 'string' ? parsed.with[1] : (parsed.with[1].text || 'Unknown');
                        message = `<${username}> ${text}`;
                    } else {
                        message = jsonMsg.toString();
                        message = message.replace(/§[0-9a-fk-or]/gi, '');
                    }
                } catch (e) {
                    message = jsonMsg.toString();
                    message = message.replace(/§[0-9a-fk-or]/gi, '');
                }
                addBotLog(name, 'chat', `[${botUsername}] ${message}`);
            });

            bot.on('error', (err) => {
                if (botErrored) return;
                botErrored = true;
                addBotLog(name, 'error', `[${botUsername}] ${err.message}`);
                if (!botConnected) {
                    setTimeout(() => connectBot(index + 1), delay);
                }
            });

            bot.on('kicked', (reason) => {
                addBotLog(name, 'error', `[${botUsername}] Kicked: ${reason}`);
                if (!botConnected) {
                    setTimeout(() => connectBot(index + 1), delay);
                }
            });

            bot.on('end', () => {
                if (!botConnected && !botErrored) {
                    addBotLog(name, 'system', `[${botUsername}] disconnected before login`);
                    setTimeout(() => connectBot(index + 1), delay);
                }
            });

        } catch (e) {
            addBotLog(name, 'error', `Error creating bot ${index + 1}: ${e.message}`);
            setTimeout(() => connectBot(index + 1), delay);
        }
    };

    connectBot(0);
}

function handleDisconnect(name) {
    const botData = bots.get(name);
    if (!botData) return;

    clearAntiAfkTimers(name);
    botData.instance = null;
    botData.state = 'offline';
    io.emit('bot-state-changed', { name, state: 'offline' });

    if (botData.isStopping) {
        botData.isStopping = false;
        return;
    }

    if (botData.config.reconnectSeconds > 0 && botData.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        if (botData.reconnectAttempts > 0) {
            addBotLog(name, 'system', `Reconnect attempt ${botData.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${botData.config.reconnectSeconds}s`);
        } else {
            addBotLog(name, 'system', `Reconnecting in ${botData.config.reconnectSeconds}s`);
        }
        setTimeout(() => {
            if (bots.has(name) && !bots.get(name).instance && !bots.get(name).isStopping) {
                botData.reconnectAttempts++;
                startBot(name);
            }
        }, botData.config.reconnectSeconds * 1000);
    } else if (botData.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        addBotLog(name, 'error', 'Max reconnect attempts reached. Bot stopped.');
        botData.reconnectAttempts = 0;
    }
}

function stopBot(name) {
    const botData = bots.get(name);
    if (!botData) return;

    clearAntiAfkTimers(name);
    botData.reconnectAttempts = 0;
    botData.isStopping = true;
    botData.spammerConnecting = false;
    
    if (botData.config.mode === 'SPAMMER') {
        botData.instances.forEach(bot => {
            try {
                if (bot && bot.entity) {
                    if (botData.config.antiAfk.sneak) {
                        bot.setControlState('sneak', false);
                    }
                    bot.quit();
                }
            } catch (e) {
                console.error('Error quitting bot:', e);
            }
        });
        botData.instances = [];
    } else {
        if (botData.config.antiAfk.sneak && botData.instance) {
            botData.instance.setControlState('sneak', false);
        }
        if (botData.instance) {
            botData.instance.quit();
        }
        botData.instance = null;
    }
    
    botData.state = 'offline';
    botData.isStopping = false;
    io.emit('bot-state-changed', { name, state: 'offline' });
}

function clearAntiAfkTimers(name) {
    const botData = bots.get(name);
    if (botData) {
        if (Array.isArray(botData.antiAfkTimers.jump)) {
            botData.antiAfkTimers.jump.forEach(timer => clearInterval(timer));
            botData.antiAfkTimers.jump = [];
        } else if (botData.antiAfkTimers.jump) {
            clearInterval(botData.antiAfkTimers.jump);
            botData.antiAfkTimers.jump = null;
        }
    }
}

app.get('/api/bots', (req, res) => {
    const botList = Array.from(bots.entries()).map(([name, data]) => ({
        name,
        state: data.state,
        config: data.config
    }));
    res.json(botList);
});

app.get('/api/bots/:name/logs', (req, res) => {
    const { name } = req.params;
    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    const logs = botLogs.get(name) || [];
    res.json({ logs });
});

app.post('/api/bots', (req, res) => {
    const { name, ip, port, version, reconnectSeconds, antiAfk, mode, autoStart, spammerMaxBots, spammerDelay } = req.body;

    if (!validateBotName(name)) {
        return res.status(400).json({ error: 'Invalid bot name' });
    }

    if (!/^[A-Za-z0-9.]+$/.test(ip)) {
        return res.status(400).json({ error: 'Invalid IP address' });
    }

    if (!/^\d+$/.test(String(port))) {
        return res.status(400).json({ error: 'Invalid port' });
    }

    const config = {
        name,
        ip,
        port: parseInt(port),
        version,
        reconnectSeconds: parseInt(reconnectSeconds) || 0,
        antiAfk: antiAfk || { jump: false, sneak: false },
        mode: mode || 'HOLDER',
        autoStart: autoStart || false,
        spammerMaxBots: mode === 'SPAMMER' ? (parseInt(spammerMaxBots) || 5) : undefined,
        spammerDelay: mode === 'SPAMMER' ? (parseInt(spammerDelay) || 3) : undefined
    };

    const filePath = path.join(BOTS_DIR, `${name}.json`);
    
    if (fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'Bot already exists' });
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        bots.set(name, {
            config,
            instance: null,
            instances: [],
            state: 'offline',
            antiAfkTimers: {},
            reconnectAttempts: 0,
            isStopping: false,
            spammerConnecting: false
        });
        io.emit('bot-list-updated');
        res.json({ success: true, bot: config });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/bots/:name', (req, res) => {
    const { name } = req.params;
    const { newName, ip, port, version, reconnectSeconds, antiAfk, mode, spammerMaxBots, spammerDelay } = req.body;

    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    if (newName && newName !== name) {
        if (!validateBotName(newName)) {
            return res.status(400).json({ error: 'Invalid new bot name' });
        }
        const newFilePath = path.join(BOTS_DIR, `${newName}.json`);
        if (fs.existsSync(newFilePath)) {
            return res.status(400).json({ error: 'Bot with new name already exists' });
        }
    }

    if (!/^[A-Za-z0-9.]+$/.test(ip)) {
        return res.status(400).json({ error: 'Invalid IP address' });
    }

    if (!/^\d+$/.test(String(port))) {
        return res.status(400).json({ error: 'Invalid port' });
    }

    const botData = bots.get(name);
    const oldConfig = botData.config;
    const finalName = newName || name;

    const newConfig = {
        name: finalName,
        ip,
        port: parseInt(port),
        version,
        reconnectSeconds: parseInt(reconnectSeconds) || 0,
        antiAfk: antiAfk || { jump: false, sneak: false },
        mode: mode || 'HOLDER',
        autoStart: oldConfig.autoStart,
        spammerMaxBots: mode === 'SPAMMER' ? (parseInt(spammerMaxBots) || 5) : undefined,
        spammerDelay: mode === 'SPAMMER' ? (parseInt(spammerDelay) || 3) : undefined
    };

    const oldFilePath = path.join(BOTS_DIR, `${name}.json`);
    const newFilePath = path.join(BOTS_DIR, `${finalName}.json`);

    try {
        if (newName && newName !== name) {
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
            
            const oldLogs = botLogs.get(name) || [];
            botLogs.set(finalName, oldLogs);
            botLogs.delete(name);
            
            bots.delete(name);
            bots.set(finalName, {
                config: newConfig,
                instance: null,
                instances: [],
                state: 'offline',
                antiAfkTimers: {},
                reconnectAttempts: 0,
                isStopping: false,
                spammerConnecting: false
            });
        } else {
            botData.config = newConfig;
        }

        fs.writeFileSync(newFilePath, JSON.stringify(newConfig, null, 2));
        
        if (botData.instance || botData.instances.length > 0) {
            botData.isStopping = true;
            stopBot(name);
            setTimeout(() => {
                const currentBotData = bots.get(finalName);
                if (currentBotData) {
                    currentBotData.isStopping = false;
                    startBot(finalName);
                }
            }, 1000);
        }

        io.emit('bot-list-updated');
        res.json({ success: true, bot: newConfig, newName: finalName });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/bots/:name', (req, res) => {
    const { name } = req.params;

    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    const botData = bots.get(name);
    
    if (botData.instance || botData.instances.length > 0) {
        stopBot(name);
    }

    const filePath = path.join(BOTS_DIR, `${name}.json`);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        bots.delete(name);
        botLogs.delete(name);
        
        io.emit('bot-list-updated');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/bots/:name/start', (req, res) => {
    const { name } = req.params;
    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    startBot(name);
    res.json({ success: true });
});

app.post('/api/bots/:name/stop', (req, res) => {
    const { name } = req.params;
    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    stopBot(name);
    res.json({ success: true });
});

app.post('/api/bots/:name/restart', (req, res) => {
    const { name } = req.params;
    if (!bots.has(name)) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    const botData = bots.get(name);
    botData.isStopping = true;
    botData.reconnectAttempts = 0;
    stopBot(name);
    setTimeout(() => {
        botData.isStopping = false;
        startBot(name);
    }, botData.config.reconnectSeconds * 1000);
    res.json({ success: true });
});

app.post('/api/bots/:name/chat', (req, res) => {
    const { name } = req.params;
    const { message } = req.body;
    
    const botData = bots.get(name);
    if (!botData) {
        return res.status(400).json({ error: 'Bot not found' });
    }

    try {
        if (botData.config.mode === 'SPAMMER') {
            botData.instances.forEach(bot => {
                if (bot && bot.entity) {
                    bot.chat(message);
                }
            });
        } else {
            if (!botData.instance) {
                return res.status(400).json({ error: 'Bot not running' });
            }
            botData.instance.chat(message);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

loadBots();

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});