# Headless Markdown Versioning Engine - Trajectory

This document provides an overview of the Headless Markdown Versioning Engine, a backend-only service designed to manage document lifecycles with strict version control.

### Key Capabilities

1.  **Strict Versioning**:
    *   **Automatic Increments**: Every document update automatically creates a new revision with an incremented version number.
    *   **Immutable History**: Previous revisions are preserved, providing a full audit trail of changes.
    *   **Rollback**: Allows restoring a document to any previous state by creating a new revision based on a past version.

2.  **Advanced Content Handling**:
    *   **Markdown Rendering**: Includes a `MarkdownService` that can dynamically render stored markdown content into HTML.
    *   **Diffing System**: A `DiffService` provides both structured (word-level) and unified (patch) diffs between any two versions of a document.

3.  **API Features**:
    *   **History Retrieval**: Endpoints to fetch the full evolution of a document.
    *   **Version Snapshots**: Ability to retrieve specific historical versions by their version number.
    *   **Metadata Tracking**: Tracks authors, timestamps, and titles for every revision.

### Core Structure

*   `repository_after/api/`: Contains the FastAPI routers and endpoints (`/documents`, `/revisions`, `/diff`, etc.).
*   `repository_after/models.py`: Defines the database schema using SQLAlchemy:
    *   `Document`: The parent entity tracking titles and the latest state.
    *   `Revision`: The versioned snapshot containing the actual markdown content.
*   `repository_after/services/`: Holds the business logic for rendering (`markdown_service.py`) and calculating differences (`diff_service.py`).
*   `repository_after/crud.py`: Manages all database interactions (Create, Read, Update, Delete) and logic for version sequencing.

### Technical Stack
*   **Backend**: Python (FastAPI)
*   **Database**: PostgreSQL / SQLAlchemy ORM
*   **Environment**: Dockerized setup with `docker-compose`
*   **Testing**: Pytest for unit and integration testing

### Commands

To manage the application and its environment, use the following commands:

*   **Run Development Server**:
    ```bash
    docker-compose up --build
    ```
*   **Run Unit Tests**:
    ```bash
    docker compose run --rm app pytest
    ```
*   **Run Evaluation Script**:
    ```bash
    docker compose run --rm app python evaluation/evaluation.py
    ```
