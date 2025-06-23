# TimelineAssembler

A serverless media timeline assembly tool built with React, Firebase, and Google Cloud services.

## Overview

TimelineAssembler is a specialized tool for automatically assembling and organizing media timelines for video editing and production projects. The tool streamlines the process of arranging media assets in chronological order, applying transitions, and creating edit decision lists (EDLs) that can be imported into professional video editing software.

## Features

- **Automated Timeline Assembly**: Intelligent sequencing of media assets based on metadata
- **Media Asset Organization**: Cataloging and tagging using Gemini API content analysis
- **EDL Generation**: Export industry-standard formats compatible with major NLEs
- **Cloud-Based Processing**: Leveraging Google Cloud services for scalability
- **Intuitive UI**: React-based interface with drag-and-drop timeline editing

## Architecture

The application follows a modern cloud-native architecture:

- **Frontend**: React application deployed on Firebase Hosting
- **Backend**: Firebase and Google Cloud Functions
- **Database**: Firebase Realtime Database
- **Storage**: Google Cloud Storage
- **Authentication**: Firebase Authentication
- **Processing**: Cloud Run with FFmpeg for media operations

## Getting Started

### Prerequisites

- Node.js 18.x or later
- Firebase CLI
- Google Cloud SDK
- FFmpeg (for local development)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/dxaginfo/TimelineAssembler-Media-Automation.git
   cd TimelineAssembler-Media-Automation
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up Firebase:
   ```
   firebase login
   firebase init
   ```

4. Configure environment variables:
   ```
   cp .env.example .env
   # Edit .env with your configuration details
   ```

5. Start the development server:
   ```
   npm start
   ```

## Usage

### Basic Timeline Creation

```javascript
const timelineAssembler = new TimelineAssembler({
  projectId: 'project-123',
  credentials: firebaseConfig
});

// Create a new timeline
const timeline = await timelineAssembler.createTimeline({
  name: 'Summer Campaign Edit',
  framerate: 24,
  resolution: '1920x1080'
});

// Add media assets from Google Drive
await timeline.addMediaFromDrive({
  folderId: 'google-drive-folder-id',
  recursive: true,
  filter: {
    mimeTypes: ['video/mp4', 'audio/wav'],
    namePattern: 'SCENE_*'
  }
});

// Auto-assemble timeline based on metadata
await timeline.autoAssemble({
  strategy: 'chronological',
  groupBy: 'scene',
  addTransitions: true
});

// Export EDL
const edlUrl = await timeline.exportEDL({
  format: 'CMX3600',
  destination: {
    type: 'googleDrive',
    folderId: 'output-folder-id'
  }
});
```

## Project Structure

```
TimelineAssembler/
├── public/             # Static assets
├── src/
│   ├── components/     # React components
│   ├── services/       # API and service integrations
│   ├── hooks/          # Custom React hooks
│   ├── context/        # React context providers
│   ├── utils/          # Utility functions
│   └── pages/          # Main application pages
├── functions/          # Firebase Cloud Functions
├── storage/            # Storage rules
├── firestore/          # Database rules and indexes
└── scripts/            # Build and deployment scripts
```

## API Integrations

- Gemini API for content analysis
- Google Cloud Storage for media assets
- Google Drive API for source media
- Firebase services for auth and database

## Security Considerations

- Firebase Authentication for access control
- Granular permissions for timeline resources
- Secure API key management
- Audit logging for all operations

## Contributing

We welcome contributions! Please check out our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Google Cloud Platform and Firebase team
- FFmpeg project
- React community