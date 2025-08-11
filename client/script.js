// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Configuration
// (Removed duplicate CONFIG definition)

// Global state
// let extractedText = ''; // Duplicate declaration removed
let ragInsights = null;
let currentDocumentType = null;

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

// Enhanced file processing with RAG
async function processFile(file) {
    try {
        // Validate file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            throw new Error('File size exceeds 10MB limit');
        }

        showLoading('Processing document with RAG analysis...');

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

        // Send to backend for RAG analysis
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                textContent: extractedText
            })
        });

        if (response.ok) {
            const data = await response.json();
            ragInsights = data.ragAnalysis;
            currentDocumentType = ragInsights.documentType;
        }

        // Display file information with RAG insights
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
    
    let detailsText = `${fileSizeKB} KB • ${pageCount} PAGES • ${extractedText.length.toLocaleString()} CHARACTERS`;
    
    // Add RAG insights if available
    if (ragInsights) {
        detailsText += `\nDOCUMENT TYPE: ${ragInsights.documentType.toUpperCase()}`;
        if (ragInsights.keyTerms && Object.keys(ragInsights.keyTerms).length > 0) {
            detailsText += ` • ${Object.keys(ragInsights.keyTerms).length} LEGAL TERMS IDENTIFIED`;
        }
        if (ragInsights.redFlags && ragInsights.redFlags.length > 0) {
            detailsText += ` • ${ragInsights.redFlags.length} RED FLAGS DETECTED`;
        }
    }
    
    document.getElementById('fileDetails').textContent = detailsText;
    
    // Show preview with RAG context
    let preview = extractedText.substring(0, CONFIG.PREVIEW_LENGTH);
    if (extractedText.length > CONFIG.PREVIEW_LENGTH) {
        preview += '\n\n[DOCUMENT CONTINUES...]';
    }
    
    // Add RAG insights to preview
    if (ragInsights && ragInsights.keyTerms) {
        preview += '\n\n--- RAG ANALYSIS ---';
        const keyTermsList = Object.keys(ragInsights.keyTerms).slice(0, 3);
        if (keyTermsList.length > 0) {
            preview += `\nKEY TERMS: ${keyTermsList.join(', ')}`;
        }
        if (ragInsights.redFlags && ragInsights.redFlags.length > 0) {
            preview += `\nRED FLAGS: ${ragInsights.redFlags.slice(0, 2).join(', ')}`;
        }
    }
    
    document.getElementById('filePreview').textContent = preview;
    document.getElementById('fileStatus').classList.add('active');
    
    // Add RAG query interface
    addRAGQueryInterface();
}

function addRAGQueryInterface() {
    const fileStatus = document.getElementById('fileStatus');
    
    // Check if query interface already exists
    if (document.getElementById('ragQueryInterface')) {
        return;
    }
    
    const queryInterface = document.createElement('div');
    queryInterface.id = 'ragQueryInterface';
    queryInterface.style.marginTop = '1.5rem';
    queryInterface.style.paddingTop = '1.5rem';
    queryInterface.style.borderTop = '1px solid #e0e0e0';
    
    queryInterface.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem; color: var(--gray-medium);">
                Ask specific questions about this document
            </div>
            <input type="text" 
                   id="ragQueryInput" 
                   placeholder="e.g., What are the termination clauses?"
                   style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; font-size: 0.8rem; margin-bottom: 0.5rem;">
            <button class="btn" onclick="submitRAGQuery()" style="margin-top: 0;">
                Ask Question
            </button>
        </div>
        <div id="ragQueryResult" style="display: none; background: var(--gray-light); padding: 1rem; margin-top: 1rem; font-size: 0.8rem; line-height: 1.5;"></div>
    `;
    
    fileStatus.appendChild(queryInterface);
    
    // Add enter key support
    document.getElementById('ragQueryInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitRAGQuery();
        }
    });
}

async function submitRAGQuery() {
    const queryInput = document.getElementById('ragQueryInput');
    const query = queryInput.value.trim();
    
    if (!query) {
        alert('Please enter a question');
        return;
    }
    
    if (!extractedText) {
        alert('No document uploaded');
        return;
    }
    
    const resultDiv = document.getElementById('ragQueryResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align: center;">🔍 Searching document...</div>';
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/rag-query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                documentText: extractedText
            })
        });
        
        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `
                <div style="font-weight: 500; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.7rem;">Answer:</div>
                <div>${data.answer.replace(/\n/g, '<br>')}</div>
                <div style="margin-top: 0.75rem; font-size: 0.65rem; color: var(--gray-medium); text-transform: uppercase;">
                    Confidence: ${data.context.confidence} • Relevant sections: ${data.context.relevantChunks}
                </div>
            `;
        } else {
            throw new Error('Failed to get answer');
        }
        
    } catch (error) {
        console.error('RAG query error:', error);
        resultDiv.innerHTML = `<div style="color: #cc0000;">Error: ${error.message}</div>`;
    }
    
    // Clear input
    queryInput.value = '';
}

function clearFile() {
    document.getElementById('fileStatus').classList.remove('active');
    document.getElementById('fileInput').value = '';
    document.getElementById('analyzeBtn').disabled = true;
    extractedText = '';
    ragInsights = null;
    currentDocumentType = null;
    showEmptyState();
}

// Enhanced document analysis with RAG
async function analyzeDocument() {
    if (!extractedText) {
        showError('No document to analyze');
        return;
    }

    showLoading('Generating RAG-enhanced analysis...');

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
            showExplanation(data.explanation, data.ragInsights);
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
                Upload a legal document to begin RAG-enhanced analysis 
                and receive a comprehensive plain language 
                explanation with contextual legal insights.
            </div>
        </div>
    `;
}

