const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://openrouter.ai/api/v1/models';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'models.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ai-token-prices/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse response')); }
      });
    }).on('error', reject);
  });
}

function formatPrice(priceStr) {
  if (!priceStr || priceStr === '-1' || priceStr === '0') return null;
  const perToken = parseFloat(priceStr);
  if (isNaN(perToken) || perToken <= 0) return null;
  return perToken * 1000000;
}

function providerFromId(id) {
  return id.split('/')[0] || 'unknown';
}

function modelName(name) {
  return name.replace(/\(.*?\)/g, '').trim();
}

async function main() {
  console.log('Fetching models from OpenRouter...');
  const data = await fetch(API_URL);
  const raw = data.data || data;

  const models = raw
    .filter(m => {
      const pPrompt = parseFloat(m.pricing?.prompt);
      const pComp = parseFloat(m.pricing?.completion);
      return (pPrompt > 0 || pComp > 0) && m.id !== 'openrouter/auto';
    })
    .map(m => {
      const promptPrice = formatPrice(m.pricing?.prompt);
      const completionPrice = formatPrice(m.pricing?.completion);
      const avgPrice = (promptPrice && completionPrice)
        ? ((promptPrice + completionPrice) / 2)
        : (promptPrice || completionPrice || 0);

      return {
        id: m.id,
        name: modelName(m.name || m.id),
        provider: providerFromId(m.id),
        created: m.created || 0,
        contextLength: m.context_length || m.top_provider?.context_length || 0,
        maxCompletionTokens: m.top_provider?.max_completion_tokens || null,
        pricing: {
          promptPer1M: promptPrice ? Math.round(promptPrice * 100) / 100 : null,
          completionPer1M: completionPrice ? Math.round(completionPrice * 100) / 100 : null,
          avgPer1M: Math.round(avgPrice * 100) / 100
        },
        architecture: m.architecture?.modality || 'text->text',
        multimodal: (m.architecture?.input_modalities || []).some(mod => mod !== 'text'),
        description: (m.description || '').slice(0, 200)
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  const output = {
    updatedAt: new Date().toISOString(),
    total: models.length,
    models
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Saved ${models.length} models to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
