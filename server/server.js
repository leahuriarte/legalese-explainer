// server.js - Enhanced with RAG for legal document analysis

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, '../client')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// RAG Knowledge Base - Legal context and precedents
const legalKnowledgeBase = {
    contractTypes: {
        employment: {
            keywords: ['employment', 'job', 'salary', 'benefits', 'termination', 'non-compete', 'confidentiality'],
            context: 'Employment contracts establish the relationship between employer and employee, defining terms of work, compensation, and obligations.',
            commonClauses: ['at-will employment', 'confidentiality', 'intellectual property', 'termination clauses']
        },
        lease: {
            keywords: ['lease', 'rent', 'tenant', 'landlord', 'property', 'deposit', 'maintenance'],
            context: 'Lease agreements outline the terms for renting property, including rent amount, duration, and responsibilities.',
            commonClauses: ['security deposit', 'maintenance responsibilities', 'early termination', 'renewal options']
        },
        nda: {
            keywords: ['confidential', 'non-disclosure', 'proprietary', 'trade secret', 'information'],
            context: 'Non-disclosure agreements protect confidential information from being shared with unauthorized parties.',
            commonClauses: ['definition of confidential information', 'permitted disclosures', 'duration of confidentiality']
        },
        purchase: {
            keywords: ['purchase', 'sale', 'buyer', 'seller', 'warranty', 'delivery', 'payment'],
            context: 'Purchase agreements govern the sale of goods or services, including terms of delivery and payment.',
            commonClauses: ['warranties', 'delivery terms', 'payment schedule', 'remedies for breach']
        },
        service: {
            keywords: ['service', 'provider', 'client', 'deliverables', 'timeline', 'payment terms'],
            context: 'Service agreements define the scope of work, deliverables, and terms for professional services.',
            commonClauses: ['scope of work', 'payment terms', 'intellectual property', 'liability limitations']
        }
    },
    
    legalTerms: {
        'force majeure': 'A clause that frees parties from liability when extraordinary circumstances prevent contract fulfillment',
        'indemnification': 'A contractual obligation to compensate for harm, loss, or damage incurred by another party',
        'liquidated damages': 'A predetermined amount of compensation for breach of contract',
        'arbitration': 'Alternative dispute resolution method where conflicts are resolved outside of court',
        'jurisdiction': 'The authority of a court to hear and decide cases',
        'consideration': 'Something of value exchanged between parties to make a contract legally binding',
        'breach': 'Failure to fulfill a legal obligation or contract term',
        'waiver': 'Voluntary relinquishment of a known legal right',
        'assignment': 'Transfer of contractual rights or obligations to another party',
        'novation': 'Replacement of an existing contract with a new one'
    },
    
    redFlags: [
        'unusually broad liability clauses',
        'automatic renewal without notice',
        'excessive penalties for early termination',
        'vague or undefined terms',
        'one-sided modification clauses',
        'unclear dispute resolution procedures',
        'missing or inadequate warranties',
        'unreasonable confidentiality requirements',
        'lack of termination clauses',
        'ambiguous payment terms'
    ],
    
    standardClauses: {
        severability: 'If any provision is found unenforceable, the rest of the contract remains valid',
        entireAgreement: 'This contract represents the complete agreement between parties',
        governingLaw: 'Specifies which jurisdiction\'s laws will govern the contract',
        amendment: 'How the contract can be modified or changed',
        notices: 'How official communications must be delivered'
    }
};

// RAG Document Chunking and Analysis
class RAGProcessor {
    constructor() {
        this.chunkSize = 1000;
        this.overlapSize = 200;
    }
    
