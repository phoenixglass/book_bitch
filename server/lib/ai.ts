import Anthropic from '@anthropic-ai/sdk';

export interface AIConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export function getAIConfig(): AIConfig | null {
  const provider = (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai';

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return null;
    const model = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
    return { provider: 'anthropic', model, apiKey };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    const model = process.env.AI_MODEL || 'gpt-4o-mini';
    const baseUrl = process.env.AI_BASE_URL?.trim();
    return { provider: 'openai', model, apiKey, baseUrl };
  }

  return null;
}

export async function callAI(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (config.provider === 'anthropic') {
    const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: config.apiKey };
    if (config.baseUrl) clientOpts.baseURL = config.baseUrl;
    const client = new Anthropic(clientOpts);
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from Anthropic');
    return block.text;
  }

  if (config.provider === 'openai') {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}

export function extractJSON(rawText: string): unknown {
  const text = rawText.trim();

  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // Strip markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  // Find first {...} or [...]
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      return JSON.parse(text.slice(objStart, objEnd + 1));
    } catch {
      // fall through
    }
  }

  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1));
    } catch {
      // fall through
    }
  }

  throw new Error('Could not extract valid JSON from AI response');
}
