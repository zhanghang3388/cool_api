export default function DocsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-display font-bold mb-6">API Documentation</h1>

      <div className="space-y-6">
        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">Base URL</h2>
          <code className="block bg-bg-primary px-4 py-2 rounded font-code text-sm text-accent">
            {window.location.origin}/v1
          </code>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">Authentication</h2>
          <p className="text-sm text-text-secondary mb-3">
            All API requests require a relay key in the Authorization header.
          </p>
          <pre className="bg-bg-primary px-4 py-3 rounded font-code text-xs overflow-x-auto">
{`Authorization: Bearer sk-cool-your-key-here`}
          </pre>
        </section>

        <section className="card">
          <h2 className="font-display text-lg font-semibold mb-3">Chat Completions</h2>
          <p className="text-sm text-text-secondary mb-3">
            Compatible with the OpenAI Chat Completions API format.
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
          <h2 className="font-display text-lg font-semibold mb-3">Streaming</h2>
          <p className="text-sm text-text-secondary mb-3">
            Set <code className="text-accent font-code">"stream": true</code> to receive Server-Sent Events.
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
          <h2 className="font-display text-lg font-semibold mb-3">List Models</h2>
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
          <h2 className="font-display text-lg font-semibold mb-3">SDK Compatibility</h2>
          <p className="text-sm text-text-secondary mb-3">
            Use any OpenAI-compatible SDK by changing the base URL.
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