    // Split document into chunks for better analysis
    chunkDocument(text) {
        const chunks = [];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        let currentChunk = '';
        let currentLength = 0;
        
        for (const sentence of sentences) {
            if (currentLength + sentence.length > this.chunkSize && currentChunk) {
                chunks.push(currentChunk.trim());
                
                // Add overlap from previous chunk
                const words = currentChunk.split(' ');
                const overlapWords = words.slice(-Math.floor(this.overlapSize / 6));
                currentChunk = overlapWords.join(' ') + ' ' + sentence;
                currentLength = currentChunk.length;
            } else {
                currentChunk += ' ' + sentence;
                currentLength += sentence.length;
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }
    
    // Identify document type based on content
    identifyDocumentType(text) {
        const lowerText = text.toLowerCase();
        let bestMatch = null;
        let maxScore = 0;
        
        for (const [type, data] of Object.entries(legalKnowledgeBase.contractTypes)) {
            const score = data.keywords.reduce((acc, keyword) => {
                const regex = new RegExp(keyword, 'gi');
                const matches = (lowerText.match(regex) || []).length;
                return acc + matches;
            }, 0);
            
            if (score > maxScore) {
                maxScore = score;
                bestMatch = type;
            }
        }
        
        return bestMatch || 'general';
    }
    
    // Extract key terms and their explanations
    extractKeyTerms(text) {
        const foundTerms = {};
        const lowerText = text.toLowerCase();
        
        for (const [term, definition] of Object.entries(legalKnowledgeBase.legalTerms)) {
            if (lowerText.includes(term.toLowerCase())) {
                foundTerms[term] = definition;
            }
        }
        
        return foundTerms;
    }
    
    // Identify potential red flags
    identifyRedFlags(text) {
        const lowerText = text.toLowerCase();
        const foundFlags = [];
        
        for (const flag of legalKnowledgeBase.redFlags) {
            // Simple keyword matching - could be enhanced with ML
            const keywords = flag.split(' ').slice(0, 3);
            const hasKeywords = keywords.some(keyword => 
                lowerText.includes(keyword.toLowerCase())
            );
            
            if (hasKeywords) {
                foundFlags.push(flag);
            }
        }
        
        return foundFlags;
    }
    
    // Generate contextual insights
    generateContext(documentType, chunks) {
        const typeData = legalKnowledgeBase.contractTypes[documentType];
        if (!typeData) return '';
        
        let context = `This appears to be a ${documentType} document. ${typeData.context}\n\n`;
        
        // Check for common clauses
        const foundClauses = [];
        const fullText = chunks.join(' ').toLowerCase();
        
        for (const clause of typeData.commonClauses) {
            if (fullText.includes(clause.toLowerCase())) {
                foundClauses.push(clause);
            }
        }
        
        if (foundClauses.length > 0) {
            context += `Common clauses found: ${foundClauses.join(', ')}\n\n`;
        }
        
        return context;
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Enhanced Legalese API with RAG is running' });
});

// Upload and process PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const pdfData = await pdf(req.file.buffer);
        const ragProcessor = new RAGProcessor();
        
        // Process document with RAG
        const chunks = ragProcessor.chunkDocument(pdfData.text);
        const documentType = ragProcessor.identifyDocumentType(pdfData.text);
        const keyTerms = ragProcessor.extractKeyTerms(pdfData.text);
        const redFlags = ragProcessor.identifyRedFlags(pdfData.text);
        
        res.json({
            success: true,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            pageCount: pdfData.numpages,
            textContent: pdfData.text,
            textLength: pdfData.text.length,
            ragAnalysis: {
                documentType,
                chunks: chunks.length,
                keyTerms,
                redFlags,
                chunkPreview: chunks[0]?.substring(0, 200) + '...'
            }
        });

    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ 
            error: 'Failed to process PDF', 
            details: error.message 
        });
    }
});

