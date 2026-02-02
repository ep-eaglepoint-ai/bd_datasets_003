import json
import os
import sys
from phishing_feed_ingestor import PhishingFeedIngestor

def main():
    misp_url = os.getenv("MISP_URL", "https://localhost")
    misp_key = os.getenv("MISP_KEY", "")
    
    if not misp_key:
        print("Error: MISP_KEY environment variable not set.")
        sys.exit(1)

    # In a real scenario, this might be loaded from a file or API
    # For demonstration/testing, we use a sample path
    input_path = os.getenv("INPUT_PATH", "tests/resources/sample_input.json")
    
    if not os.path.exists(input_path):
        print(f"Error: Input file {input_path} not found.")
        sys.exit(1)

    with open(input_path, 'r') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            print(f"Error: Failed to decode JSON from {input_path}")
            sys.exit(1)

    try:
        ingestor = PhishingFeedIngestor(misp_url, misp_key)
        results = ingestor.ingest_data(data)
        print(f"Ingestion complete: {results}")
    except ConnectionError as e:
        print(f"Connection Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
