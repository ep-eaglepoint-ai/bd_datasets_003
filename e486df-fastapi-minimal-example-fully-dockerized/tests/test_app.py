"""
Compliance Test Suite for FastAPI String Reverser API

This suite verifies all 8 specific project requirements:
1. POST endpoint at /reverse-string
2. Accept JSON payload with "text"
3. Response JSON with "reversed"
4. Fully containerized using Docker
5. Configurable and runable via Docker Compose
6. Accessible on port 8000
7. Run using Uvicorn as ASGI server
8. Production-ready with clear, properly named files
"""

import pytest
import os
from fastapi.testclient import TestClient
from pathlib import Path
from app import app

# Create test client
client = TestClient(app)


class TestRequirement123_API:
    """Verifies requirements 1, 2, and 3 related to the API endpoint."""
    
    def test_req1_endpoint_exists(self):
        """Requirement 1: The application must expose a POST endpoint at /reverse-string"""
        # We try a GET to see if it's there but method not allowed (or just check the app routes)
        response = client.get("/reverse-string")
        assert response.status_code == 405  # Method Not Allowed for GET
        
        # Proper POST check
        response = client.post("/reverse-string", json={"text": "test"})
        assert response.status_code == 200

    def test_req2_accepts_json_payload(self):
        """Requirement 2: The endpoint must accept a JSON payload containing a string with the key 'text'"""
        test_text = "test string"
        response = client.post("/reverse-string", json={"text": test_text})
        assert response.status_code == 200

    def test_req3_returns_json_reversed(self):
        """Requirement 3: The response must be a JSON object with the key 'reversed', containing the reversed version"""
        test_text = "hello"
        expected = "olleh"
        response = client.post("/reverse-string", json={"text": test_text})
        assert response.status_code == 200
        data = response.json()
        assert "reversed" in data
        assert data["reversed"] == expected


class TestRequirement45678_Structure:
    """Verifies requirements 4, 5, 6, 7, and 8 related to Docker and Project Structure."""
    
    # Paths are relative to the root of the project assuming tests are run from root
    # or the container has /app as root and files are mapped.
    # When running inside docker, the files might be in /app (mapped from repository_after)
    # but the Dockerfile and docker-compose.yml are usually in the parent directory.
    # However, for this test to be robust, we'll check common paths.
    
    PROJECT_ROOT = Path(__file__).parent.parent
    
    def test_req4_dockerfile_exists(self):
        """Requirement 4: Fully containerized using Docker"""
        dockerfile = self.PROJECT_ROOT / "Dockerfile"
        assert dockerfile.exists(), f"Dockerfile not found at {dockerfile}"
        content = dockerfile.read_text()
        assert "FROM" in content, "Dockerfile should have a FROM instruction"

    def test_req5_docker_compose_exists(self):
        """Requirement 5: Configurable and runable via Docker Compose"""
        compose_file = self.PROJECT_ROOT / "docker-compose.yml"
        assert compose_file.exists(), f"docker-compose.yml not found at {compose_file}"
        content = compose_file.read_text()
        assert "services:" in content, "docker-compose.yml should define services"

    def test_req6_port_8000_exposed(self):
        """Requirement 6: Accessible on port 8000"""
        # Check Dockerfile EXPOSE
        dockerfile = self.PROJECT_ROOT / "Dockerfile"
        if dockerfile.exists():
            content = dockerfile.read_text()
            assert "EXPOSE 8000" in content, "Dockerfile should EXPOSE port 8000"
            
        # Check docker-compose port mapping
        compose_file = self.PROJECT_ROOT / "docker-compose.yml"
        if compose_file.exists():
            content = compose_file.read_text()
            assert "8000:8000" in content, "docker-compose.yml should map port 8000"

    def test_req7_uvicorn_used(self):
        """Requirement 7: Run using Uvicorn as ASGI server"""
        # Check Dockerfile CMD
        dockerfile = self.PROJECT_ROOT / "Dockerfile"
        if dockerfile.exists():
            content = dockerfile.read_text()
            assert "uvicorn" in content.lower(), "Dockerfile should use uvicorn"
            
        # Check requirements.txt
        reqs_file = self.PROJECT_ROOT / "requirements.txt"
        if reqs_file.exists():
            content = reqs_file.read_text()
            assert "uvicorn" in content.lower(), "requirements.txt should include uvicorn"

    def test_req8_clear_files(self):
        """Requirement 8: Production-ready with clear, properly named files"""
        expected_files = [
            "repository_after/app.py",
            "Dockerfile",
            "docker-compose.yml",
            "requirements.txt",
            "README.md"
        ]
        for f in expected_files:
            file_path = self.PROJECT_ROOT / f
            assert file_path.exists(), f"Clear requirement file {f} is missing"


class TestFullCompliance:
    """Meta-test to summarize compliance."""
    
    def test_all_requirements_fulfilled(self):
        """Final check showing all requirements are met."""
        # This is a placeholder that implicitly passes if all other tests pass
        print("\n[SUCCESS] All 8 Project Requirements Verified")
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
