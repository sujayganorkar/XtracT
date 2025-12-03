import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    
    // Generate previews
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
    setResults([]); // Clear previous results
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const promises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        try {
          const res = await axios.post('http://localhost:3000/upload', formData, {
             headers: { 'Content-Type': 'multipart/form-data' }
          });
          return { fileName: file.name, status: 'success', data: res.data };
        } catch (err) {
          console.error(err);
          return { fileName: file.name, status: 'error', message: 'Failed to process' };
        }
      });

      const outcomes = await Promise.all(promises);
      setResults(outcomes);

    } catch (err) {
      setError("Batch processing failed.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800">Academic OCR Extractor</h1>
          <p className="text-gray-600">Powered by Qwen 2.5 VL & Tesseract Validation</p>
        </header>

        {/* Upload Section */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition">
            <input 
              type="file" 
              multiple 
              accept="image/*"
              onChange={handleFileChange} 
              className="hidden" 
              id="fileInput"
            />
            <label htmlFor="fileInput" className="cursor-pointer text-blue-600 font-semibold text-lg">
              Click to Select Images
            </label>
            <p className="text-sm text-gray-500 mt-2">or drag and drop files here</p>
          </div>

          {/* Previews */}
          {previews.length > 0 && (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {previews.map((src, idx) => (
                <div key={idx} className="relative group">
                  <img src={src} alt="preview" className="h-32 w-full object-cover rounded shadow-sm" />
                  <div className="absolute bottom-0 left-0 bg-black bg-opacity-50 text-white text-xs p-1 w-full truncate">
                    {files[idx].name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Button */}
          {files.length > 0 && (
            <div className="mt-6 text-center">
              <button 
                onClick={handleUpload} 
                disabled={loading}
                className={`px-6 py-3 rounded-lg text-white font-bold text-lg transition ${
                  loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Processing...' : `Extract Text from ${files.length} Images`}
              </button>
            </div>
          )}
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="space-y-6">
            {results.map((res, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                
                {/* Header */}
                <div className={`p-4 flex justify-between items-center ${
                  res.status === 'error' ? 'bg-red-50' : 
                  (res.data?.flagged ? 'bg-yellow-50' : 'bg-green-50')
                }`}>
                  <h3 className="font-bold text-gray-800">{res.fileName}</h3>
                  {res.status === 'success' && (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      res.data.flagged ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
                    }`}>
                      {res.data.flagged ? '⚠️ Review Needed' : '✅ High Confidence'}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  {res.status === 'error' ? (
                    <p className="text-red-600">Error processing file.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* JSON View */}
                      <div>
                        <h4 className="font-semibold mb-2 text-gray-700">Extracted Structure (Qwen)</h4>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs h-96 overflow-auto font-mono">
                          {JSON.stringify(res.data.qwen_response, null, 2)}
                        </pre>
                      </div>

                      {/* Validation View */}
                      <div>
                         <h4 className="font-semibold mb-2 text-gray-700">Validation Stats</h4>
                         <div className="bg-gray-50 p-4 rounded border">
                            <p><strong>Qwen Word Count:</strong> {res.data.validation.qwen_word_count}</p>
                            <p><strong>Tesseract Word Count:</strong> {res.data.validation.tesseract_word_count}</p>
                            <p><strong>Discrepancy:</strong> {res.data.validation.discrepancy_score}%</p>
                            {res.data.flagged && (
                                <p className="text-red-600 text-sm mt-2">
                                  Large difference detected. The model might be hallucinating or the OCR missed text.
                                </p>
                            )}
                         </div>
                         <div className="mt-4">
                            <a 
                              href={`http://localhost:3000/${res.data.file_path}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-blue-600 underline text-sm"
                            >
                              Download JSON File
                            </a>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;