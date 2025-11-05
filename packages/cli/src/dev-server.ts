import { createServer } from 'http';
import { readFileSync } from 'fs';
import { URL } from 'url';
import { AgentService, DynamoDBService, EventBridgeService, createTestConfig } from '@toldyaonce/kx-langchain-agent-runtime';

const config = createTestConfig();
const dynamoService = new DynamoDBService(config);
const eventBridgeService = new EventBridgeService(config);
const agentService = new AgentService({ ...config, dynamoService, eventBridgeService });

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>KxGen Agent Dev Chat</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        #chat { border: 1px solid #ccc; height: 400px; overflow-y: auto; padding: 10px; margin-bottom: 10px; }
        #input { width: 70%; padding: 10px; }
        #send { padding: 10px 20px; }
        .message { margin: 10px 0; }
        .user { color: blue; }
        .agent { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>🤖 KxGen Agent Dev Chat</h1>
    <div id="chat"></div>
    <input type="text" id="input" placeholder="Type your message..." />
    <button id="send">Send</button>
    
    <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const send = document.getElementById('send');
        
        function addMessage(text, type) {
            const div = document.createElement('div');
            div.className = 'message ' + type;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        async function sendMessage() {
            const message = input.value.trim();
            if (!message) return;
            
            addMessage('You: ' + message, 'user');
            input.value = '';
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                addMessage('🤖 Agent: ' + data.response, 'agent');
            } catch (error) {
                addMessage('❌ Error: ' + error.message, 'error');
            }
        }
        
        send.onclick = sendMessage;
        input.onkeypress = (e) => e.key === 'Enter' && sendMessage();
        input.focus();
    </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } else if (url.pathname === '/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message } = JSON.parse(body);
                
                const response = await agentService.processMessage({
                    tenantId: 'dev-test',
                    email_lc: 'dev@example.com',
                    text: message,
                    source: 'chat',
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Dev chat server running at http://localhost:${PORT}`);
    console.log('💡 Code changes will auto-reload the server');
});
