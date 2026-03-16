# Logos - AI-Powered Course Generator

Logos is an intelligent course generation platform that transforms simple prompts into comprehensive, structured educational content. It leverages advanced AI to create detailed course outlines, lesson plans, and hands-on exercises, complete with code examples and visual diagrams.

## Features

- **AI-Generated Courses**: Create complete course structures from a single topic prompt.
- **Structured Content**: Courses are broken down into logical modules and chapters.
- **Hands-On Exercises**: Each chapter includes practical exercises with solutions.
- **Visual Diagrams**: Automatic generation of Mermaid diagrams to visualize concepts.
- **Code Examples**: Real-world code snippets in various programming languages.
- **Progress Tracking**: Track your learning progress with completion status.
- **Markdown Support**: Rich text formatting for all course content.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: FastAPI + Uvicorn
- **Database**: PostgreSQL
- **AI**: Any LLM via OpenRouter
- **Containerization**: Docker & Docker Compose

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed.
- An API key from [OpenRouter](https://openrouter.ai/) to access the Gemini 2.0 Flash model.

### Configuration

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd logos
    ```

2.  **Create a `.env` file** in the root directory:
    ```bash
    cp .env.example .env
    ```

3.  **Edit `.env`** and add your configuration:
    ```env
    # Database Configuration
    POSTGRES_DB=logos
    POSTGRES_USER=logos
    POSTGRES_PASSWORD=your_secure_password

    # OpenRouter API Configuration
    OPENROUTER_API_KEY=your_openrouter_api_key
    OPENROUTER_MODEL=openrouter/gemini-2.0-flash
    ```

### Running with Docker Compose

Start the application using Docker Compose:

```bash
docker-compose up --build
```

This command will:
1.  Build the frontend and backend images.
2.  Start the PostgreSQL database.
3.  Start the FastAPI backend.
4.  Start the Nginx frontend.

### Accessing the Application

Once the containers are running:
- **Frontend**: Open [http://localhost:3000](http://localhost:3000) in your browser.
- **API**: The API is available at [http://localhost:8000](http://localhost:8000).
- **Database**: Connect to the database at `localhost:5439`.

## Development

### Running Locally (Without Docker)

#### Backend

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Run the server:
    ```bash
    uvicorn main:app --reload
    ```

#### Frontend

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

## Project Structure

```
logos/
├── backend/          # FastAPI backend application
│   ├── main.py       # FastAPI app entry point
│   ├── models.py     # SQLAlchemy database models
│   ├── schemas.py    # Pydantic schemas for validation
│   ├── database.py   # Database configuration
│   └── requirements.txt
├── frontend/         # React frontend application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── pages/      # Page components
│   │   ├── utils/      # Utility functions
│   │   └── App.tsx     # Main application component
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── docker-compose.yml  # Docker Compose configuration
├── Dockerfile          # Dockerfiles for services
└── .env                # Environment variables (not in git)
```

## License

## Steps to create openrouter api key

1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign in or sign up
3. Click on "Get API Key" button
4. Copy the API key
5. Paste the API key in the .env file or supply during course creation

[MIT License](LICENSE)
