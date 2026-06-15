/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PDFViewer } from './components/PDFViewer';
import { AIAssistant } from './components/AIAssistant';
import { Library } from './components/Library';
import { OllamaConfig } from './types';
import { fetchOllamaModels } from './lib/ollama';
import { db, LocalPDF } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings, FileText, Upload, Moon, Sun, ArrowLeft } from 'lucide-react';

export default function App() {
  const [activePdf, setActivePdf] = useState<LocalPDF | null>(null);
  const [pdfFileObj, setPdfFileObj] = useState<File | Blob | null>(null);
  
  const [documentText, setDocumentText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<OllamaConfig>({
    baseUrl: 'http://localhost:11434',
    model: 'llama3', // reasonable default, updated below if doesn't exist
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  
  // Fetch all PDFs from the local IndexedDB
  const savedPdfs = useLiveQuery(() => db.pdfs.orderBy('lastOpenedAt').reverse().toArray());
  
  useEffect(() => {
    // Attempt to fetch models on load or baseUrl change
    fetchOllamaModels(config.baseUrl).then(models => {
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(config.model)) {
        setConfig(prev => ({ ...prev, model: models[0] }));
      }
    });
  }, [config.baseUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      const buffer = await file.arrayBuffer();
      
      // Compute a basic hash using filename, size, and modified date to prevent duplicates
      const fileHash = `${file.name}-${file.size}-${file.lastModified}`;
      
      // Check if it already exists
      const existing = await db.pdfs.where('hash').equals(fileHash).first();
      
      let openedPdf: LocalPDF;
      if (existing) {
        openedPdf = existing;
        await db.pdfs.update(existing.id!, { lastOpenedAt: Date.now() });
      } else {
        const newPdf: LocalPDF = {
          hash: fileHash,
          name: file.name,
          data: buffer,
          addedAt: Date.now(),
          lastOpenedAt: Date.now(),
          lastPage: 1
        };
        const id = await db.pdfs.add(newPdf);
        openedPdf = { ...newPdf, id: id as number };
      }
      
      openPdfView(openedPdf);
    }
  };

  const openPdfView = (pdf: LocalPDF) => {
    // We create a blob from the stored arrayBuffer to pass into react-pdf
    const blob = new Blob([pdf.data], { type: 'application/pdf' });
    setPdfFileObj(blob);
    setActivePdf(pdf);
    setDocumentText('');
    setHighlightedText('');
    
    if (pdf.id) {
       db.pdfs.update(pdf.id, { lastOpenedAt: Date.now() });
    }
  };

  const closePdfView = () => {
    setActivePdf(null);
    setPdfFileObj(null);
    setDocumentText('');
    setHighlightedText('');
  };

  const handleDeletePdf = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this document from your local library?")) {
      await db.pdfs.delete(id);
      await db.messages.where('pdfId').equals(id).delete();
    }
  };

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between shrink-0 transition-colors">
        <div className="flex items-center gap-2">
          {activePdf && (
            <button 
              onClick={closePdfView}
              className="mr-2 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Back to Library"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <FileText size={20} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight hidden sm:block">
            {activePdf ? activePdf.name : 'Local AI PDF Reader (LAIPR)'}
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
            <Upload size={16} />
            <span className="hidden sm:inline">Upload PDF</span>
            <input 
              type="file" 
              accept="application/pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
              key={activePdf ? activePdf.id : 'upload'} // clear value on change
            />
          </label>
          
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
          
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
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex flex-wrap gap-6 shrink-0 shadow-sm z-10 transition-colors">
          <div className="flex-1 min-w-[250px] max-w-sm">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Ollama API URL</label>
            <input 
              type="text" 
              value={config.baseUrl}
              onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="http://localhost:11434"
            />
          </div>
          <div className="flex-1 min-w-[250px] max-w-sm">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Model</label>
            {availableModels.length > 0 ? (
              <select 
                value={config.model}
                onChange={e => setConfig({ ...config, model: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. llama3"
              />
            )}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center max-w-md w-full md:ml-auto">
            <p>Ensure Ollama is running locally with <code className="bg-gray-100 dark:bg-gray-700 font-mono px-1.5 py-0.5 rounded text-xs">OLLAMA_ORIGINS="*" ollama serve</code> to avoid CORS issues.</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-4 sm:p-6">
        {!activePdf ? (
          <Library 
            pdfs={savedPdfs || []} 
            onOpenPdf={openPdfView} 
            onDeletePdf={handleDeletePdf} 
          />
        ) : (
          <div className="flex flex-col lg:flex-row h-full gap-6">
            {/* Left Panel: PDF Viewer */}
            <section className="flex-1 flex flex-col min-w-0 h-[50vh] lg:h-full">
              <PDFViewer 
                file={pdfFileObj} 
                dbPdf={activePdf}
                onTextExtracted={setDocumentText}
                onTextHighlighted={setHighlightedText}
              />
            </section>
  
            {/* Right Panel: AI Assistant */}
            <section className="w-full lg:w-[450px] shrink-0 flex flex-col min-w-0 shadow-sm h-[50vh] lg:h-full">
              <AIAssistant 
                documentText={documentText}
                highlightedText={highlightedText}
                config={config}
                dbPdf={activePdf}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
