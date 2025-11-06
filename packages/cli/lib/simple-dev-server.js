"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const aws_1 = require("@langchain/aws");
// Simple direct Bedrock call - no DynamoDB, no persistence
const model = new aws_1.ChatBedrockConverse({
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
const server = (0, http_1.createServer)(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }
    else if (url.pathname === '/chat' && req.method === 'POST') {
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
            }
            catch (error) {
                console.error('Error:', error);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            }
        });
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLWRldi1zZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2ltcGxlLWRldi1zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBb0M7QUFDcEMsd0NBQXFEO0FBRXJELDJEQUEyRDtBQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLHlCQUFtQixDQUFDO0lBQ3BDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLHlDQUF5QztJQUNoRixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztJQUM3QyxXQUFXLEVBQUUsR0FBRztJQUNoQixTQUFTLEVBQUUsSUFBSTtDQUNoQixDQUFDLENBQUM7QUFFSCxNQUFNLElBQUksR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1FBaUZMLENBQUM7QUFFVCxNQUFNLE1BQU0sR0FBRyxJQUFBLG1CQUFZLEVBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtJQUMzQyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBSSxFQUFFLFVBQVUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBRTVELElBQUksR0FBRyxDQUFDLFFBQVEsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN2QixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEIsQ0FBQztTQUFNLElBQUksR0FBRyxDQUFDLFFBQVEsS0FBSyxPQUFPLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUMzRCxJQUFJLElBQUksR0FBRyxFQUFFLENBQUM7UUFDZCxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsQ0FBQztRQUN2QyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyQixJQUFJLENBQUM7Z0JBQ0QsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBRTFDLG9DQUFvQztnQkFDcEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFFbkQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDYixPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDL0IsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pHLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7U0FBTSxDQUFDO1FBQ0osR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQixHQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQztBQUNsQixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7SUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5REFBeUQsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM3RSxPQUFPLENBQUMsR0FBRyxDQUFDLHVFQUF1RSxDQUFDLENBQUM7SUFDckYsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0FBQy9ELENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY3JlYXRlU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBDaGF0QmVkcm9ja0NvbnZlcnNlIH0gZnJvbSAnQGxhbmdjaGFpbi9hd3MnO1xuXG4vLyBTaW1wbGUgZGlyZWN0IEJlZHJvY2sgY2FsbCAtIG5vIER5bmFtb0RCLCBubyBwZXJzaXN0ZW5jZVxuY29uc3QgbW9kZWwgPSBuZXcgQ2hhdEJlZHJvY2tDb252ZXJzZSh7XG4gIG1vZGVsOiBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEIHx8ICdhbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjAnLFxuICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gIHRlbXBlcmF0dXJlOiAwLjcsXG4gIG1heFRva2VuczogMTAwMCxcbn0pO1xuXG5jb25zdCBodG1sID0gYFxuPCFET0NUWVBFIGh0bWw+XG48aHRtbD5cbjxoZWFkPlxuICAgIDx0aXRsZT5LeEdlbiBBZ2VudCBTaW1wbGUgQ2hhdDwvdGl0bGU+XG4gICAgPHN0eWxlPlxuICAgICAgICBib2R5IHsgZm9udC1mYW1pbHk6IEFyaWFsLCBzYW5zLXNlcmlmOyBtYXgtd2lkdGg6IDgwMHB4OyBtYXJnaW46IDAgYXV0bzsgcGFkZGluZzogMjBweDsgfVxuICAgICAgICAjY2hhdCB7IGJvcmRlcjogMXB4IHNvbGlkICNjY2M7IGhlaWdodDogNDAwcHg7IG92ZXJmbG93LXk6IGF1dG87IHBhZGRpbmc6IDEwcHg7IG1hcmdpbi1ib3R0b206IDEwcHg7IGJhY2tncm91bmQ6ICNmOWY5Zjk7IH1cbiAgICAgICAgI2lucHV0IHsgd2lkdGg6IDcwJTsgcGFkZGluZzogMTBweDsgZm9udC1zaXplOiAxNnB4OyB9XG4gICAgICAgICNzZW5kIHsgcGFkZGluZzogMTBweCAyMHB4OyBmb250LXNpemU6IDE2cHg7IH1cbiAgICAgICAgLm1lc3NhZ2UgeyBtYXJnaW46IDEwcHggMDsgcGFkZGluZzogOHB4OyBib3JkZXItcmFkaXVzOiA0cHg7IH1cbiAgICAgICAgLnVzZXIgeyBiYWNrZ3JvdW5kOiAjZTNmMmZkOyBjb2xvcjogIzE1NjVjMDsgfVxuICAgICAgICAuYWdlbnQgeyBiYWNrZ3JvdW5kOiAjZThmNWU4OyBjb2xvcjogIzJlN2QzMjsgfVxuICAgICAgICAuZXJyb3IgeyBiYWNrZ3JvdW5kOiAjZmZlYmVlOyBjb2xvcjogI2M2MjgyODsgfVxuICAgICAgICAubG9hZGluZyB7IGJhY2tncm91bmQ6ICNmZmYzZTA7IGNvbG9yOiAjZWY2YzAwOyB9XG4gICAgPC9zdHlsZT5cbjwvaGVhZD5cbjxib2R5PlxuICAgIDxoMT7wn6SWIEt4R2VuIEFnZW50IFNpbXBsZSBDaGF0PC9oMT5cbiAgICA8cD5EaXJlY3QgQmVkcm9jayBjb25uZWN0aW9uIC0gbm8gcGVyc2lzdGVuY2U8L3A+XG4gICAgPGRpdiBpZD1cImNoYXRcIj48L2Rpdj5cbiAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBpZD1cImlucHV0XCIgcGxhY2Vob2xkZXI9XCJUeXBlIHlvdXIgbWVzc2FnZSBhbmQgcHJlc3MgRW50ZXIuLi5cIiAvPlxuICAgIDxidXR0b24gaWQ9XCJzZW5kXCI+U2VuZDwvYnV0dG9uPlxuICAgIFxuICAgIDxzY3JpcHQ+XG4gICAgICAgIGNvbnN0IGNoYXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hhdCcpO1xuICAgICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpO1xuICAgICAgICBjb25zdCBzZW5kID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlbmQnKTtcbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIGFkZE1lc3NhZ2UodGV4dCwgdHlwZSkge1xuICAgICAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBkaXYuY2xhc3NOYW1lID0gJ21lc3NhZ2UgJyArIHR5cGU7XG4gICAgICAgICAgICBkaXYuaW5uZXJIVE1MID0gdGV4dDtcbiAgICAgICAgICAgIGNoYXQuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICAgICAgICAgIGNoYXQuc2Nyb2xsVG9wID0gY2hhdC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgICAgICByZXR1cm4gZGl2O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBhc3luYyBmdW5jdGlvbiBzZW5kTWVzc2FnZSgpIHtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBpbnB1dC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIW1lc3NhZ2UpIHJldHVybjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYWRkTWVzc2FnZSgnPHN0cm9uZz5Zb3U6PC9zdHJvbmc+ICcgKyBtZXNzYWdlLCAndXNlcicpO1xuICAgICAgICAgICAgaW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgbG9hZGluZ0RpdiA9IGFkZE1lc3NhZ2UoJ/CfpJQgQWdlbnQgaXMgdGhpbmtpbmcuLi4nLCAnbG9hZGluZycpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJy9jaGF0Jywge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG4gICAgICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZSB9KVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICAgICAgbG9hZGluZ0Rpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBhZGRNZXNzYWdlKCc8c3Ryb25nPuKdjCBFcnJvcjo8L3N0cm9uZz4gJyArIGRhdGEuZXJyb3IsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZE1lc3NhZ2UoJzxzdHJvbmc+8J+kliBBZ2VudDo8L3N0cm9uZz4gJyArIGRhdGEucmVzcG9uc2UsICdhZ2VudCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgbG9hZGluZ0Rpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICBhZGRNZXNzYWdlKCc8c3Ryb25nPuKdjCBOZXR3b3JrIEVycm9yOjwvc3Ryb25nPiAnICsgZXJyb3IubWVzc2FnZSwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHNlbmQub25jbGljayA9IHNlbmRNZXNzYWdlO1xuICAgICAgICBpbnB1dC5vbmtleXByZXNzID0gKGUpID0+IHtcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBzZW5kTWVzc2FnZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpbnB1dC5mb2N1cygpO1xuICAgICAgICBcbiAgICAgICAgLy8gQWRkIGluaXRpYWwgbWVzc2FnZVxuICAgICAgICBhZGRNZXNzYWdlKCfwn5GLIFdlbGNvbWUhIFR5cGUgYSBtZXNzYWdlIHRvIGNoYXQgd2l0aCB0aGUgTGFuZ0NoYWluIGFnZW50LicsICdhZ2VudCcpO1xuICAgIDwvc2NyaXB0PlxuPC9ib2R5PlxuPC9odG1sPmA7XG5cbmNvbnN0IHNlcnZlciA9IGNyZWF0ZVNlcnZlcihhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwhLCBgaHR0cDovLyR7cmVxLmhlYWRlcnMuaG9zdH1gKTtcbiAgICBcbiAgICBpZiAodXJsLnBhdGhuYW1lID09PSAnLycpIHtcbiAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2h0bWwnIH0pO1xuICAgICAgICByZXMuZW5kKGh0bWwpO1xuICAgIH0gZWxzZSBpZiAodXJsLnBhdGhuYW1lID09PSAnL2NoYXQnICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICBsZXQgYm9keSA9ICcnO1xuICAgICAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiBib2R5ICs9IGNodW5rKTtcbiAgICAgICAgcmVxLm9uKCdlbmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgbWVzc2FnZTonLCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBEaXJlY3QgQmVkcm9jayBjYWxsIC0gbm8gRHluYW1vREJcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG1vZGVsLmludm9rZShtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnQmVkcm9jayByZXNwb25zZTonLCByZXNwb25zZS5jb250ZW50KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyByZXNwb25zZTogcmVzcG9uc2UuY29udGVudCB9KSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXMud3JpdGVIZWFkKDQwNCk7XG4gICAgICAgIHJlcy5lbmQoJ05vdCBmb3VuZCcpO1xuICAgIH1cbn0pO1xuXG5jb25zdCBQT1JUID0gMzAwMTtcbnNlcnZlci5saXN0ZW4oUE9SVCwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5qAIFNpbXBsZSBkZXYgY2hhdCBzZXJ2ZXIgcnVubmluZyBhdCBodHRwOi8vbG9jYWxob3N0OiR7UE9SVH1gKTtcbiAgICBjb25zb2xlLmxvZygn8J+SoSBUaGlzIGJ5cGFzc2VzIGFsbCBEeW5hbW9EQi9wZXJzaXN0ZW5jZSAtIGp1c3QgZGlyZWN0IEJlZHJvY2sgY2FsbHMnKTtcbiAgICBjb25zb2xlLmxvZygn8J+UpyBNYWtlIHN1cmUgQVdTIGNyZWRlbnRpYWxzIGFyZSBjb25maWd1cmVkJyk7XG59KTtcbiJdfQ==