function showExplanation(explanation, ragInsights) {
    const container = document.getElementById('resultsContainer');
    
    // Create RAG insights section
    let ragSection = '';
    if (ragInsights) {
        ragSection = `
            <div style="border: 1px solid #e0e0e0; padding: 1.5rem; margin-bottom: 2rem; background: var(--gray-light);">
                <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; font-weight: 500;">
                    RAG Analysis Insights
                </div>
                <div style="font-size: 0.75rem; line-height: 1.6;">
                    <strong>Document Type:</strong> ${ragInsights.documentType}<br>
                    <strong>Legal Terms Found:</strong> ${ragInsights.keyTermsFound}<br>
                    <strong>Red Flags Detected:</strong> ${ragInsights.redFlagsDetected}<br>
                    <strong>Analysis Confidence:</strong> ${ragInsights.confidence}<br>
                    <strong>Document Chunks Analyzed:</strong> ${ragInsights.chunksAnalyzed}
                </div>
            </div>
        `;
    }
    
    const formattedExplanation = formatMarkdown(explanation);
    
    container.innerHTML = `
        <div class="explanation fade-in">
            ${ragSection}
            ${formattedExplanation}
            <div class="action-bar">
                <button class="btn" onclick="copyExplanation()">
                    Copy Analysis
                </button>
                <button class="btn" onclick="downloadExplanation()">
                    Download
                </button>
                <button class="btn" onclick="generateDetailedReport()">
                    Detailed Report
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
            <div style="margin-top: 1rem; font-size: 0.75rem; line-height: 1.5;">
                <strong>Troubleshooting:</strong><br>
                • Ensure the RAG-enhanced backend server is running on port 3001<br>
                • Check that your .env file contains a valid GEMINI_API_KEY<br>
                • Verify the document is readable and not password-protected<br>
                • Try a smaller document if the file is very large
            </div>
        </div>
    `;
}

