const socket = io();

let currentBot = null;

const mainPage = document.getElementById('main-page');
const botPage = document.getElementById('bot-page');
const botsList = document.getElementById('bots-list');
const createBotBtn = document.getElementById('create-bot-btn');
const createBotModal = document.getElementById('create-bot-modal');
const editBotModal = document.getElementById('edit-bot-modal');
const modalClose = document.querySelector('.modal-close');
const modalCloseEdit = document.querySelector('.modal-close-edit');
const createBotForm = document.getElementById('create-bot-form');
const editBotForm = document.getElementById('edit-bot-form');
const backBtn = document.getElementById('back-btn');
const deleteBtn = document.getElementById('delete-btn');
const botTitle = document.getElementById('bot-title');
const logsContainer = document.getElementById('logs-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const restartBtn = document.getElementById('restart-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const editBotBtn = document.getElementById('edit-bot-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const createModeSelect = document.getElementById('bot-mode');
const createSpammerOptions = document.getElementById('spammer-options');
const editModeSelect = document.getElementById('edit-bot-mode');
const editSpammerOptions = document.getElementById('edit-spammer-options');

const createJoinCommandCheckbox = document.getElementById('bot-join-command');
const createJoinCommandOptions = document.getElementById('join-command-options');
const editJoinCommandCheckbox = document.getElementById('edit-bot-join-command');
const editJoinCommandOptions = document.getElementById('edit-join-command-options');

createModeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'SPAMMER') {
        createSpammerOptions.style.display = 'block';
    } else {
        createSpammerOptions.style.display = 'none';
    }
});

editModeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'SPAMMER') {
        editSpammerOptions.style.display = 'block';
    } else {
        editSpammerOptions.style.display = 'none';
    }
});

createJoinCommandCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        createJoinCommandOptions.style.display = 'block';
    } else {
        createJoinCommandOptions.style.display = 'none';
    }
});

editJoinCommandCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        editJoinCommandOptions.style.display = 'block';
    } else {
        editJoinCommandOptions.style.display = 'none';
    }
});

