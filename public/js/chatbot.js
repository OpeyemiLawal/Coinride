(function() {
  const openButton = document.getElementById('aiChatBtn');
  const panel = document.getElementById('aiChatPanel');
  const closeButton = document.getElementById('aiChatCloseBtn');
  const form = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const messages = document.getElementById('aiChatMessages');

  if (!openButton || !panel || !closeButton || !form || !input || !messages) return;

  function openChat() {
    panel.classList.remove('hidden');
    input.focus();
  }

  function closeChat() {
    panel.classList.add('hidden');
    openButton.focus();
  }

  function addMessage(text, role) {
    const message = document.createElement('div');
    message.className = 'ai-chat-message ai-chat-message-' + role;
    message.textContent = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function setSending(isSending) {
    input.disabled = isSending;
    form.querySelector('button[type="submit"]').disabled = isSending;
  }

  async function sendMessage(text) {
    const message = text.trim();
    if (!message) return;
    addMessage(message, 'user');
    input.value = '';
    setSending(true);
    const typing = document.createElement('div');
    typing.className = 'ai-chat-message ai-chat-message-assistant ai-chat-typing';
    typing.textContent = 'CoinRide AI is thinking...';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'CoinRide AI could not answer right now.');
      typing.remove();
      addMessage(data.reply, 'assistant');
    } catch (error) {
      typing.remove();
      addMessage(error.message || 'CoinRide AI could not answer right now.', 'assistant');
    } finally {
      setSending(false);
      input.focus();
    }
  }

  openButton.addEventListener('click', openChat);
  closeButton.addEventListener('click', closeChat);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });
  panel.querySelectorAll('[data-ai-prompt]').forEach((button) => {
    button.addEventListener('click', () => sendMessage(button.dataset.aiPrompt || ''));
  });
})();
