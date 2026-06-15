import React from 'react';
import { LocalPDF } from '../lib/db';
import { FileText, Clock, Trash2, BookOpen } from 'lucide-react';

interface LibraryProps {
  pdfs: LocalPDF[];
  onOpenPdf: (pdf: LocalPDF) => void;
  onDeletePdf: (id: number) => void;
}

export function Library({ pdfs, onOpenPdf, onDeletePdf }: LibraryProps) {
  if (pdfs.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 rounded-lg transition-colors">
        <BookOpen size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">Your Library is Empty</p>
        <p className="text-sm">Upload a PDF document to start reading and analyzing.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-800 transition-colors p-6">
      <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <BookOpen size={24} className="text-blue-600 dark:text-blue-500" />
        Library
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto pb-4">
        {pdfs.map((pdf) => (
          <div 
            key={pdf.id}
            className="group flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer relative"
            onClick={() => onOpenPdf(pdf)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400">
                <FileText size={20} />
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (pdf.id) onDeletePdf(pdf.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                title="Delete from device"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mb-1" title={pdf.name}>
              {pdf.name}
            </h3>
            
            <div className="mt-auto pt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {new Date(pdf.lastOpenedAt).toLocaleDateString()}
              </span>
              {pdf.lastPage > 1 && (
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full font-medium">
                  Page {pdf.lastPage}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
