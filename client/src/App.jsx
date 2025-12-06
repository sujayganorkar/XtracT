import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (loading) {
      timerRef.current = setInterval(() => {
        setProcessingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setResult(null);
    setError(null);
    setCurrentStage(0);
    setProcessingTime(0);
  };

  const handleRemove = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setCurrentStage(0);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProcessingTime(0);

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Simulate stage progression
      const stageInterval = setInterval(() => {
        setCurrentStage(prev => Math.min(prev + 1, 4));
      }, 3000);

      const res = await axios.post('http://localhost:3000/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      clearInterval(stageInterval);
      setCurrentStage(4);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.details || err.message || 'Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadText = () => {
    if (!result?.final_text) return;
    const blob = new Blob([result.final_text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = () => {
    if (!result?.final_text) return;
    navigator.clipboard.writeText(result.final_text);
    alert('Text copied to clipboard!');
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">XtrakT</h1>
          <p className="text-gray-600">4-Stage AI-Powered OCR Pipeline: PaddleOCR + Tesseract + Qwen2.5-VL + Agentic Judge</p>
        </header>

        {/* Upload Section */}
        {!result && !loading && (
          <div className="bg-white p-8 rounded-xl shadow-lg mb-8">
            <div className="border-3 border-dashed border-indigo-300 rounded-xl p-12 text-center hover:bg-indigo-50 transition">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                <div className="flex flex-col items-center">
                  <svg className="w-16 h-16 text-indigo-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-xl font-semibold text-indigo-600">Click to Select Image</span>
                  <p className="text-sm text-gray-500 mt-2">Supports JPG, PNG, GIF, BMP, TIFF</p>
                </div>
              </label>
            </div>

            {/* Preview */}
            {preview && (
              <div className="mt-6">
                <div className="relative inline-block">
                  <img src={preview} alt="preview" className="max-h-64 rounded-lg shadow-md" />
                  <button
                    onClick={handleRemove}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-6 text-center">
                  <button
                    onClick={handleUpload}
                    className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-lg"
                  >
                    Upload & Transcribe
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Section */}
        {loading && (
          <div className="bg-white p-8 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Processing...</h2>
              <span className="text-xl font-mono text-indigo-600">{formatTime(processingTime)}</span>
            </div>

            <div className="space-y-4">
              {[
                { id: 1, name: 'Stage 1: OCR Baseline', desc: 'PaddleOCR + Tesseract' },
                { id: 2, name: 'Stage 2: AI Analysis', desc: 'Qwen Vision Model' },
                { id: 3, name: 'Stage 3: Merge & Validate', desc: 'Quality Checks' },
                { id: 4, name: 'Stage 4: Agentic Judge', desc: 'Final Validation' }
              ].map(stage => (
                <div key={stage.id} className={`flex items-center p-4 rounded-lg ${
                  currentStage >= stage.id ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50 border-2 border-gray-200'
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    currentStage >= stage.id ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {currentStage > stage.id ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : currentStage === stage.id ? (
                      <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-white font-bold">{stage.id}</span>
                    )}
                  </div>
                  <div className="ml-4">
                    <div className="font-semibold text-gray-800">{stage.name}</div>
                    <div className="text-sm text-gray-600">{stage.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 p-6 rounded-xl mb-8">
            <div className="flex items-center">
              <svg className="w-12 h-12 text-red-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-xl font-bold text-red-800">Processing Failed</h3>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results Section */}
        {result && !loading && (
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Transcription Results</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyText}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
                <button
                  onClick={handleDownloadText}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  TXT
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  JSON
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                <div className="text-sm text-blue-600 font-semibold">Confidence</div>
                <div className="text-2xl font-bold text-blue-900">
                  {Math.round((result.combined_confidence || 0) * 100)}%
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
                <div className="text-sm text-green-600 font-semibold">Processing Time</div>
                <div className="text-2xl font-bold text-green-900">
                  {((result.timings?.total || 0) / 1000).toFixed(1)}s
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
                <div className="text-sm text-purple-600 font-semibold">Word Count</div>
                <div className="text-2xl font-bold text-purple-900">
                  {result.final_text?.split(/\s+/).filter(w => w.length > 0).length || 0}
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg">
                <div className="text-sm text-orange-600 font-semibold">Judge Status</div>
                <div className="text-lg font-bold text-orange-900">
                  {result.quality_flags?.judge_validation?.action || 'N/A'}
                </div>
              </div>
            </div>

            {/* Transcription Text */}
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Transcribed Text</h3>
              <div className="bg-white p-4 rounded border border-gray-200 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-sm">
                {result.final_text || 'No text extracted'}
              </div>
            </div>

            {/* Technical Details */}
            <details className="bg-gray-50 p-4 rounded-lg">
              <summary className="cursor-pointer font-semibold text-gray-800 hover:text-indigo-600">
                Technical Details & Quality Metrics
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700">Processing Stages:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 ml-2">
                    <li>Stage 1 (OCR): {result.timings?.stage1}ms</li>
                    <li>Stage 2 (Qwen): {result.timings?.stage2}ms</li>
                    <li>Stage 3 (Merge): {result.timings?.stage3}ms</li>
                    <li>Stage 4 (Judge): {result.timings?.stage4}ms</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700">Quality Flags:</h4>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto font-mono mt-2">
                    {JSON.stringify(result.quality_flags, null, 2)}
                  </pre>
                </div>
              </div>
            </details>

            <button
              onClick={handleRemove}
              className="mt-6 w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold"
            >
              Process Another Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;