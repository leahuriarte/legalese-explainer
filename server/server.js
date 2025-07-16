// server.js - Node.js/Express backend for Legalese Explainer

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Legalese Explainer API is running' });
});

// Upload and process PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract text from PDF
        const pdfData = await pdf(req.file.buffer);
        
        res.json({
            success: true,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            pageCount: pdfData.numpages,
            textContent: pdfData.text,
            textLength: pdfData.text.length
        });

    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ 
            error: 'Failed to process PDF', 
            details: error.message 
        });
    }
});

// Generate explanation using Gemini
app.post('/api/explain', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        // Use server-side API key from environment
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'Server configuration error', 
                details: 'No API key configured in server environment' 
            });
        }

        // Make direct API call to Gemini
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are a helpful legal document explainer. Please analyze the following legal document and provide:

1. **Document Type & Purpose**: What kind of document is this?
2. **Key Terms Explained**: Break down the main terms in plain English
3. **Your Rights**: What rights does this document give you?
4. **Your Obligations**: What are you agreeing to do?
5. **Red Flags**: Any concerning clauses or things to watch out for
6. **Questions to Ask**: What should you clarify before signing?

Document text:
${text.substring(0, 30000)}

Please format your response clearly with markdown headers and bullet points.`
                    }]
                }]
            })
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.text();
            console.error('Gemini API error:', geminiResponse.status, errorData);
            return res.status(geminiResponse.status).json({ 
                error: 'Gemini API error', 
                details: `Status ${geminiResponse.status}: ${errorData}` 
            });
        }

        const data = await geminiResponse.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response structure from Gemini API');
        }

        const explanation = data.candidates[0].content.parts[0].text;

        res.json({
            success: true,
            explanation: explanation
        });

    } catch (error) {
        console.error('Error generating explanation:', error);
        res.status(500).json({ 
            error: 'Failed to generate explanation', 
            details: error.message 
        });
    }
});

// Future RAG endpoint placeholder
app.post('/api/rag-query', async (req, res) => {
    // This is where you'll implement RAG functionality later
    res.json({
        message: 'RAG functionality coming soon',
        tip: 'This will search through legal statutes and precedents'
    });
});

// Future email draft endpoint placeholder
app.post('/api/draft-email', async (req, res) => {
    // This is where you'll implement email drafting functionality
    res.json({
        message: 'Email drafting functionality coming soon',
        tip: 'This will help draft responses to landlords about violations'
    });
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
    console.log(`🚀 Legalese Explainer server running on port ${PORT}`);
    console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`💡 Explain endpoint: http://localhost:${PORT}/api/explain`);
});

/* 
Package.json for the backend:

{
  "name": "legalese-explainer-backend",
  "version": "1.0.0",
  "description": "Backend for Legalese Explainer app",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}

Environment variables (.env):
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
*/