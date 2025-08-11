# legalese-explainer
# Legalese - AI Legal Document Analyzer

> Transform complex legal documents into plain English with AI-powered analysis

![Legalese App Screenshot](https://via.placeholder.com/800x400/000000/FFFFFF?text=Legalese+Legal+Analyzer)

## What It Does

- **Upload any PDF** → Get instant plain English explanations
- **Smart Analysis** → AI automatically detects contract types and key terms
- **Ask Questions** → Interactive Q&A about your specific document  
- **Risk Detection** → Highlights potentially problematic clauses
- **Export Results** → Copy or download your analysis

## Quick Start

### 1. Get API Key
- Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
- Create a free Gemini API key

### 2. Install & Run
```bash
git clone https://github.com/yourusername/legalese-analyzer.git
cd legalese-analyzer/server
npm install
```

Create `server/.env` file:
```env
GEMINI_API_KEY=your_api_key_here
PORT=3001
```

Start the app:
```bash
npm run dev
```

Open: `http://localhost:3001`

## 📖 How to Use

1. **Upload** - Drag & drop any PDF legal document
2. **Auto-Analysis** - AI automatically analyzes using legal knowledge base
3. **Review** - See document type, key terms, and red flags detected
4. **Generate Explanation** - Click button for detailed plain English breakdown
5. **Ask Questions** - Use the Q&A box for specific queries about your document

## How It Works

The app uses **RAG (Retrieval-Augmented Generation)** technology:
- Combines AI with a legal knowledge base
- Automatically identifies contract types (employment, lease, NDA, etc.)
- Detects key legal terms and explains them
- Flags potentially problematic clauses
- Provides contextually accurate explanations

##  Project Files

```
legalese-analyzer/
├── client/          # Web interface
│   ├── index.html
│   ├── styles.css
│   └── script.js
└── server/          # Backend
    ├── server.js
    ├── package.json
    └── .env         # Add your API key here
```

## Troubleshooting

**Can't access app?** → Make sure you visit `http://localhost:3001` (not 3000)

**API errors?** → Check your Gemini API key in `server/.env`

**Upload failing?** → Ensure PDF is under 10MB and not password-protected

## Privacy

- Documents are processed in memory only
- Nothing is saved to disk
- Your files never leave your computer except for AI analysis
- API keys are kept secure in environment variables
