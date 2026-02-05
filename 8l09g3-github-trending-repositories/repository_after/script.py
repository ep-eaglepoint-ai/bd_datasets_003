import requests
import json
import sys
from datetime import datetime, timedelta

def fetch_trending_repos():
    """
    Fetches the top 10 trending repositories from GitHub using the public Search API.
    A proxy for 'trending' is the most starred repositories created in the last 30 days.
    """
    # Calculate the date 30 days ago
    date_30_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    url = "https://api.github.com/search/repositories"
    params = {
        "q": f"created:>{date_30_days_ago}",
        "sort": "stars",
        "order": "desc",
        "per_page": 10
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        repos = []
        for item in data.get("items", []):
            repo_info = {
                "name": item.get("full_name"),
                "url": item.get("html_url"),
                "stars": item.get("stargazers_count"),
                "description": item.get("description")
            }
            repos.append(repo_info)
            
        return repos
    
    except requests.exceptions.RequestException as e:
        print(json.dumps({"error": f"Failed to fetch repositories: {str(e)}"}), file=sys.stderr)
        return None

def main():
    trending_repos = fetch_trending_repos()
    
    if trending_repos is not None:
        # Output result in JSON format as per requirements
        print(json.dumps(trending_repos, indent=4))
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