// Enhanced report generation
async function generateDetailedReport() {
    if (!extractedText || !ragInsights) {
        alert('No document analysis available');
        return;
    }
    
    showLoading('Generating detailed RAG report...');
    
    try {
        // Generate additional detailed analysis
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/rag-query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: 'Provide a detailed risk assessment and recommendations for this document',
                documentText: extractedText
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Create detailed report
            const report = `
DETAILED LEGAL DOCUMENT ANALYSIS REPORT
=====================================

DOCUMENT INFORMATION:
- Type: ${currentDocumentType ? currentDocumentType.toUpperCase() : 'UNKNOWN'}
- Length: ${extractedText.length.toLocaleString()} characters
- Analysis Date: ${new Date().toLocaleDateString()}

RAG ANALYSIS SUMMARY:
- Legal Terms Identified: ${ragInsights.keyTermsFound || 0}
- Red Flags Detected: ${ragInsights.redFlagsDetected || 0}
- Document Chunks Analyzed: ${ragInsights.chunksAnalyzed || 0}
- Analysis Confidence: ${ragInsights.confidence || 'Unknown'}

DETAILED RISK ASSESSMENT:
${data.answer}

TECHNICAL ANALYSIS NOTES:
This analysis was performed using Retrieval-Augmented Generation (RAG) technology,
which combines AI language models with specialized legal knowledge bases to provide
more accurate and contextually relevant explanations.

Generated by Legalese RAG Analysis System
            `.trim();
            
            // Download report
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `legal-analysis-report-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Show success message
            const container = document.getElementById('resultsContainer');
            const currentContent = container.innerHTML;
            container.innerHTML = `
                <div style="background: var(--gray-light); padding: 2rem; text-align: center; border: 1px solid #e0e0e0;">
                    <div style="font-size: 1rem; margin-bottom: 1rem;">✅ DETAILED REPORT GENERATED</div>
                    <div style="font-size: 0.8rem; color: var(--gray-medium);">
                        Complete analysis report has been downloaded
                    </div>
                    <button class="btn" onclick="document.getElementById('resultsContainer').innerHTML = \`${currentContent.replace(/`/g, '\\`')}\`" style="margin-top: 1rem;">
                        Return to Analysis
                    </button>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Report generation error:', error);
        showError('Failed to generate detailed report');
    }
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
        .replace(/^⚠️ (.*$)/gm, '<li style="color: #cc0000;">⚠️ $1</li>')
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
        const explanationElement = document.querySelector('.explanation');
        const explanationText = explanationElement.innerText;
        
        // Add RAG metadata to copied text
        let textToCopy = explanationText;
        if (ragInsights) {
            textToCopy = `RAG-ENHANCED LEGAL ANALYSIS
Document Type: ${currentDocumentType}
Analysis Confidence: ${ragInsights.confidence}

${explanationText}

---
Analysis performed using Retrieval-Augmented Generation (RAG) technology
Generated by Legalese AI Platform`;
        }
        
        await navigator.clipboard.writeText(textToCopy);
        
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
    const explanationElement = document.querySelector('.explanation');
    const explanationText = explanationElement.innerText;
    const fileName = document.getElementById('fileName').textContent;
    
    // Enhanced filename with RAG info
    let downloadName = 'legal-analysis.txt';
    if (fileName) {
        const baseName = fileName.replace('.pdf', '');
        downloadName = `${baseName}-rag-analysis.txt`;
    }
    
    // Add RAG metadata to downloaded text
    let textToDownload = explanationText;
    if (ragInsights) {
        textToDownload = `RAG-ENHANCED LEGAL DOCUMENT ANALYSIS
=============================================

Document: ${fileName || 'Unknown'}
Analysis Date: ${new Date().toLocaleString()}
Document Type: ${currentDocumentType}
Analysis Method: Retrieval-Augmented Generation (RAG)

RAG INSIGHTS:
- Legal Terms Identified: ${ragInsights.keyTermsFound}
- Red Flags Detected: ${ragInsights.redFlagsDetected}
- Chunks Analyzed: ${ragInsights.chunksAnalyzed}
- Confidence Level: ${ragInsights.confidence}

ANALYSIS RESULTS:
${explanationText}

---
Generated by Legalese RAG Analysis Platform
Technology: AI + Legal Knowledge Base Integration`;
    }
    
    const blob = new Blob([textToDownload], { type: 'text/plain' });
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
        // Log RAG-related errors specifically
        if (e.error.message.includes('RAG') || e.error.message.includes('rag')) {
            console.error('RAG-specific error detected:', e.error);
        }
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
    });
}

// Performance monitoring with RAG metrics
function setupPerformanceMonitoring() {
    window.addEventListener('load', () => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log(`RAG-enhanced Legalese app loaded in ${loadTime}ms`);
    });
    
    // Monitor RAG query performance
    window.ragQueryTimes = [];
    window.logRAGPerformance = (startTime, endTime, queryType) => {
        const duration = endTime - startTime;
        window.ragQueryTimes.push({ queryType, duration, timestamp: Date.now() });
        console.log(`RAG ${queryType} completed in ${duration}ms`);
    };
}

// RAG system status check
async function checkRAGStatus() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/health`);
        const data = await response.json();
        
        if (data.status === 'OK') {
            console.log('✅ RAG-enhanced backend is running');
            console.log('📚 Legal knowledge base loaded');
            return true;
        }
    } catch (error) {
        console.warn('⚠️ RAG backend not available:', error.message);
        console.log('🔄 App will function with basic features only');
        return false;
    }
}

// Initialize application with RAG
function initializeApp() {
    console.log('🚀 Initializing RAG-enhanced Legalese application...');
    
    initializeEventListeners();
    setupErrorHandling();
    setupPerformanceMonitoring();
    
    // Check RAG system status
    checkRAGStatus().then(ragAvailable => {
        if (ragAvailable) {
            console.log('🧠 RAG system online - Enhanced analysis available');
            // Update UI to show RAG capabilities
            const subtitle = document.querySelector('.subtitle');
            if (subtitle && subtitle.textContent === 'Document Upload') {
                subtitle.textContent = 'RAG-Enhanced Document Upload';
            }
        } else {
            console.log('📄 Basic document analysis available');
        }
    });
    
    console.log('✅ Legalese RAG app initialized');
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);// Set worker source for PDF.js
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