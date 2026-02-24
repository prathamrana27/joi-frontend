# JOI Electron Frontend

This frontend runs as an Electron desktop app and streams chat responses over SSE from:

`POST http://localhost:8000/chat/stream`

## Run

1. Install dependencies
   `npm install`
2. Start backend (`joi-backend/api_server.py`)
3. Start desktop app
   `npm run dev`

## Features

- Modern chat layout
- Conversation history sidebar
- Workflow/tool event panel
- Streaming assistant responses
