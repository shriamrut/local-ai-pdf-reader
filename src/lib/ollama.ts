import { OllamaConfig, Message } from '../types';

export async function chatWithOllama(
  config: OllamaConfig,
  messages: Message[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        stream: !!onChunk,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (onChunk && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n').filter((l) => l.trim().length > 0);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullResponse += parsed.message.content;
              onChunk(fullResponse);
            }
          } catch (e) {
            console.error('Error parsing chunk', e);
          }
        }
      }
      return fullResponse;
    } else {
      const data = await response.json();
      return data.message?.content || '';
    }
  } catch (error) {
    console.error('Error communicating with Ollama:', error);
    throw error;
  }
}

export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (error) {
    console.error('Failed to fetch models from Ollama:', error);
    return [];
  }
}
