import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { OllamaConfig, Message } from '../types';
import { chatWithOllama } from '../lib/ollama';
import { db, LocalPDF } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';

interface AIAssistantProps {
  documentText: string;
  highlightedText: string;
  config: OllamaConfig;
  dbPdf?: LocalPDF | null;
}

export function AIAssistant({ documentText, highlightedText, config, dbPdf }: AIAssistantProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'explain' | 'summary'>('chat');
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // Explain state
  const [explanation, setExplanation] = useState('');
  
  // Summary state
  const [summary, setSummary] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chats and summary when active PDF changes
  useEffect(() => {
    if (dbPdf?.id) {
      setSummary(dbPdf.summary || '');
      db.messages.where('pdfId').equals(dbPdf.id).sortBy('timestamp').then(msgs => {
        setChatMessages(msgs.map(m => ({ role: m.role, content: m.content })));
      });
    } else {
      setChatMessages([]);
      setSummary('');
    }
    setExplanation('');
  }, [dbPdf?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, explanation, summary]);

  // When highlighted text changes and we are in explain tab, or user wants to explain
  useEffect(() => {
    if (highlightedText !== lastExplainedText.current) {
       setExplanation('');
    }
    if (highlightedText && activeTab === 'explain' && highlightedText !== lastExplainedText.current) {
      handleExplain();
    }
  }, [highlightedText, activeTab]);

  const handleChat = async () => {
    if (!chatInput.trim() || isProcessing) return;
    
    const userMessage = chatInput;
    setChatInput('');
    
    const newMessages: Message[] = [
      ...chatMessages, 
      { role: 'user', content: userMessage }
    ];
    
    setChatMessages(newMessages);
    
    // Save user message to DB immediately
    if (dbPdf?.id) {
      await db.messages.add({
        pdfId: dbPdf.id,
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      });
    }

    setIsProcessing(true);
    
    // Add assistant placeholder
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    
    let finalAssistantMessage = '';

    try {
      let systemPrompt = `You are a helpful AI assistant. Use the following document context to answer questions: \n\n---\n${documentText}\n---\nIf the answer is not in the context, say so.`;
      
      if (highlightedText) {
        systemPrompt += `\n\nThe user has currently highlighted the following text in the document. Pay special attention to it if their question refers to "this", "the highlight", or relates to it:\n"${highlightedText}"`;
      }

      const messagesWithContext: Message[] = [
        { role: 'system', content: systemPrompt },
        ...newMessages
      ];

      await chatWithOllama(config, messagesWithContext, (chunk) => {
        finalAssistantMessage = chunk;
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = chunk;
          return updated;
        });
      });
      
      // Save full assistant message when stream is finish
      if (dbPdf?.id && finalAssistantMessage) {
        await db.messages.add({
          pdfId: dbPdf.id,
          role: 'assistant',
          content: finalAssistantMessage,
          timestamp: Date.now()
        });
      }

    } catch (err) {
      console.error(err);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = 'Sorry, there was an error connecting to Ollama. Make sure it is running locally and CORS is configured.';
        return updated;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const lastExplainedText = useRef('');

  const handleExplain = async () => {
    if (!highlightedText || isProcessing) return;
    
    setIsProcessing(true);
    setExplanation('');
    lastExplainedText.current = highlightedText;
    
    try {
      const systemPrompt = `You are an expert reading assistant. Explain the following highlighted text simply and clearly. Use the surrounding document for context if needed.`;
      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please explain this text:\n\n"${highlightedText}"` }
      ];

      await chatWithOllama(config, messages, (chunk) => {
        setExplanation(chunk);
      });
    } catch (err) {
      setExplanation('Error generating explanation. Is Ollama running?');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSummarize = async () => {
    // If we already have a loaded summary and we are not forcing it, skip.
    // Assuming button allows re-generation if user clicks when summary is there?
    // The previous implementation generated summary if documentText & !summary.
    if (!documentText || isProcessing) return;
    
    setIsProcessing(true);
    setSummary('');
    let finalSummary = '';

    try {
      const messages: Message[] = [
        { role: 'system', content: 'You are an expert summarizer. Provide a concise but comprehensive summary of the provided entire document.' },
        { role: 'user', content: `Please summarize this document:\n\n${documentText.substring(0, 10000)}...` } 
      ];
      // Note: cutting off document at 10000 chars roughly to avoid exceeding context window for simple local models.

      await chatWithOllama(config, messages, (chunk) => {
        finalSummary = chunk;
        setSummary(chunk);
      });
      
      // Save summary to db
      if (dbPdf?.id) {
        await db.pdfs.update(dbPdf.id, { summary: finalSummary });
      }

    } catch (err) {
      setSummary('Error generating summary. Is Ollama running?');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 flex-1 min-w-0 transition-colors">
      <div className="flex border-b dark:border-gray-700 text-xs font-medium overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-3 text-center whitespace-nowrap transition-colors ${activeTab === 'chat' ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
        >
          Q&A
        </button>
        <button
          onClick={() => { setActiveTab('explain'); }}
          className={`px-4 py-3 text-center whitespace-nowrap transition-colors ${activeTab === 'explain' ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
        >
          Explain
        </button>
        <button
          onClick={() => {
            setActiveTab('summary');
            if (documentText && !summary && !isProcessing) handleSummarize();
          }}
          className={`px-4 py-3 text-center whitespace-nowrap transition-colors ${activeTab === 'summary' ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
        >
          Summary
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto space-y-4 mb-4 pr-2">
              {chatMessages.length === 0 ? (
                <div className="text-gray-400 text-center mt-10">
                  Ask questions about the document here.
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`p-3 rounded-lg max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white self-end ml-auto' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-transparent dark:border-gray-600 transition-colors'}`}>
                    <div className="text-xs opacity-75 mb-1">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                    <div className={`prose prose-sm max-w-none dark:prose-invert ${msg.role === 'user' ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="relative mt-auto flex flex-col">
              {highlightedText && (
                <div className="bg-blue-50/80 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 border-b-0 rounded-t-xl px-3 py-2 text-xs text-blue-800 dark:text-blue-300 flex items-center z-10 transition-all">
                  <span className="font-semibold mr-2 shrink-0">Selected text:</span>
                  <span className="truncate italic opacity-80 mr-2 border-blue-200 dark:border-blue-700 pr-2">"{highlightedText}"</span>
                </div>
              )}
              <div className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChat()}
                  placeholder="Ask about the document..."
                  className={`w-full pl-4 pr-12 py-3 border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:focus:border-transparent transition-colors ${highlightedText ? 'rounded-b-xl border-t-blue-200 dark:border-t-blue-800' : 'rounded-xl'}`}
                  disabled={isProcessing || !documentText}
                />
                <button
                  onClick={handleChat}
                  disabled={isProcessing || !documentText || !chatInput.trim()}
                  className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'explain' && (
          <div className="flex flex-col h-full">
            {highlightedText ? (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Highlighted Text</h3>
                <blockquote className="border-l-4 border-blue-500 pl-4 py-1 text-gray-700 dark:text-gray-300 italic bg-blue-50/50 dark:bg-blue-900/20 rounded-r-lg">
                  "{highlightedText}"
                </blockquote>
              </div>
            ) : (
              <div className="text-gray-400 text-center mt-10">
                Highlight text in the PDF to get an explanation.
              </div>
            )}
            
            {(explanation || isProcessing) && (
              <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border dark:border-gray-600 mt-2 transition-colors">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Explanation</h3>
                <div className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200">
                  {explanation ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                  ) : (
                    'Thinking...'
                  )}
                </div>
              </div>
            )}
            
            {highlightedText && (
              <button 
                onClick={handleExplain} 
                disabled={isProcessing}
                className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Generating...' : 'Re-explain'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="flex flex-col h-full">
            {!documentText ? (
              <div className="text-gray-400 text-center mt-10">
                Please upload a document first.
              </div>
            ) : summary || isProcessing ? (
              <div className="flex-1 overflow-auto">
                 <div className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200 leading-relaxed">
                  {summary ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                  ) : (
                    'Generating summary...'
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <button
                  onClick={handleSummarize}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm transition-colors"
                >
                  Generate Summary
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
