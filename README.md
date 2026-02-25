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

## Build Windows EXE (Frontend + Backend bundled)

1. From `joi-frontend`, install dependencies:
   `npm install`
2. Run packaging:
   `npm run dist:win`

What this does:
- Builds backend executable with PyInstaller via `../joi-backend/build_backend.ps1`
- Bundles that backend runtime into the Electron package
- Produces a portable Windows `.exe` in:
  `joi-frontend/release`
