/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PDFViewer } from './components/PDFViewer';
import { AIAssistant } from './components/AIAssistant';
import { OllamaConfig } from './types';
import { fetchOllamaModels } from './lib/ollama';
import { Settings, FileText, Upload, Moon, Sun } from 'lucide-react';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<OllamaConfig>({
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2', // reasonable default
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  
  useEffect(() => {
    // Attempt to fetch models on load or baseUrl change
    fetchOllamaModels(config.baseUrl).then(models => {
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(config.model)) {
        setConfig(prev => ({ ...prev, model: models[0] }));
      }
    });
  }, [config.baseUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setFile(files[0]);
      setDocumentText('');
      setHighlightedText('');
    }
  };

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between shrink-0 transition-colors">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <FileText size={20} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Ollama PDF Reader</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium rounded-lg transition-colors">
            <Upload size={16} />
            <span>Upload PDF</span>
            <input 
              type="file" 
              accept="application/pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Ollama Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex gap-6 shrink-0 shadow-sm z-10 transition-colors">
          <div className="flex-1 max-w-sm">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Ollama API URL</label>
            <input 
              type="text" 
              value={config.baseUrl}
              onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors"
              placeholder="http://localhost:11434"
            />
          </div>
          <div className="flex-1 max-w-sm">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Model</label>
            {availableModels.length > 0 ? (
              <select 
                value={config.model}
                onChange={e => setConfig({ ...config, model: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors"
              >
                {availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input 
                type="text" 
                value={config.model}
                onChange={e => setConfig({ ...config, model: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors"
                placeholder="e.g. llama3"
              />
            )}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center max-w-md ml-auto">
            <p>Ensure Ollama is running locally with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code> to avoid CORS issues.</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Panel: PDF Viewer */}
        <section className="flex-1 flex flex-col min-w-0">
          <PDFViewer 
            file={file} 
            onTextExtracted={setDocumentText}
            onTextHighlighted={setHighlightedText}
          />
        </section>

        {/* Right Panel: AI Assistant */}
        <section className="w-[450px] shrink-0 flex flex-col min-w-0 shadow-sm">
          <AIAssistant 
            documentText={documentText}
            highlightedText={highlightedText}
            config={config}
          />
        </section>
      </main>
    </div>
  );
}
