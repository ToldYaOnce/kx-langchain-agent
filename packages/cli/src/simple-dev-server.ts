import { createServer } from 'http';
import { ChatBedrockConverse } from '@langchain/aws';

// Simple direct Bedrock call - no DynamoDB, no persistence
const model = new ChatBedrockConverse({
  model: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
  temperature: 0.7,
  maxTokens: 1000,
});

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>KxGen Agent Simple Chat</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        #chat { border: 1px solid #ccc; height: 400px; overflow-y: auto; padding: 10px; margin-bottom: 10px; background: #f9f9f9; }
        #input { width: 70%; padding: 10px; font-size: 16px; }
        #send { padding: 10px 20px; font-size: 16px; }
        .message { margin: 10px 0; padding: 8px; border-radius: 4px; }
        .user { background: #e3f2fd; color: #1565c0; }
        .agent { background: #e8f5e8; color: #2e7d32; }
        .error { background: #ffebee; color: #c62828; }
        .loading { background: #fff3e0; color: #ef6c00; }
    </style>
</head>
<body>
    <h1>🤖 KxGen Agent Simple Chat</h1>
    <p>Direct Bedrock connection - no persistence</p>
    <div id="chat"></div>
    <input type="text" id="input" placeholder="Type your message and press Enter..." />
    <button id="send">Send</button>
    
    <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const send = document.getElementById('send');
        
        function addMessage(text, type) {
            const div = document.createElement('div');
            div.className = 'message ' + type;
            div.innerHTML = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }
        
        async function sendMessage() {
            const message = input.value.trim();
            if (!message) return;
            
            addMessage('<strong>You:</strong> ' + message, 'user');
            input.value = '';
            
            const loadingDiv = addMessage('🤔 Agent is thinking...', 'loading');
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                loadingDiv.remove();
                
                if (data.error) {
                    addMessage('<strong>❌ Error:</strong> ' + data.error, 'error');
                } else {
                    addMessage('<strong>🤖 Agent:</strong> ' + data.response, 'agent');
                }
            } catch (error) {
                loadingDiv.remove();
                addMessage('<strong>❌ Network Error:</strong> ' + error.message, 'error');
            }
        }
        
        send.onclick = sendMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        };
        input.focus();
        
        // Add initial message
        addMessage('👋 Welcome! Type a message to chat with the LangChain agent.', 'agent');
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
                console.log('Received message:', message);
                
                // Direct Bedrock call - no DynamoDB
                const response = await model.invoke(message);
                console.log('Bedrock response:', response.content);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response: response.content }));
            } catch (error) {
                console.error('Error:', error);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Simple dev chat server running at http://localhost:${PORT}`);
    console.log('💡 This bypasses all DynamoDB/persistence - just direct Bedrock calls');
    console.log('🔧 Make sure AWS credentials are configured');
});
