import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import api from '@/api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PlaygroundPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [models, setModels] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load available models
    fetch('/v1/models')
      .then(r => r.json())
      .then(data => {
        if (data.data) {
          setModels(data.data.map((m: any) => m.id));
          if (data.data.length > 0) setModel(data.data[0].id);
        }
      })
      .catch(() => {});

    // Load first relay key
    api.get('/client/keys').then(({ data }) => {
      if (data.length > 0) {
        setApiKey(data[0].key_prefix);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const send = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreamText('');

    try {
      const resp = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${err}` }]);
        setLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullText += content;
                  setStreamText(fullText);
                }
              } catch {}
            }
          }
        }
      }

      setMessages([...newMessages, { role: 'assistant', content: fullText || '(empty response)' }]);
      setStreamText('');
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display font-bold">{t('client.playground.title')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="input-field w-48 text-xs"
          >
            {models.length > 0 ? (
              models.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value={model}>{model}</option>
            )}
          </select>
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="input-field w-64 font-code text-xs"
            placeholder={t('client.playground.apiKeyPlaceholder')}
          />
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-bg-secondary p-4 space-y-4 mb-4">
        {messages.length === 0 && !streamText && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            {t('client.playground.startChat')}
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-accent/10 text-text-primary'
                : 'bg-bg-tertiary text-text-primary'
            }`}>
              {msg.content}
            </div>
          </motion.div>
        ))}

        {streamText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="max-w-[80%] px-4 py-3 rounded-xl text-sm bg-bg-tertiary text-text-primary whitespace-pre-wrap">
              {streamText}
              <span className="inline-block w-2 h-4 bg-accent ml-0.5 animate-pulse" />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          className="input-field flex-1"
          placeholder={t('client.playground.messagePlaceholder')}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
