"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const url_1 = require("url");
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const config = (0, kx_langchain_agent_runtime_1.createTestConfig)();
const dynamoService = new kx_langchain_agent_runtime_1.DynamoDBService(config);
const eventBridgeService = new kx_langchain_agent_runtime_1.EventBridgeService(config);
const agentService = new kx_langchain_agent_runtime_1.AgentService({ ...config, dynamoService, eventBridgeService });
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
const server = (0, http_1.createServer)(async (req, res) => {
    const url = new url_1.URL(req.url, `http://${req.headers.host}`);
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
                const response = await agentService.processMessage({
                    tenantId: 'dev-test',
                    email_lc: 'dev@example.com',
                    text: message,
                    source: 'chat',
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response }));
            }
            catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            }
        });
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Dev chat server running at http://localhost:${PORT}`);
    console.log('💡 Code changes will auto-reload the server');
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2LXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9kZXYtc2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQW9DO0FBRXBDLDZCQUEwQjtBQUMxQix1RkFBNkg7QUFFN0gsTUFBTSxNQUFNLEdBQUcsSUFBQSw2Q0FBZ0IsR0FBRSxDQUFDO0FBQ2xDLE1BQU0sYUFBYSxHQUFHLElBQUksNENBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksK0NBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDMUQsTUFBTSxZQUFZLEdBQUcsSUFBSSx5Q0FBWSxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsYUFBYSxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUV4RixNQUFNLElBQUksR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztRQTZETCxDQUFDO0FBRVQsTUFBTSxNQUFNLEdBQUcsSUFBQSxtQkFBWSxFQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7SUFDM0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUksRUFBRSxVQUFVLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUU1RCxJQUFJLEdBQUcsQ0FBQyxRQUFRLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDdkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNwRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xCLENBQUM7U0FBTSxJQUFJLEdBQUcsQ0FBQyxRQUFRLEtBQUssT0FBTyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDM0QsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2QsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksS0FBSyxDQUFDLENBQUM7UUFDdkMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDckIsSUFBSSxDQUFDO2dCQUNELE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUVyQyxNQUFNLFFBQVEsR0FBRyxNQUFNLFlBQVksQ0FBQyxjQUFjLENBQUM7b0JBQy9DLFFBQVEsRUFBRSxVQUFVO29CQUNwQixRQUFRLEVBQUUsaUJBQWlCO29CQUMzQixJQUFJLEVBQUUsT0FBTztvQkFDYixNQUFNLEVBQUUsTUFBTTtpQkFDakIsQ0FBQyxDQUFDO2dCQUVILEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztnQkFDM0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFDLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNiLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztnQkFDM0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqRyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO1NBQU0sQ0FBQztRQUNKLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN6QixDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFSCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7QUFDbEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQ3JCLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0RBQWtELElBQUksRUFBRSxDQUFDLENBQUM7SUFDdEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0FBQy9ELENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY3JlYXRlU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBVUkwgfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlLCBEeW5hbW9EQlNlcnZpY2UsIEV2ZW50QnJpZGdlU2VydmljZSwgY3JlYXRlVGVzdENvbmZpZyB9IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcblxuY29uc3QgY29uZmlnID0gY3JlYXRlVGVzdENvbmZpZygpO1xuY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbmNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcbmNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2UoeyAuLi5jb25maWcsIGR5bmFtb1NlcnZpY2UsIGV2ZW50QnJpZGdlU2VydmljZSB9KTtcblxuY29uc3QgaHRtbCA9IGBcbjwhRE9DVFlQRSBodG1sPlxuPGh0bWw+XG48aGVhZD5cbiAgICA8dGl0bGU+S3hHZW4gQWdlbnQgRGV2IENoYXQ8L3RpdGxlPlxuICAgIDxzdHlsZT5cbiAgICAgICAgYm9keSB7IGZvbnQtZmFtaWx5OiBBcmlhbCwgc2Fucy1zZXJpZjsgbWF4LXdpZHRoOiA4MDBweDsgbWFyZ2luOiAwIGF1dG87IHBhZGRpbmc6IDIwcHg7IH1cbiAgICAgICAgI2NoYXQgeyBib3JkZXI6IDFweCBzb2xpZCAjY2NjOyBoZWlnaHQ6IDQwMHB4OyBvdmVyZmxvdy15OiBhdXRvOyBwYWRkaW5nOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyB9XG4gICAgICAgICNpbnB1dCB7IHdpZHRoOiA3MCU7IHBhZGRpbmc6IDEwcHg7IH1cbiAgICAgICAgI3NlbmQgeyBwYWRkaW5nOiAxMHB4IDIwcHg7IH1cbiAgICAgICAgLm1lc3NhZ2UgeyBtYXJnaW46IDEwcHggMDsgfVxuICAgICAgICAudXNlciB7IGNvbG9yOiBibHVlOyB9XG4gICAgICAgIC5hZ2VudCB7IGNvbG9yOiBncmVlbjsgfVxuICAgICAgICAuZXJyb3IgeyBjb2xvcjogcmVkOyB9XG4gICAgPC9zdHlsZT5cbjwvaGVhZD5cbjxib2R5PlxuICAgIDxoMT7wn6SWIEt4R2VuIEFnZW50IERldiBDaGF0PC9oMT5cbiAgICA8ZGl2IGlkPVwiY2hhdFwiPjwvZGl2PlxuICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwiaW5wdXRcIiBwbGFjZWhvbGRlcj1cIlR5cGUgeW91ciBtZXNzYWdlLi4uXCIgLz5cbiAgICA8YnV0dG9uIGlkPVwic2VuZFwiPlNlbmQ8L2J1dHRvbj5cbiAgICBcbiAgICA8c2NyaXB0PlxuICAgICAgICBjb25zdCBjaGF0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NoYXQnKTtcbiAgICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKTtcbiAgICAgICAgY29uc3Qgc2VuZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZW5kJyk7XG4gICAgICAgIFxuICAgICAgICBmdW5jdGlvbiBhZGRNZXNzYWdlKHRleHQsIHR5cGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgZGl2LmNsYXNzTmFtZSA9ICdtZXNzYWdlICcgKyB0eXBlO1xuICAgICAgICAgICAgZGl2LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgICAgIGNoYXQuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICAgICAgICAgIGNoYXQuc2Nyb2xsVG9wID0gY2hhdC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIHNlbmRNZXNzYWdlKCkge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGlucHV0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICghbWVzc2FnZSkgcmV0dXJuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBhZGRNZXNzYWdlKCdZb3U6ICcgKyBtZXNzYWdlLCAndXNlcicpO1xuICAgICAgICAgICAgaW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCcvY2hhdCcsIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2UgfSlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgICAgICAgIGFkZE1lc3NhZ2UoJ/CfpJYgQWdlbnQ6ICcgKyBkYXRhLnJlc3BvbnNlLCAnYWdlbnQnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWRkTWVzc2FnZSgn4p2MIEVycm9yOiAnICsgZXJyb3IubWVzc2FnZSwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHNlbmQub25jbGljayA9IHNlbmRNZXNzYWdlO1xuICAgICAgICBpbnB1dC5vbmtleXByZXNzID0gKGUpID0+IGUua2V5ID09PSAnRW50ZXInICYmIHNlbmRNZXNzYWdlKCk7XG4gICAgICAgIGlucHV0LmZvY3VzKCk7XG4gICAgPC9zY3JpcHQ+XG48L2JvZHk+XG48L2h0bWw+YDtcblxuY29uc3Qgc2VydmVyID0gY3JlYXRlU2VydmVyKGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCEsIGBodHRwOi8vJHtyZXEuaGVhZGVycy5ob3N0fWApO1xuICAgIFxuICAgIGlmICh1cmwucGF0aG5hbWUgPT09ICcvJykge1xuICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvaHRtbCcgfSk7XG4gICAgICAgIHJlcy5lbmQoaHRtbCk7XG4gICAgfSBlbHNlIGlmICh1cmwucGF0aG5hbWUgPT09ICcvY2hhdCcgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgIGxldCBib2R5ID0gJyc7XG4gICAgICAgIHJlcS5vbignZGF0YScsIGNodW5rID0+IGJvZHkgKz0gY2h1bmspO1xuICAgICAgICByZXEub24oJ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBtZXNzYWdlIH0gPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgdGVuYW50SWQ6ICdkZXYtdGVzdCcsXG4gICAgICAgICAgICAgICAgICAgIGVtYWlsX2xjOiAnZGV2QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogbWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiAnY2hhdCcsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgcmVzcG9uc2UgfSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDUwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXMud3JpdGVIZWFkKDQwNCk7XG4gICAgICAgIHJlcy5lbmQoJ05vdCBmb3VuZCcpO1xuICAgIH1cbn0pO1xuXG5jb25zdCBQT1JUID0gMzAwMDtcbnNlcnZlci5saXN0ZW4oUE9SVCwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5qAIERldiBjaGF0IHNlcnZlciBydW5uaW5nIGF0IGh0dHA6Ly9sb2NhbGhvc3Q6JHtQT1JUfWApO1xuICAgIGNvbnNvbGUubG9nKCfwn5KhIENvZGUgY2hhbmdlcyB3aWxsIGF1dG8tcmVsb2FkIHRoZSBzZXJ2ZXInKTtcbn0pO1xuIl19