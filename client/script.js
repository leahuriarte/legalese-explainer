// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Configuration
const CONFIG = {
    BACKEND_URL: 'http://localhost:3001',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    PREVIEW_LENGTH: 400
};

// Global state
let extractedText = '';

// File handling functions
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        processFile(files[0]);
    } else {
        showError('Please select a PDF document');
    }
}

// File processing
async function processFile(file) {
    try {
        // Validate file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            throw new Error('File size exceeds 10MB limit');
        }

        showLoading('Processing document...');

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        extractedText = '';
        
        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            extractedText += pageText + '\n\n';
        }

        // Display file information
        displayFileInfo(file, pdf.numPages);
        
        // Enable analysis button
        document.getElementById('analyzeBtn').disabled = false;
        
        hideLoading();

    } catch (error) {
        console.error('Error processing PDF:', error);
        showError(`Processing failed: ${error.message}`);
    }
}

function displayFileInfo(file, pageCount) {
    const fileSizeKB = (file.size / 1024).toFixed(1);
    
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileDetails').textContent = 
        `${fileSizeKB} KB • ${pageCount} PAGES • ${extractedText.length.toLocaleString()} CHARACTERS`;
    
    // Show preview
    const preview = extractedText.substring(0, CONFIG.PREVIEW_LENGTH) + 
        (extractedText.length > CONFIG.PREVIEW_LENGTH ? '\n\n[DOCUMENT CONTINUES...]' : '');
    document.getElementById('filePreview').textContent = preview;

    document.getElementById('fileStatus').classList.add('active');
}

function clearFile() {
    document.getElementById('fileStatus').classList.remove('active');
    document.getElementById('fileInput').value = '';
    document.getElementById('analyzeBtn').disabled = true;
    extractedText = '';
    showEmptyState();
}

// Document analysis
async function analyzeDocument() {
    if (!extractedText) {
        showError('No document to analyze');
        return;
    }

    showLoading('Analyzing document...');

    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/explain`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: extractedText
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || `Server error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.explanation) {
            showExplanation(data.explanation);
        } else {
            throw new Error('Invalid response from server');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        showError(`Analysis failed: ${error.message}`);
    }
}

// UI state management
function showLoading(message) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `
        <div class="loading-state fade-in">
            <div class="loading-spinner"></div>
            <div class="loading-text">${message.toUpperCase()}</div>
        </div>
    `;
}

function hideLoading() {
    // Loading is hidden when content is shown
}

function showEmptyState() {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `
        <div class="empty-state fade-in">
            <div class="empty-text">
                Upload a legal document to begin analysis 
                and receive a comprehensive plain language 
                explanation of all terms and conditions.
            </div>
        </div>
    `;
}

function showExplanation(explanation) {
    const container = document.getElementById('resultsContainer');
    const formattedExplanation = formatMarkdown(explanation);
    
    container.innerHTML = `
        <div class="explanation fade-in">
            ${formattedExplanation}
            <div class="action-bar">
                <button class="btn" onclick="copyExplanation()">
                    Copy Analysis
                </button>
                <button class="btn" onclick="downloadExplanation()">
                    Download
                </button>
            </div>
        </div>
    `;
}

function showError(message) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `
        <div class="error-message fade-in">
            <div class="error-title">Analysis Error</div>
            <div class="error-text">${message}</div>
        </div>
    `;
}

// Text formatting
function formatMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^\- (.*$)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.*)$/gm, '<p>$1</p>')
        .replace(/<p><h/g, '<h')
        .replace(/<\/h([1-6])><\/p>/g, '</h$1>')
        .replace(/<p><ul>/g, '<ul>')
        .replace(/<\/ul><\/p>/g, '</ul>')
        .replace(/<p><\/p>/g, '');
}

// Utility functions
async function copyExplanation() {
    try {
        const explanationText = document.querySelector('.explanation').innerText;
        await navigator.clipboard.writeText(explanationText);
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = 'COPIED';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    }
}

function downloadExplanation() {
    const explanationText = document.querySelector('.explanation').innerText;
    const fileName = document.getElementById('fileName').textContent;
    const downloadName = fileName ? fileName.replace('.pdf', '-analysis.txt') : 'legal-analysis.txt';
    
    const blob = new Blob([explanationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'DOWNLOADED';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
    }, 2000);
}

// Event listeners
function initializeEventListeners() {
    // File input change
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            processFile(file);
        }
    });

    // Drag and drop
    const uploadZone = document.getElementById('uploadZone');
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);

    // Keyboard navigation
    uploadZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            document.getElementById('fileInput').click();
        }
    });

    // Prevent default drag behaviors on document
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
}

// Error handling
function setupErrorHandling() {
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
    });
}

// Performance monitoring
function setupPerformanceMonitoring() {
    window.addEventListener('load', () => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log(`Page loaded in ${loadTime}ms`);
    });
}

// Initialize application
function initializeApp() {
    initializeEventListeners();
    setupErrorHandling();
    setupPerformanceMonitoring();
    
    console.log('Legalese app initialized');
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);