# YouTube Data Exporter with AI Agents

A web application that allows users to export their YouTube liked videos and watch history to CSV files using OAuth 2.0 authentication, with additional AI agent analysis capabilities.

## Features

- **Secure Authentication**: Uses OAuth 2.0 to securely access YouTube data with minimal permissions
- **Data Export**: Export your liked videos and watch history to CSV files
- **AI Analysis**: Analyze your YouTube data with intelligent AI agents for personalized insights
- **Interactive Visualization**: See how the AI agents work together in real-time
- **User Feedback**: Provide feedback to improve AI analysis quality
- **User-Friendly Interface**: Simple, responsive UI for both data export and AI analysis
- **Privacy Focused**: Data is processed on your device and not stored on our servers

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Backend**: Node.js, Express.js
- **Authentication**: Google OAuth 2.0
- **APIs**: YouTube Data API v3, OpenAI API
- **Data Format**: CSV export using json2csv
- **Real-time Communication**: Socket.IO

## Project Structure

The project follows a modular architecture for better maintainability:

```
youtube-data-exporter/
├── public/                 # Frontend assets
│   ├── css/                # Stylesheets
│   │   ├── main.css        # Main application styles
│   │   ├── normalize.css   # CSS normalization
│   │   └── agents.css      # AI agent interface styles
│   ├── js/                 # Client-side JavaScript
│   │   ├── app.js          # Main application logic
│   │   ├── auth.js         # Authentication handling
│   │   ├── dataHandler.js  # YouTube data handling
│   │   └── agents.js       # AI agent interface logic
│   └── index.html          # Main HTML page
├── server/                 # Backend code
│   ├── agents/             # AI agent system
│   │   ├── BaseAgent.js    # Base agent class
│   │   ├── AgentManager.js # Agent coordinator
│   │   ├── dal/            # Data Analysis Layer agents
│   │   ├── arl/            # Analogical Reasoning Layer agents
│   │   ├── rpl/            # Result Presentation Layer agents
│   │   ├── fll/            # Feedback and Learning Layer agents
│   │   └── ccl/            # Control and Coordination Layer agents
│   ├── config/             # Application configuration
│   ├── controllers/        # Request handlers
│   ├── services/           # Business logic
│   ├── utils/              # Helper functions
│   ├── routes/             # API routes
│   └── server.js           # Express server setup
├── .env.example            # Environment variables template
└── package.json            # Project metadata and dependencies
```

## AI Agent Architecture

The application incorporates a sophisticated multi-agent system:

1. **Data Analysis Layer (DAL)**
   - Content Analysis Agent (A21): Processes YouTube data to extract themes and user interests
   - Knowledge Retrieval Agent (A22): Gathers relevant information to support analysis

2. **Analogical Reasoning Layer (ARL)**
   - Analogy Generation Agent (A31): Creates analogies by mapping user interests to complex concepts
   - Analogy Validation Agent (A32): Evaluates generated analogies for accuracy and relevance
   - Analogy Refinement Agent (A33): Refines analogies based on validation feedback

3. **Result Presentation Layer (RPL)**
   - Explanation Agent (A4): Presents the final analogies in an understandable manner

4. **Feedback and Learning Layer (FLL)**
   - User Feedback Agent (A51): Processes user feedback on the presented analogies
   - Learning Agent (A52): Analyzes feedback to improve future analogy generation

5. **Control and Coordination Layer (CCL)**
   - Orchestrator Agent (A6): Manages workflow and coordination among all agents

## Prerequisites

- Node.js (v16 or later)
- Google Developer account
- YouTube Data API v3 access
- OpenAI API key

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/youtube-data-exporter.git
   cd youtube-data-exporter
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Google OAuth credentials**

   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the YouTube Data API v3
   - Configure the OAuth consent screen
   - Create OAuth 2.0 Client ID credentials
   - Add `http://localhost:3000/api/auth/callback` as an authorized redirect URI

4. **Get an OpenAI API key**

   - Go to [OpenAI's Platform](https://platform.openai.com/)
   - Sign up or log in to your account
   - Navigate to the API keys section
   - Create a new API key

5. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file and add:
   - Your Google OAuth credentials
   - Your OpenAI API key

6. **Start the server**

   ```bash
   npm start
   ```

   The application will be available at `http://localhost:3000`.

## Usage

1. Open the application in your browser
2. Click "Connect to YouTube" to authenticate
3. Select which data you want to export/analyze (liked videos, watch history)
4. Set the maximum number of results to retrieve

### For Data Export:
5. Click "Export Data to CSV" to generate the CSV file
6. Download the CSV file when processing is complete

### For AI Analysis:
5. Click "Analyze with AI Agents" to start the agent workflow
6. Review and approve each agent's output as prompted
7. View the final analysis and insights
8. Provide feedback to help improve future analyses

## Permissions Required

The application requests the following YouTube API permissions:

- `youtube.readonly`: To access your YouTube account data
- `youtube.force-ssl`: Required for retrieving sensitive data like watch history

You can revoke access at any time through your [Google Account Permissions](https://myaccount.google.com/permissions).

## Security Considerations

- OAuth tokens are stored in the browser's session and localStorage for persistence
- Tokens are never stored on the server
- All data processing happens on your device
- The application uses HTTPS for secure data transmission
- Tokens automatically expire and can be revoked at any time
- OpenAI API keys are stored server-side and never exposed to the client

## Development

To run the application in development mode with auto-reload:

```bash
npm run dev
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This application is not affiliated with, maintained, authorized, endorsed, or sponsored by YouTube, Google, or OpenAI.