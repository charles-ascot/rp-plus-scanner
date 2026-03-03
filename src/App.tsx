/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  Camera, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  History,
  Settings,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const API_BASE = process.env.API_BASE_URL || '';

type Screen = 'home' | 'camera' | 'results' | 'history' | 'browser';

interface OCRResult {
  id: string;
  timestamp: string;
  text: string;
  status: 'pending' | 'uploaded' | 'failed';
  gcsPath?: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [currentResult, setCurrentResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [browserUrl, setBrowserUrl] = useState('');
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setCurrentScreen('results');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;
      const base64Content = base64Data.split(',')[1];

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Perform accurate OCR on this image. Extract all text exactly as it appears. Format with clear structure if applicable." },
            { inlineData: { mimeType: file.type, data: base64Content } }
          ]
        }
      });

      const text = response.text || "No text detected.";
      const newResult: OCRResult = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleString(),
        text,
        status: 'pending'
      };

      setCurrentResult(newResult);
      setOcrResults(prev => [newResult, ...prev]);
      
      // Automatically attempt GCS upload
      await uploadToGCS(newResult);

    } catch (err: any) {
      console.error("OCR Error:", err);
      setError("Failed to process image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const uploadToGCS = async (result: OCRResult) => {
    setUploadStatus('uploading');
    try {
      const response = await fetch(`${API_BASE}/api/upload-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: result.text,
          filename: `ocr_${result.id}`
        })
      });

      const data = await response.json();

      if (response.ok) {
        setUploadStatus('success');
        setOcrResults(prev => prev.map(r => 
          r.id === result.id ? { ...r, status: 'uploaded', gcsPath: data.path } : r
        ));
      } else {
        throw new Error(data.details || data.error || "Upload failed");
      }
    } catch (err: any) {
      console.error("GCS Upload Error:", err);
      setUploadStatus('error');
      setError(`GCS Upload Failed: ${err.message}`);
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <div className="flex flex-col h-full p-6 space-y-6 bg-slate-50">
            <div className="mt-8">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">OCR Link</h1>
              <p className="text-slate-500 mt-2">Extract text and sync to GCS</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-3">
                  <Camera className="text-indigo-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Scan</span>
              </button>

              <button 
                onClick={() => setCurrentScreen('history')}
                className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-3">
                  <History className="text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">History</span>
              </button>

              <button 
                onClick={() => setCurrentScreen('browser')}
                className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-3">
                  <Globe className="text-amber-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Browser</span>
              </button>

              <button 
                className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors opacity-50 cursor-not-allowed"
              >
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Settings className="text-slate-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Settings</span>
              </button>
            </div>

            <div className="mt-auto bg-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
              <h3 className="font-bold text-lg">Cloud Sync Active</h3>
              <p className="text-indigo-100 text-sm mt-1">All scans are automatically delivered to your GCS bucket.</p>
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <button onClick={() => setCurrentScreen('home')} className="text-indigo-600 font-semibold">Back</button>
              <h2 className="font-bold">Scan Result</h2>
              <div className="w-8" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                  <p className="text-slate-500 font-medium">Analyzing image...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
                  <AlertCircle className="w-12 h-12 text-red-500" />
                  <p className="text-slate-800 font-bold">Something went wrong</p>
                  <p className="text-slate-500 text-sm">{error}</p>
                  <button 
                    onClick={() => setCurrentScreen('home')}
                    className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full font-semibold"
                  >
                    Try Again
                  </button>
                </div>
              ) : currentResult && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${uploadStatus === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {uploadStatus === 'uploading' ? <Loader2 className="w-5 h-5 animate-spin" /> : 
                         uploadStatus === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                         <FileText className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">GCS Status</p>
                        <p className="text-sm font-bold capitalize">
                          {uploadStatus === 'uploading' ? 'Syncing...' : 
                           uploadStatus === 'success' ? 'Delivered' : 
                           uploadStatus === 'error' ? 'Sync Failed' : 'Ready'}
                        </p>
                      </div>
                    </div>
                    {uploadStatus === 'error' && (
                      <button 
                        onClick={() => uploadToGCS(currentResult)}
                        className="text-xs font-bold text-indigo-600 underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>

                  <div className="prose prose-slate max-w-none">
                    <h3 className="text-slate-900 font-bold mb-2">Extracted Text</h3>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                      <Markdown>{currentResult.text}</Markdown>
                    </div>
                  </div>

                  {currentResult.gcsPath && (
                    <div className="text-[10px] font-mono text-slate-400 break-all bg-slate-50 p-2 rounded">
                      Path: {currentResult.gcsPath}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <button onClick={() => setCurrentScreen('home')} className="text-indigo-600 font-semibold">Back</button>
              <h2 className="font-bold">History</h2>
              <div className="w-8" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {ocrResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <History className="w-12 h-12 mb-2 opacity-20" />
                  <p>No scans yet</p>
                </div>
              ) : (
                ocrResults.map((result) => (
                  <div 
                    key={result.id}
                    onClick={() => {
                      setCurrentResult(result);
                      setCurrentScreen('results');
                      setUploadStatus(result.status === 'uploaded' ? 'success' : 'idle');
                    }}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className={`p-2 rounded-xl ${result.status === 'uploaded' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-slate-900 truncate">{result.text.substring(0, 30)}...</p>
                        <p className="text-[10px] text-slate-500">{result.timestamp}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case 'browser': {
        const fetchScreenshot = async (url: string) => {
          setBrowserLoading(true);
          setBrowserError(null);
          setScreenshotSrc(null);
          try {
            const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            if (!res.ok) {
              const errData = await res.json().catch(() => ({ error: 'Screenshot failed' }));
              throw new Error((errData as any).error || 'Screenshot failed');
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            setScreenshotSrc(objectUrl);
          } catch (err: any) {
            setBrowserError(err.message);
          } finally {
            setBrowserLoading(false);
          }
        };

        return (
          <div className="flex flex-col h-full bg-slate-100">
            <div className="p-3 bg-white border-b border-slate-200 flex items-center space-x-2">
              <button onClick={() => { setCurrentScreen('home'); setBrowserUrl(''); setScreenshotSrc(null); setBrowserError(null); }} className="text-indigo-600 font-semibold text-sm">Back</button>
              <form
                className="flex-1 flex items-center bg-slate-100 rounded-full overflow-hidden"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (browserUrl.trim()) {
                    const url = browserUrl.trim().startsWith('http') ? browserUrl.trim() : `https://${browserUrl.trim()}`;
                    setBrowserUrl(url);
                    fetchScreenshot(url);
                  }
                }}
              >
                <div className="pl-3">
                  <Globe className="w-3 h-3 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  placeholder="Enter URL..."
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400"
                />
                <button type="submit" disabled={browserLoading} className="px-3 py-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-50">
                  {browserLoading ? '...' : 'Go'}
                </button>
              </form>
            </div>
            <div className="flex-1 overflow-auto">
              {browserLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                  <p className="text-sm text-slate-500">Rendering page...</p>
                </div>
              ) : browserError ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                  <p className="text-sm text-slate-700 font-semibold">Failed to load</p>
                  <p className="text-xs text-slate-500">{browserError}</p>
                  <button onClick={() => fetchScreenshot(browserUrl)} className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-full font-semibold">Retry</button>
                </div>
              ) : screenshotSrc ? (
                <img src={screenshotSrc} alt="Page screenshot" className="w-full" />
              ) : (
                <div className="flex-1 flex items-center justify-center h-full p-8 text-center">
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto">
                      <Globe className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h3 className="font-bold text-slate-900">Web Browser</h3>
                    <p className="text-sm text-slate-500">Enter a URL above to navigate</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-4 font-sans">
      {/* Virtual Mobile Device Frame */}
      <div className="relative w-[380px] h-[800px] bg-slate-900 rounded-[60px] shadow-2xl border-[8px] border-slate-800 overflow-hidden flex flex-col">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-900 rounded-b-3xl z-50 flex items-center justify-center space-x-2">
          <div className="w-12 h-1 bg-slate-800 rounded-full" />
          <div className="w-2 h-2 bg-slate-800 rounded-full" />
        </div>

        {/* Status Bar */}
        <div className="h-12 flex items-center justify-between px-8 pt-2 z-40 text-slate-900">
          <span className="text-xs font-bold">9:41</span>
          <div className="flex items-center space-x-1.5">
            <div className="w-4 h-2.5 border border-slate-900 rounded-sm relative">
              <div className="absolute inset-0.5 bg-slate-900 rounded-sm" />
            </div>
          </div>
        </div>

        {/* Screen Content */}
        <div className="flex-1 bg-white rounded-t-[40px] overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Home Indicator */}
        <div className="h-8 bg-white flex items-center justify-center">
          <div className="w-32 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageUpload}
        />
      </div>

      {/* Instructions Overlay (Desktop only) */}
      <div className="hidden lg:block ml-12 max-w-sm space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-4">GCS Configuration</h2>
          <p className="text-sm text-slate-600 mb-4">
            To enable delivery to GCS, please set the following environment variables in AI Studio:
          </p>
          <ul className="space-y-3">
            <li className="flex items-start space-x-2">
              <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center mt-0.5">
                <span className="text-[10px] font-bold text-indigo-600">1</span>
              </div>
              <code className="text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-100 flex-1">GCS_BUCKET_NAME</code>
            </li>
            <li className="flex items-start space-x-2">
              <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center mt-0.5">
                <span className="text-[10px] font-bold text-indigo-600">2</span>
              </div>
              <code className="text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-100 flex-1">GOOGLE_APPLICATION_CREDENTIALS_JSON</code>
            </li>
          </ul>
          <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <strong>Note:</strong> The app uses Gemini 3 Flash for high-accuracy OCR. Scans are automatically converted to JSON and uploaded to the <code>/ocr-results/</code> folder in your bucket.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
