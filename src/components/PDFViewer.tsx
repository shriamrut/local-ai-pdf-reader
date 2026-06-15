import { useState, useRef, useEffect, MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { LocalPDF, db, StickyNote, VisualHighlight } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquare, X, Highlighter } from 'lucide-react';

// Configure the worker for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: File | Blob | null;
  dbPdf?: LocalPDF | null;
  onTextExtracted: (text: string) => void;
  onTextHighlighted: (text: string) => void;
}

export function PDFViewer({ file, dbPdf, onTextExtracted, onTextHighlighted }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(dbPdf?.lastPage || 1);
  const containerRef = useRef<HTMLDivElement>(null);

  const [newNotePos, setNewNotePos] = useState<{ x: number, y: number } | null>(null);
  const [newNoteText, setNewNoteText] = useState('');

  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const [pendingHighlightRects, setPendingHighlightRects] = useState<{ x: number, y: number, width: number, height: number }[] | null>(null);
  const [selectionPos, setSelectionPos] = useState<{ top: number, left: number } | null>(null);

  const stickyNotes = useLiveQuery(
    () => dbPdf?.id ? db.stickyNotes.where({ pdfId: dbPdf.id, pageNumber }).toArray() : [],
    [dbPdf?.id, pageNumber]
  );
  
  const visualHighlights = useLiveQuery(
    () => dbPdf?.id ? db.visualHighlights.where({ pdfId: dbPdf.id, pageNumber }).toArray() : [],
    [dbPdf?.id, pageNumber]
  );

  // Sync initial page from db when dbPdf changes (e.g. from nav)
  useEffect(() => {
    if (dbPdf && dbPdf.lastPage) {
      setPageNumber(dbPdf.lastPage);
    } else {
      setPageNumber(1);
    }
  }, [dbPdf?.id]);

  // Save page to db when changed
  useEffect(() => {
    if (dbPdf?.id && pageNumber !== dbPdf.lastPage) {
      db.pdfs.update(dbPdf.id, { lastPage: pageNumber });
    }
  }, [pageNumber, dbPdf?.id]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleSelectionChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0 && !selection.isCollapsed) {
          onTextHighlighted(selection.toString().trim());
          
          if (pageWrapperRef.current) {
            try {
              const range = selection.getRangeAt(0);
              const pageRect = pageWrapperRef.current.getBoundingClientRect();
              const rangeRect = range.getBoundingClientRect();

              // Ensure the selection is inside the page
              if (rangeRect.bottom > pageRect.top && rangeRect.top < pageRect.bottom && rangeRect.right > pageRect.left && rangeRect.left < pageRect.right) {
                const rects = Array.from(range.getClientRects()).map(rect => {
                  return {
                    x: ((rect.left - pageRect.left) / pageRect.width) * 100,
                    y: ((rect.top - pageRect.top) / pageRect.height) * 100,
                    width: (rect.width / pageRect.width) * 100,
                    height: (rect.height / pageRect.height) * 100,
                  };
                });
                setPendingHighlightRects(rects);
                // Center top position for the toolbar
                setSelectionPos({
                  top: ((rangeRect.top - pageRect.top) / pageRect.height) * 100,
                  left: ((rangeRect.left + rangeRect.width / 2 - pageRect.left) / pageRect.width) * 100
                });
              } else {
                setPendingHighlightRects(null);
                setSelectionPos(null);
              }
            } catch (err) {}
          }
        } else {
          setPendingHighlightRects(null);
          setSelectionPos(null);
        }
      }, 300);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      clearTimeout(timeoutId);
    };
  }, [onTextHighlighted]);

  const onDocumentLoadSuccess = async (pdf: any) => {
    setNumPages(pdf.numPages);

    // Extract text for the entire document for RAG/Summarization
    try {
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      onTextExtracted(fullText);
    } catch (err) {
      console.error('Failed to extract text from PDF', err);
    }
  };

  const handlePageDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!dbPdf?.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    
    // We get the click coordinates relative to the page div
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to percentage to keep it responsive if the container resizes
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    setNewNotePos({ x: xPercent, y: yPercent });
    setNewNoteText('');
  };

  const saveVisualHighlight = async (color: string) => {
    if (dbPdf?.id && pendingHighlightRects && pendingHighlightRects.length > 0) {
      const selectedText = window.getSelection()?.toString().trim();
      await db.visualHighlights.add({
        pdfId: dbPdf.id,
        pageNumber,
        rects: pendingHighlightRects,
        color,
        text: selectedText
      });
    }
    setPendingHighlightRects(null);
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveNewNote = async () => {
    if (dbPdf?.id && newNotePos && newNoteText.trim()) {
      await db.stickyNotes.add({
        pdfId: dbPdf.id,
        pageNumber,
        x: newNotePos.x,
        y: newNotePos.y,
        text: newNoteText,
        createdAt: Date.now()
      });
    }
    setNewNotePos(null);
    setNewNoteText('');
  };

  if (!file) {
    return null;
  }

  const pageWidth = Math.min(containerRef.current?.clientWidth ? containerRef.current.clientWidth - 32 : 800, 1000);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-100 dark:bg-gray-900 rounded-lg border dark:border-gray-800 transition-colors relative" ref={containerRef}>
      <div className="flex-1 overflow-auto p-4 flex justify-center custom-scrollbar">
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center p-12 text-gray-500">
              Loading document...
            </div>
          }
          error={
            <div className="p-4 text-red-500 bg-red-50 rounded-lg">
              Failed to load PDF. Please try a different file.
            </div>
          }
        >
          <div 
            className="relative cursor-text group inline-block origin-top" 
            onDoubleClick={handlePageDoubleClick}
            title="Double click to add a sticky note"
            ref={pageWrapperRef}
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg bg-white relative pointer-events-auto"
              width={pageWidth}
            />
            
            {/* Render stored visual highlights */}
            {visualHighlights?.map(highlight => (
              <div key={highlight.id} className="absolute inset-0 z-10 group/vh pointer-events-none">
                {highlight.rects.map((rect, i) => (
                  <div 
                    key={i} 
                    className="absolute pointer-events-auto mix-blend-multiply"
                    style={{ 
                      left: `${rect.x}%`, 
                      top: `${rect.y}%`, 
                      width: `${rect.width}%`, 
                      height: `${rect.height}%`,
                      backgroundColor: highlight.color,
                      opacity: 0.5
                    }} 
                  />
                ))}
                {/* Delete button that appears when hovering the first rect area */}
                <button 
                  onClick={(e) => { e.stopPropagation(); db.visualHighlights.delete(highlight.id!); }}
                  className="absolute bg-white text-red-500 rounded-full p-1 shadow-md border hover:bg-gray-100 opacity-0 group-hover/vh:opacity-100 transition-opacity pointer-events-auto"
                  style={{ left: `${highlight.rects[0].x}%`, top: `${highlight.rects[0].y}%`, transform: 'translate(-50%, -100%)', zIndex: 30 }}
                  title="Delete highlight"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Text Selection Toolbar (Highlighter) */}
            {selectionPos && (
              <div 
                className="absolute z-50 bg-white shadow-xl rounded-full border border-gray-200 p-1.5 flex gap-2 -translate-y-full -translate-x-1/2 mb-3 pointer-events-auto"
                style={{ left: `${selectionPos.left}%`, top: `${selectionPos.top}%` }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button 
                  onClick={(e) => { e.preventDefault(); saveVisualHighlight('#fef08a'); }}
                  className="w-6 h-6 rounded-full bg-yellow-200 hover:ring-2 hover:ring-offset-2 hover:ring-yellow-400 transition-all flex items-center justify-center p-1 shadow-sm"
                  title="Highlight Yellow"
                >
                  <span className="sr-only">Yellow</span>
                </button>
                <button 
                  onClick={(e) => { e.preventDefault(); saveVisualHighlight('#bbf7d0'); }}
                  className="w-6 h-6 rounded-full bg-green-200 hover:ring-2 hover:ring-offset-2 hover:ring-green-400 transition-all flex items-center justify-center p-1 shadow-sm"
                  title="Highlight Green"
                >
                  <span className="sr-only">Green</span>
                </button>
                <button 
                  onClick={(e) => { e.preventDefault(); saveVisualHighlight('#bfdbfe'); }}
                  className="w-6 h-6 rounded-full bg-blue-200 hover:ring-2 hover:ring-offset-2 hover:ring-blue-400 transition-all flex items-center justify-center p-1 shadow-sm"
                  title="Highlight Blue"
                >
                  <span className="sr-only">Blue</span>
                </button>
                <button 
                  onClick={(e) => { e.preventDefault(); saveVisualHighlight('#fbcfe8'); }}
                  className="w-6 h-6 rounded-full bg-pink-200 hover:ring-2 hover:ring-offset-2 hover:ring-pink-400 transition-all flex items-center justify-center p-1 shadow-sm"
                  title="Highlight Pink"
                >
                  <span className="sr-only">Pink</span>
                </button>
              </div>
            )}

            {/* Render stored sticky notes */}
            {stickyNotes?.map(note => (
              <div 
                key={note.id} 
                className="absolute z-50 group/note"
                style={{ left: `${note.x}%`, top: `${note.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="bg-yellow-200 text-yellow-800 p-2 rounded-br-xl shadow-md w-8 h-8 flex items-center justify-center cursor-pointer overflow-hidden transition-all hover:w-48 hover:h-auto hover:min-h-16">
                  <div className="hidden group-hover/note:flex flex-col w-full h-full text-xs font-medium">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-yellow-900">Note</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); db.stickyNotes.delete(note.id!); }}
                        className="text-yellow-700 hover:text-red-600"
                        title="Delete note"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap">{note.text}</div>
                  </div>
                  <MessageSquare size={16} className="block group-hover/note:hidden" />
                </div>
              </div>
            ))}

            {/* Render new note input */}
            {newNotePos && (
              <div 
                className="absolute z-50 bg-yellow-100 p-3 shadow-xl rounded-md w-48 border border-yellow-300"
                style={{ left: `${newNotePos.x}%`, top: `${newNotePos.y}%`, transform: 'translate(-50%, -50%)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <textarea 
                  autoFocus
                  className="w-full text-xs bg-transparent border-none outline-none resize-none text-yellow-900 placeholder-yellow-600"
                  placeholder="Type a note..."
                  rows={3}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveNewNote();
                    } else if (e.key === 'Escape') {
                      setNewNotePos(null);
                    }
                  }}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button 
                    onClick={() => setNewNotePos(null)} 
                    className="text-xs text-yellow-700 hover:text-yellow-900 font-medium px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveNewNote}
                    className="text-xs bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-medium px-2 py-1 rounded"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </Document>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-t dark:border-gray-700 text-sm font-medium transition-colors">
        <span className="text-gray-500 dark:text-gray-400">
          Page {pageNumber} of {numPages || '--'}
        </span>
        <div className="flex gap-2">
          <button
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(p => p - 1)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 dark:text-gray-300 rounded transition-colors"
          >
            Previous
          </button>
          <button
            disabled={pageNumber >= (numPages || 1)}
            onClick={() => setPageNumber(p => p + 1)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 dark:text-gray-300 rounded transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
