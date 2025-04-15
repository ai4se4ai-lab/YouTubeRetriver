# YouTube Data Exporter

A web application that allows users to export their YouTube liked videos and watch history to CSV files using OAuth 2.0 authentication.

## Features

- **Secure Authentication**: Uses OAuth 2.0 to securely access YouTube data with minimal permissions
- **Data Export**: Export your liked videos and watch history to CSV files
- **User-Friendly Interface**: Simple, responsive UI for easy data export
- **Privacy Focused**: Data is processed on your device and not stored on our servers

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Backend**: Node.js, Express.js
- **Authentication**: Google OAuth 2.0
- **APIs**: YouTube Data API v3
- **Data Format**: CSV export using json2csv

## Project Structure

The project follows a modular architecture for better maintainability:

```
youtube-data-exporter/
├── public/                 # Frontend assets
│   ├── css/                # Stylesheets
│   ├── js/                 # Client-side JavaScript
│   └── index.html          # Main HTML page
├── server/                 # Backend code
│   ├── config/             # Application configuration
│   ├── controllers/        # Request handlers
│   ├── services/           # Business logic
│   ├── utils/              # Helper functions
│   ├── routes/             # API routes
│   └── server.js           # Express server setup
├── .env.example            # Environment variables template
└── package.json            # Project metadata and dependencies
```

## Prerequisites

- Node.js (v16 or later)
- Google Developer account
- YouTube Data API v3 access

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

4. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file and add your Google OAuth credentials.

5. **Start the server**

   ```bash
   npm start
   ```

   The application will be available at `http://localhost:3000`.

## Usage

1. Open the application in your browser
2. Click "Connect to YouTube" to authenticate
3. Select which data you want to export (liked videos, watch history)
4. Set the maximum number of results to retrieve
5. Click "Export Data" to generate the CSV file
6. Download the CSV file when processing is complete

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

## Development

To run the application in development mode with auto-reload:

```bash
npm run dev
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This application is not affiliated with, maintained, authorized, endorsed, or sponsored by YouTube or Google.