document.body.addEventListener('click', (e) => {
    if (e.target.closest('.toggle-label')) {
        const label = e.target.closest('.toggle-label');
        const checkbox = label.querySelector('.toggle-checkbox');
        if (checkbox && e.target !== checkbox) {
            e.preventDefault();
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
});

createBotBtn.addEventListener('click', () => {
    createBotModal.style.display = 'flex';
});

modalClose.addEventListener('click', () => {
    createBotModal.style.display = 'none';
});

modalCloseEdit.addEventListener('click', () => {
    editBotModal.style.display = 'none';
});

cancelEditBtn.addEventListener('click', () => {
    editBotModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === createBotModal) {
        createBotModal.style.display = 'none';
    }
    if (e.target === editBotModal) {
        editBotModal.style.display = 'none';
    }
});

function showMainPage() {
    mainPage.style.display = 'block';
    botPage.style.display = 'none';
    currentBot = null;
    loadBots();
}

function showBotPage(botName) {
    mainPage.style.display = 'none';
    botPage.style.display = 'block';
    currentBot = botName;
    botTitle.textContent = botName;
    logsContainer.innerHTML = '';
    loadBotLogs();
    updateBotControls();
    updateBotInfo();
}

async function loadBotLogs() {
    if (!currentBot) return;
    try {
        const response = await fetch(`/api/bots/${currentBot}/logs`);
        const data = await response.json();
        logsContainer.innerHTML = '';
        data.logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.type}`;
            logEntry.textContent = `[${log.timestamp}] ${log.message}`;
            logsContainer.appendChild(logEntry);
        });
        logsContainer.scrollTop = logsContainer.scrollHeight;
    } catch (e) {
        console.error('Error loading logs:', e);
    }
}

async function loadBots() {
    try {
        const response = await fetch('/api/bots');
        const bots = await response.json();
        renderBots(bots);
    } catch (e) {
        console.error('Error loading bots:', e);
    }
}

function renderBots(bots) {
    botsList.innerHTML = '';
    bots.forEach(bot => {
        const card = document.createElement('div');
        card.className = `bot-card bot-${bot.state}`;
        const modeClass = bot.config.mode ? bot.config.mode.toLowerCase() : 'holder';
        const modeText = bot.config.mode || 'HOLDER';
        card.innerHTML = `
            <div class="bot-card-header">
                <span class="mode-badge ${modeClass}">${modeText}</span>
                <div class="bot-name">${bot.name}</div>
            </div>
            <div class="bot-status">${bot.state.toUpperCase()}</div>
        `;
        card.addEventListener('click', () => showBotPage(bot.name));
        botsList.appendChild(card);
    });
}

createBotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('bot-name').value.trim();
    const ip = document.getElementById('bot-ip').value.trim();
    const port = document.getElementById('bot-port').value.trim();
    const version = document.getElementById('bot-version').value;
    const reconnectSeconds = document.getElementById('bot-reconnect').value.trim();
    const jump = document.getElementById('bot-jump').checked;
    const sneak = document.getElementById('bot-sneak').checked;
    const mode = document.getElementById('bot-mode').value;
    const spammerMaxBots = document.getElementById('bot-spammer-max').value.trim();
    const spammerDelay = document.getElementById('bot-spammer-delay').value.trim();
    const joinCommandEnabled = document.getElementById('bot-join-command').checked;
    const joinCommandText = document.getElementById('bot-join-command-input').value.trim();
    
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        alert('Invalid bot name. Use only letters, numbers, hyphens, and underscores.');
        return;
    }
    
    if (!/^[A-Za-z0-9.-]+$/.test(ip)) {
        alert('Invalid IP address. Use only letters, numbers, and dots.');
        return;
    }
    
    if (!/^\d+$/.test(port)) {
        alert('Invalid port. Use only numbers.');
        return;
    }
    
    if (!/^\d+$/.test(reconnectSeconds)) {
        alert('Invalid reconnect seconds. Use only numbers.');
        return;
    }
    
    if (mode === 'SPAMMER') {
        if (!/^\d+$/.test(spammerMaxBots)) {
            alert('Invalid max bots. Use only numbers.');
            return;
        }
        if (!/^\d+$/.test(spammerDelay)) {
            alert('Invalid delay. Use only numbers.');
            return;
        }
    }
    
    try {
        const response = await fetch('/api/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                ip,
                port: parseInt(port),
                version,
                reconnectSeconds: parseInt(reconnectSeconds),
                antiAfk: { jump, sneak },
                mode,
                autoStart: false,
                spammerMaxBots: mode === 'SPAMMER' ? parseInt(spammerMaxBots) : undefined,
                spammerDelay: mode === 'SPAMMER' ? parseInt(spammerDelay) : undefined,
                joinCommand: {
                    enabled: joinCommandEnabled,
                    command: joinCommandEnabled ? joinCommandText : ''
                }
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            createBotForm.reset();
            document.getElementById('bot-port').value = '25565';
            document.getElementById('bot-reconnect').value = '10';
            document.getElementById('bot-version').value = '1.19.4';
            document.getElementById('bot-mode').value = 'HOLDER';
            document.getElementById('bot-spammer-max').value = '5';
            document.getElementById('bot-spammer-delay').value = '3';
            createSpammerOptions.style.display = 'none';
            createJoinCommandOptions.style.display = 'none';
            createBotModal.style.display = 'none';
            loadBots();
        } else {
            alert(result.error || 'Error creating bot');
        }
    } catch (e) {
        alert('Error creating bot: ' + e.message);
    }
});

editBotBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots');
        const bots = await response.json();
        const bot = bots.find(b => b.name === currentBot);
        
        if (bot) {
            document.getElementById('edit-bot-name').value = bot.config.name;
            document.getElementById('edit-bot-ip').value = bot.config.ip;
            document.getElementById('edit-bot-port').value = bot.config.port;
            document.getElementById('edit-bot-version').value = bot.config.version;
            document.getElementById('edit-bot-reconnect').value = bot.config.reconnectSeconds;
            document.getElementById('edit-bot-jump').checked = bot.config.antiAfk.jump;
            document.getElementById('edit-bot-sneak').checked = bot.config.antiAfk.sneak;
            document.getElementById('edit-bot-mode').value = bot.config.mode || 'HOLDER';
            
            if (bot.config.mode === 'SPAMMER') {
                document.getElementById('edit-bot-spammer-max').value = bot.config.spammerMaxBots || 5;
                document.getElementById('edit-bot-spammer-delay').value = bot.config.spammerDelay || 3;
                editSpammerOptions.style.display = 'block';
            } else {
                editSpammerOptions.style.display = 'none';
            }
            
            if (bot.config.joinCommand && bot.config.joinCommand.enabled) {
                document.getElementById('edit-bot-join-command').checked = true;
                document.getElementById('edit-bot-join-command-input').value = bot.config.joinCommand.command || '';
                editJoinCommandOptions.style.display = 'block';
            } else {
                document.getElementById('edit-bot-join-command').checked = false;
                document.getElementById('edit-bot-join-command-input').value = '';
                editJoinCommandOptions.style.display = 'none';
            }
            
            editBotModal.style.display = 'flex';
        }
    } catch (e) {
        alert('Error loading bot data: ' + e.message);
    }
});

editBotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newName = document.getElementById('edit-bot-name').value.trim();
    const ip = document.getElementById('edit-bot-ip').value.trim();
    const port = document.getElementById('edit-bot-port').value.trim();
    const version = document.getElementById('edit-bot-version').value;
    const reconnectSeconds = document.getElementById('edit-bot-reconnect').value.trim();
    const jump = document.getElementById('edit-bot-jump').checked;
    const sneak = document.getElementById('edit-bot-sneak').checked;
    const mode = document.getElementById('edit-bot-mode').value;
    const spammerMaxBots = document.getElementById('edit-bot-spammer-max').value.trim();
    const spammerDelay = document.getElementById('edit-bot-spammer-delay').value.trim();
    const joinCommandEnabled = document.getElementById('edit-bot-join-command').checked;
    const joinCommandText = document.getElementById('edit-bot-join-command-input').value.trim();
    
    if (!/^[A-Za-z0-9_-]+$/.test(newName)) {
        alert('Invalid bot name. Use only letters, numbers, hyphens, and underscores.');
        return;
    }
    
    if (!/^[A-Za-z0-9.-]+$/.test(ip)) {
        alert('Invalid IP address. Use only letters, numbers, and dots.');
        return;
    }
    
    if (!/^\d+$/.test(port)) {
        alert('Invalid port. Use only numbers.');
        return;
    }
    
    if (!/^\d+$/.test(reconnectSeconds)) {
        alert('Invalid reconnect seconds. Use only numbers.');
        return;
    }
    
    if (mode === 'SPAMMER') {
        if (!/^\d+$/.test(spammerMaxBots)) {
            alert('Invalid max bots. Use only numbers.');
            return;
        }
        if (!/^\d+$/.test(spammerDelay)) {
            alert('Invalid delay. Use only numbers.');
            return;
        }
    }
    
    try {
        const response = await fetch(`/api/bots/${currentBot}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                newName: newName !== currentBot ? newName : undefined,
                ip,
                port: parseInt(port),
                version,
                reconnectSeconds: parseInt(reconnectSeconds),
                antiAfk: { jump, sneak },
                mode,
                spammerMaxBots: mode === 'SPAMMER' ? parseInt(spammerMaxBots) : undefined,
                spammerDelay: mode === 'SPAMMER' ? parseInt(spammerDelay) : undefined,
                joinCommand: {
                    enabled: joinCommandEnabled,
                    command: joinCommandEnabled ? joinCommandText : ''
                }
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            editBotModal.style.display = 'none';
            
            if (result.newName && result.newName !== currentBot) {
                currentBot = result.newName;
                botTitle.textContent = result.newName;
                addLog('system', `Bot renamed to ${result.newName}. Restarting...`);
            } else {
                addLog('system', 'Bot settings updated. Restarting...');
            }
            
            updateBotInfo();
            loadBots();
        } else {
            alert(result.error || 'Error updating bot');
        }
    } catch (e) {
        alert('Error updating bot: ' + e.message);
    }
});

