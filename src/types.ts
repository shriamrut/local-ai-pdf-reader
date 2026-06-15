export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}
