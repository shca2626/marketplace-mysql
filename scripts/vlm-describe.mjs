import ZAI from 'z-ai-web-dev-sdk';
import fs from 'node:fs';

async function main() {
  const file = process.argv[2];
  const b64 = fs.readFileSync(file).toString('base64');
  const zai = await ZAI.create();
  const res = await zai.chat.completions.createVision({
    thinking: { type: 'disabled' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this UI screenshot in detail: what screen/section is shown, what controls are visible, what looks like a placeholder or unfinished flow. Be specific and concise.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  });
  console.log(res.choices[0]?.message?.content ?? 'NO CONTENT');
}
main().catch((e) => { console.error('VLM error:', e?.message ?? e); process.exit(1); });
