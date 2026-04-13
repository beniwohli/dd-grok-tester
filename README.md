# Datadog Grok Tester

A web application for testing Datadog-specific Grok patterns locally using Vector's VRL engine.

## Features

- Local Grok parsing without Datadog API dependencies.
- Support for named match rules and custom support patterns.
- Persistent session state via browser local storage.
- Session history with JSON import/export capabilities.
- Export patterns to Terraform (HCL) format.
- Integrated request logging and graceful shutdown handling.

## Requirements

- Docker (for containerized deployment)
- Node.js 20+ and Rust 1.84+ (for local development)

## Installation and Usage

### Using Docker

The easiest way to run the application is using the provided multi-stage Dockerfile.

1. Build the image:
   ```bash
   docker build -t datadog-grok-tester .
   ```

2. Run the container:
   ```bash
   docker run -p 3001:3001 datadog-grok-tester
   ```

3. Access the application at `http://localhost:3001`.

### Local Development

1. Install dependencies for all components:
   ```bash
   npm run install:all
   ```

2. Start both the frontend and backend concurrently:
   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:5173`, proxying API requests to the Rust server at `http://localhost:3001`.

## Testing

A Python-based test suite is available to verify parsing against official Datadog examples.

1. Create and activate a virtual environment:
   ```bash
   uv venv .venv
   source .venv/bin/activate
   uv pip install pytest requests
   ```

2. Ensure the server is running, then execute the tests:
   ```bash
   pytest tests/test_grok_examples.py -vv
   ```

## License

MIT