backBtn.addEventListener('click', showMainPage);

deleteBtn.addEventListener('click', async () => {
    if (!currentBot) return;
    
    const confirmed = confirm(`Czy na pewno chcesz usunąć bota "${currentBot}"?`);
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/bots/${currentBot}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMainPage();
        } else {
            alert(result.error || 'Error deleting bot');
        }
    } catch (e) {
        alert('Error deleting bot: ' + e.message);
    }
});

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentBot) return;
    
    try {
        await fetch(`/api/bots/${currentBot}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        chatInput.value = '';
    } catch (e) {
        addLog('error', 'Error sending message: ' + e.message);
    }
}

startBtn.addEventListener('click', async () => {
    if (!currentBot) return;
    try {
        await fetch(`/api/bots/${currentBot}/start`, { method: 'POST' });
    } catch (e) {
        addLog('error', 'Error starting bot: ' + e.message);
    }
});

stopBtn.addEventListener('click', async () => {
    if (!currentBot) return;
    try {
        addLog('system', 'Stopping bot...');
        await fetch(`/api/bots/${currentBot}/stop`, { method: 'POST' });
    } catch (e) {
        addLog('error', 'Error stopping bot: ' + e.message);
    }
});

restartBtn.addEventListener('click', async () => {
    if (!currentBot) return;
    try {
        addLog('system', 'Restarting bot...');
        await fetch(`/api/bots/${currentBot}/restart`, { method: 'POST' });
    } catch (e) {
        addLog('error', 'Error restarting bot: ' + e.message);
    }
});

clearLogsBtn.addEventListener('click', () => {
    logsContainer.innerHTML = '';
});

function addLog(type, message) {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

async function updateBotInfo() {
    try {
        const response = await fetch('/api/bots');
        const bots = await response.json();
        const bot = bots.find(b => b.name === currentBot);
        
        if (bot) {
            const statusText = document.getElementById('bot-status-text');
            statusText.textContent = bot.state.toUpperCase();
            statusText.style.color = bot.state === 'online' ? '#4a9b5f' : 
                                     bot.state === 'connecting' ? '#d4a02a' :
                                     bot.state === 'reconnecting' ? '#d4a02a' : '#c94449';
            
            const modeBadge = document.getElementById('bot-mode-badge');
            const modeText = bot.config.mode || 'HOLDER';
            const modeClass = modeText.toLowerCase();
            modeBadge.textContent = modeText;
            modeBadge.className = `mode-badge ${modeClass}`;
            
            document.getElementById('bot-info-ip').textContent = bot.config.ip;
            document.getElementById('bot-info-port').textContent = bot.config.port;
            document.getElementById('bot-info-version').textContent = bot.config.version;
            document.getElementById('bot-info-reconnect').textContent = bot.config.reconnectSeconds + 's';
            document.getElementById('bot-info-jump').textContent = bot.config.antiAfk.jump ? 'Yes' : 'No';
            document.getElementById('bot-info-sneak').textContent = bot.config.antiAfk.sneak ? 'Yes' : 'No';
            document.getElementById('bot-info-mode').textContent = modeText;
            
            const joinCommandInfo = document.getElementById('join-command-info');
            if (bot.config.joinCommand && bot.config.joinCommand.enabled) {
                joinCommandInfo.style.display = 'block';
                document.getElementById('bot-info-join-command').textContent = bot.config.joinCommand.command || '-';
            } else {
                joinCommandInfo.style.display = 'none';
            }
            
            const spammerInfo = document.getElementById('spammer-info');
            if (bot.config.mode === 'SPAMMER') {
                spammerInfo.style.display = 'block';
                document.getElementById('bot-info-max-bots').textContent = bot.config.spammerMaxBots || 5;
                document.getElementById('bot-info-delay').textContent = (bot.config.spammerDelay || 3) + 's';
            } else {
                spammerInfo.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Error updating bot info:', e);
    }
}

function updateBotControls() {
    fetch('/api/bots')
        .then(res => res.json())
        .then(bots => {
            const bot = bots.find(b => b.name === currentBot);
            if (bot) {
                const isOnline = bot.state === 'online' || bot.state === 'connecting';
                const isReconnecting = bot.state === 'reconnecting';
                
                startBtn.disabled = isOnline || isReconnecting;
                stopBtn.disabled = bot.state === 'offline';
                restartBtn.disabled = bot.state === 'offline';
                
                startBtn.style.opacity = (isOnline || isReconnecting) ? '0.5' : '1';
                stopBtn.style.opacity = bot.state === 'offline' ? '0.5' : '1';
                restartBtn.style.opacity = bot.state === 'offline' ? '0.5' : '1';
            }
        });
}

socket.on('bot-log', (data) => {
    if (currentBot === data.name) {
        addLog(data.type, data.message);
    }
});

socket.on('bot-chat', (data) => {
    if (currentBot === data.name) {
        addLog('chat', data.message);
    }
});

socket.on('bot-state-changed', (data) => {
    if (currentBot === data.name) {
        updateBotControls();
        updateBotInfo();
    }
    if (mainPage.style.display !== 'none') {
        loadBots();
    }
});

socket.on('bot-list-updated', () => {
    if (mainPage.style.display !== 'none') {
        loadBots();
    }
});

loadBots();