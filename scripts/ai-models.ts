// Lists the Gemini models your key can use, and suggests one for reading invoices.
//   npm run ai-models
// It prints model names only. It never prints your key.
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) loadEnvFile('.env');
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('GEMINI_API_KEY is not set in .env'); process.exit(1); }

try {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) { console.log(`Google answered ${res.status}. ${res.status === 400 || res.status === 403 ? 'The key looks wrong or not enabled.' : ''}`); process.exit(1); }
  const data: any = await res.json();
  const ok = (data.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => String(m.name).replace(/^models\//, ''));
  console.log(`Models your key can use (${ok.length}):\n` + ok.map((n: string) => '  ' + n).join('\n'));
  const text = ok.filter((n: string) => !/(image|tts|live|embed|audio|robotics|computer|deep|veo|imagen|native|gemma|learnlm|aqa)/i.test(n));
  const pick = text.find((n: string) => /flash-lite/.test(n) && !/(preview|exp)/.test(n)) ?? text.find((n: string) => /flash/.test(n) && !/(preview|exp)/.test(n)) ?? text.find((n: string) => /flash/.test(n)) ?? text[0];
  console.log(pick ? `\nSuggested line for your .env file:\nGEMINI_MODEL=${pick}` : '\nNo suitable model found for this key.');
} catch (e: any) {
  console.log('Could not reach Google: ' + String(e?.cause?.code ?? e?.message ?? e).slice(0, 100));
  process.exit(2);
}