// Enhanced RAG-powered explanation
app.post('/api/explain', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'Server configuration error', 
                details: 'No API key configured' 
            });
        }

        // Initialize RAG processor
        const ragProcessor = new RAGProcessor();
        
        // Process document with RAG
        const chunks = ragProcessor.chunkDocument(text);
        const documentType = ragProcessor.identifyDocumentType(text);
        const keyTerms = ragProcessor.extractKeyTerms(text);
        const redFlags = ragProcessor.identifyRedFlags(text);
        const context = ragProcessor.generateContext(documentType, chunks);
        
        // Build enhanced prompt with RAG context
        const ragPrompt = `You are an expert legal document analyzer with access to extensive legal knowledge. 

DOCUMENT CONTEXT:
${context}

KEY LEGAL TERMS IDENTIFIED:
${Object.entries(keyTerms).map(([term, def]) => `• ${term}: ${def}`).join('\n')}

POTENTIAL RED FLAGS DETECTED:
${redFlags.map(flag => `⚠️ ${flag}`).join('\n')}

DOCUMENT TYPE: ${documentType.toUpperCase()}

Please analyze the following legal document and provide a comprehensive explanation using this contextual knowledge:

1. **DOCUMENT SUMMARY**: Brief overview of what this document does
2. **KEY PROVISIONS**: Main terms and conditions explained in plain English
3. **YOUR RIGHTS**: What rights this document gives you
4. **YOUR OBLIGATIONS**: What you're agreeing to do or not do
5. **RISK ASSESSMENT**: Potential concerns and red flags (use the detected ones above)
6. **RECOMMENDATIONS**: What to clarify, negotiate, or watch out for
7. **NEXT STEPS**: What you should do before signing

Use the legal knowledge provided above to give context-aware explanations. Reference specific legal concepts when relevant.

DOCUMENT TEXT:
${text.substring(0, 25000)}

Format your response with clear headers and bullet points for easy reading.`;

        // Make API call to Gemini with enhanced RAG prompt
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: ragPrompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.3,
                    topK: 40,
                    topP: 0.8,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.text();
            console.error('Gemini API error:', geminiResponse.status, errorData);
            return res.status(geminiResponse.status).json({ 
                error: 'AI analysis failed', 
                details: `Status ${geminiResponse.status}: ${errorData}` 
            });
        }

        const data = await geminiResponse.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from AI service');
        }

        const explanation = data.candidates[0].content.parts[0].text;

        res.json({
            success: true,
            explanation: explanation,
            ragInsights: {
                documentType,
                keyTermsFound: Object.keys(keyTerms).length,
                redFlagsDetected: redFlags.length,
                chunksAnalyzed: chunks.length,
                confidence: keyTerms && Object.keys(keyTerms).length > 0 ? 'high' : 'medium'
            }
        });

    } catch (error) {
        console.error('Error generating RAG explanation:', error);
        res.status(500).json({ 
            error: 'Failed to generate explanation', 
            details: error.message 
        });
    }
});

// RAG Query endpoint for specific questions
app.post('/api/rag-query', async (req, res) => {
    try {
        const { query, documentText } = req.body;
        
        if (!query || !documentText) {
            return res.status(400).json({ error: 'Query and document text required' });
        }
        
        const ragProcessor = new RAGProcessor();
        const chunks = ragProcessor.chunkDocument(documentText);
        const documentType = ragProcessor.identifyDocumentType(documentText);
        const keyTerms = ragProcessor.extractKeyTerms(documentText);
        
        // Find most relevant chunks for the query
        const relevantChunks = chunks.filter(chunk => 
            chunk.toLowerCase().includes(query.toLowerCase()) ||
            query.toLowerCase().split(' ').some(word => 
                chunk.toLowerCase().includes(word)
            )
        ).slice(0, 3);
        
        const context = relevantChunks.join('\n\n');
        
        const apiKey = process.env.GEMINI_API_KEY;
        const ragQueryPrompt = `Based on this legal document context and your legal knowledge, answer the specific question:

QUESTION: ${query}

RELEVANT DOCUMENT CONTEXT:
${context}

DOCUMENT TYPE: ${documentType}

KEY TERMS IN DOCUMENT:
${Object.entries(keyTerms).map(([term, def]) => `• ${term}: ${def}`).join('\n')}

Please provide a specific, accurate answer based on the document content and legal knowledge.`;

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: ragQueryPrompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
            })
        });

        const data = await geminiResponse.json();
        const answer = data.candidates[0].content.parts[0].text;

        res.json({
            success: true,
            answer: answer,
            context: {
                relevantChunks: relevantChunks.length,
                documentType,
                confidence: relevantChunks.length > 0 ? 'high' : 'low'
            }
        });
        
    } catch (error) {
        console.error('Error processing RAG query:', error);
        res.status(500).json({ 
            error: 'Failed to process query', 
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }
    res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced Legalese RAG server running on port ${PORT}`);
    console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`💡 Explain endpoint: http://localhost:${PORT}/api/explain`);
    console.log(`🔍 RAG Query endpoint: http://localhost:${PORT}/api/rag-query`);
    console.log(`🧠 RAG Knowledge Base loaded with ${Object.keys(legalKnowledgeBase.contractTypes).length} contract types`);
});