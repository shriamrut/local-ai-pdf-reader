import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure the worker for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: File | null;
  onTextExtracted: (text: string) => void;
  onTextHighlighted: (text: string) => void;
}

export function PDFViewer({ file, onTextExtracted, onTextHighlighted }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleSelectionChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          onTextHighlighted(selection.toString().trim());
        }
        // We don't want to clear the highlight when the user clicks elsewhere to interact with the sidebar,
        // so we intentionally don't set it to '' when selection is empty.
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
    setPageNumber(1);

    // Extract text for the entire document for RAG/Summarization
    try {
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\\n\\n';
      }
      onTextExtracted(fullText);
    } catch (err) {
      console.error('Failed to extract text from PDF', err);
    }
  };

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 rounded-lg">
        <div className="text-center">
          <p className="mb-2">No PDF selected</p>
          <p className="text-sm">Upload a document to start reading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-100 dark:bg-gray-900 rounded-lg border dark:border-gray-800 transition-colors" ref={containerRef}>
      <div className="flex-1 overflow-auto p-4 flex justify-center">
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
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg bg-white"
            width={Math.min(containerRef.current?.clientWidth ? containerRef.current.clientWidth - 32 : 800, 1000)}
          />
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
