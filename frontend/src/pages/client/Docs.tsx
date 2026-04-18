import { useTranslation } from 'react-i18next';

export default function DocsPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-display font-bold mb-6">{t('client.docs.title')}</h1>

      <div className="space-y-6">
        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.baseUrl')}</h2>
          <code className="block bg-bg-primary px-4 py-2 rounded font-code text-sm text-accent">
            {window.location.origin}/v1
          </code>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.authentication')}</h2>
          <p className="text-sm text-text-secondary mb-3">
            {t('client.docs.authenticationDesc')}
          </p>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`Authorization: Bearer sk-cool-your-key-here`}
          </pre>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.chatCompletions')}</h2>
          <p className="text-sm text-text-secondary mb-3">
            {t('client.docs.chatCompletionsDesc')}
          </p>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`POST /v1/chat/completions

{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000
}`}
          </pre>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.streaming')}</h2>
          <p className="text-sm text-text-secondary mb-3">
            {t('client.docs.streamingDesc')}
          </p>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`curl ${window.location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer sk-cool-xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hi"}],
    "stream": true
  }'`}
          </pre>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.listModels')}</h2>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`GET /v1/models

Response:
{
  "object": "list",
  "data": [
    {"id": "gpt-4o", "object": "model", "owned_by": "cool-api"},
    ...
  ]
}`}
          </pre>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">{t('client.docs.sdkCompatibility')}</h2>
          <p className="text-sm text-text-secondary mb-3">
            {t('client.docs.sdkCompatibilityDesc')}
          </p>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`# Python (openai SDK)
from openai import OpenAI

client = OpenAI(
    api_key="sk-cool-your-key",
    base_url="${window.location.origin}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)`}
          </pre>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto mt-3">
{`// Node.js (openai SDK)
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-cool-your-key',
  baseURL: '${window.location.origin}/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});`}
          </pre>
        </section>
      </div>
    </div>
  );
}
