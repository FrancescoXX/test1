// app/page.tsx
'use client';

import { useState } from 'react';

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState('');
  const [generatedReadme, setGeneratedReadme] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  // --- NEW STATE for Copy Button Feedback ---
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setGeneratedReadme('');
    setStatusMessage('Fetching repository...');
    // --- Reset copy status on new generation ---
    setCopyStatus('idle');

    if (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://')) {
      setError('Please enter a valid repository URL (http:// or https://).');
      setIsLoading(false);
      return;
    }

    try {
      setStatusMessage('Sending request...'); // Initial status
      const response = await fetch('/api/generate-readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl }),
      });

      setStatusMessage('Analyzing repository & generating README...'); // Update status

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` })); // Handle non-json errors
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
       // Check if readme exists in data
       if (typeof data.readme !== 'string') {
         throw new Error('Received invalid response format from server.');
       }
      setStatusMessage('README generated successfully!');
      setGeneratedReadme(data.readme);
    } catch (err: any) {
      console.error("Generation failed:", err);
      setError(err.message || 'Failed to generate README. Check console or server logs.');
      setStatusMessage(''); // Clear status on error
    } finally {
      setIsLoading(false);
      // Don't clear status message immediately on success, keep the success message
      if (error) { // Only clear status if there was an error
         setStatusMessage('');
      }
    }
  };

  // --- NEW FUNCTION for Handling Safe Copy ---
  const handleCopyReadme = async () => {
    // 1. Check if Clipboard API is available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        // 2. Attempt to copy the generated README content
        await navigator.clipboard.writeText(generatedReadme);
        setCopyStatus('copied'); // Set status to 'copied' on success

        // 3. Reset the status back to 'idle' after 2 seconds
        setTimeout(() => setCopyStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to copy README to clipboard:', err);
        setCopyStatus('failed'); // Set status to 'failed' on error
        // Reset the status back to 'idle' after 3 seconds
        setTimeout(() => setCopyStatus('idle'), 3000);
      }
    } else {
      // Handle cases where the Clipboard API isn't supported
      console.warn('Clipboard API not available in this context.');
      setError('Clipboard API not available in this browser/context.'); // Inform user via error state
      setCopyStatus('failed');
       // Reset the status back to 'idle' after 3 seconds
       setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };


  return (
    // Main container: Centered, padded, vertical flex layout
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-gray-50 dark:bg-gray-900"> {/* Added base background */}
      <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6 sm:p-8"> {/* Card-like container */}
        {/* Header */}
        <h1 className="mb-2 text-center text-3xl font-semibold text-gray-900 dark:text-white">
          AI README Generator
        </h1>
        <p className="mb-6 text-center text-gray-500 dark:text-gray-300">
          Enter a public GitHub repository URL to generate a README.md file.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="repoUrl" className="sr-only">
              Public Repository URL
            </label>
            <input
              type="url"
              id="repoUrl"
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-1 sm:text-sm"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository-name"
              required
              aria-label="Public Repository URL"
              disabled={isLoading} // Disable input while loading
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            // Adjusted button for better dark mode contrast potentially
            className="flex w-full justify-center rounded-md border border-transparent bg-gray-800 dark:bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 dark:hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed" // Added disabled cursor
          >
            {isLoading ? (
                 <>
                   <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   Generating...
                 </>
            ) : 'Generate README'}
          </button>
        </form>

        {/* Status Messages during loading */}
        {isLoading && statusMessage && (
          // Make status slightly lighter in dark mode
          <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400 animate-pulse">
            {statusMessage}
          </div>
        )}

        {/* Success Message after loading (if no error) */}
        {!isLoading && !error && generatedReadme && statusMessage.includes('success') && (
             <div className="mt-4 text-center text-sm text-green-600 dark:text-green-400">
                {statusMessage}
             </div>
        )}


        {/* Error Display */}
        {error && (
            // Adjusted error display for dark mode
            <div className="mt-4 rounded-md border border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">Error: {error}</p>
            </div>
        )}


        {/* Output Area */}
        {generatedReadme && !isLoading && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              {/* Apply dark mode to output heading */}
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Generated README.md:
              </h2>
              {/* --- UPDATED Copy Button --- */}
              <button
                onClick={handleCopyReadme} // Use the new safe handler
                disabled={copyStatus !== 'idle'} // Disable while copying/recently copied/failed
                className={`rounded border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-indigo-500 focus:ring-offset-1 transition-colors duration-150 ease-in-out
                  ${copyStatus === 'copied'
                    ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 border-green-300 dark:border-green-600' // Copied style
                    : copyStatus === 'failed'
                      ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 border-red-300 dark:border-red-600' // Failed style
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600' // Idle style
                  }
                  ${copyStatus !== 'idle' ? 'cursor-not-allowed' : ''}
                `}
              >
                {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
              </button>
            </div>
            {/* Textarea: Explicitly set dark mode styles */}
            <textarea
              readOnly
              value={generatedReadme}
              rows={25}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-mono" // Adjusted background/text for readability
              aria-label="Generated README content"
            />
          </div>
        )}
      </div>
    </div>
  );
}