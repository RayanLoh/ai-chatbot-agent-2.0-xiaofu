import React, { useState } from 'react';
import api from './api'; // 引入刚才配置好的 api

function Chat() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);

    const handleSend = async () => {
        if (!input) return;

        // 1. 添加用户消息到 UI
        const userMsg = { sender: "user", text: input };
        setMessages(prev => [...prev, userMsg]);

        try {
            // 2. 调用 Colab 后端
            // 注意这里的路径要和你 FastAPI 里的 @app.post("/generate") 对应
            const response = await api.post('/generate', { prompt: input });

            // 3. 添加小芙的消息到 UI
            const botMsg = { sender: "bot", text: response.data.text };
            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            console.error("连接失败:", error);
            alert("小芙暂时掉线了，请检查 Colab 是否在运行！");
        }
        
        setInput("");
    };

    return (
        <div className="chat-container">
            <div className="messages">
                {messages.map((m, i) => (
                    <div key={i} className={m.sender}>{m.text}</div>
                ))}
            </div>
            <input value={input} onChange={(e) => setInput(e.target.value)} />
            <button onClick={handleSend}>发送</button>
        </div>
    );
}

export default Chat;