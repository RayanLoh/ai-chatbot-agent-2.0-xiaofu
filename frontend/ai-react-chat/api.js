// src/api.js
import axios from 'axios';

// 每次运行 Colab 后，把最新的 ngrok 链接填在这里
const NGROK_URL = "https://hearselike-jake-overconscientiously.ngrok-free.dev"; 

const api = axios.create({
    baseURL: NGROK_URL,
    headers: {
        'Content-Type': 'application/json',
        // 关键：跳过 Ngrok 的蓝色警告页，否则 React 会报错
        'ngrok-skip-browser-warning': '69420', 
    }
});

export default api;