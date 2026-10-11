import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
const b64 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1790628791046.png').toString('base64');
const zai = await ZAI.create();
const r = await zai.chat.completions.createVision({
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'Describe this screenshot exhaustively. It is likely a DNS management or hosting control panel. Report: (1) the product/panel name, (2) every column header visible, (3) EVERY existing DNS record row visible with its Type, Name/Host, Value/Target and TTL exactly as shown, (4) every button, dropdown option and menu text visible, (5) any error or status messages.' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } }
  ] }],
  thinking: { type: 'disabled' }
});
const out = r.choices[0]?.message?.content || 'NO CONTENT';
fs.writeFileSync('/home/z/my-project/db/vlm-image-analysis.json', JSON.stringify({ description: out }, null, 2));
console.log(out);
