export const getApiBase = () => {
  let apiBase = (import.meta.env.VITE_API_BASE || "").trim();
  if (apiBase && !apiBase.startsWith('http')) {
    apiBase = `https://${apiBase}`;
  }
  // In development, you might want to fall back to a local proxy
  if (!apiBase) {
    apiBase = 'http://localhost:8000'; // Or whatever your local backend port is
  }
  return apiBase;
};

const getAuthHeader = () => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Generic fetch wrapper to handle errors and JSON parsing
const fetchApi = async (url, options) => {
  const apiBase = getApiBase();
  try {
    const response = await fetch(`${apiBase}${url}`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error(`API call to ${url} failed:`, error);
    throw error;
  }
};

export const getConversations = async () => {
  return fetchApi('/conversations', {
    headers: getAuthHeader(),
  });
};

export const createConversation = async (title = "new conversation") => {
  return fetchApi('/conversations', {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ title }),
  });
};

export const getConversationMessages = async (conversationId) => {
  return fetchApi(`/conversations/${conversationId}`, {
    headers: getAuthHeader(),
  });
};

export const deleteConversation = async (conversationId) => {
  return fetchApi(`/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
};

export const generateResponse = async (prompt, conversationId, model, signal) => {
    const apiBase = getApiBase();
    // This function uses fetch directly to handle streaming responses in the future if needed,
    // and for direct access to the response object.
    const response = await fetch(`${apiBase}/generate`, {
      method: "POST",
      headers: getAuthHeader(),
      body: JSON.stringify({
        prompt: prompt,
        conversation_id: conversationId,
        model_name: model
      }),
      signal, // Pass the abort signal
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
};

export const stopGeneration = async () => {
  return fetchApi('/stop', {
    method: 'POST',
    headers: getAuthHeader(),
  });
};

export const updateConversationTitle = async (conversationId, newTitle) => {
  return fetchApi(`/conversations/${conversationId}`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: JSON.stringify({ title: newTitle }),
  });
};
