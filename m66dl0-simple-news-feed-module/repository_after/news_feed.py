"""
Simple News Feed Module

A Python module that provides a simple news feed with article management.
Fetches articles from a local list and provides them by date.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional, Union


@dataclass
class Article:
    """Represents a news article with title, author, date, and content."""
    title: str
    author: str
    date: date
    content: str

    def __post_init__(self):
        """Convert date string to date object if needed."""
        if isinstance(self.date, str):
            self.date = datetime.strptime(self.date, "%Y-%m-%d").date()


class NewsFeed:
    """A simple news feed that manages and retrieves articles."""

    def __init__(self, articles: Optional[List[Article]] = None):
        """
        Initialize the news feed with an optional list of articles.
        
        Args:
            articles: Optional list of Article objects to initialize the feed with.
        """
        self._articles: List[Article] = articles if articles else []

    def add_article(self, article: Article) -> None:
        """
        Add a new article to the feed.
        
        Args:
            article: The Article object to add.
        """
        self._articles.append(article)

    def _sort_articles(self, articles: List[Article]) -> List[Article]:
        """
        Sort articles by date in ascending order (oldest to newest).
        
        Args:
            articles: List of articles to sort.
            
        Returns:
            Sorted list of articles.
        """
        return sorted(articles, key=lambda a: a.date)

    def fetch_all_articles(self) -> List[Article]:
        """
        Fetch all articles in the feed, sorted by date (oldest to newest).
        
        Returns:
            List of all articles sorted by date, or empty list if no articles exist.
        """
        if not self._articles:
            return []
        return self._sort_articles(self._articles.copy())

    def fetch_articles_by_date(self, target_date: Union[date, str]) -> List[Article]:
        """
        Fetch articles for a specific date.
        
        Args:
            target_date: The date to filter articles by. Can be a date object
                        or a string in 'YYYY-MM-DD' format.
        
        Returns:
            List of articles matching the given date, sorted by date.
            Returns empty list if no articles match or if the date is invalid.
        """
        if not self._articles:
            return []

        # Handle string date input
        if isinstance(target_date, str):
            try:
                target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
            except ValueError:
                # Invalid date format, return empty list
                return []

        if target_date is None:
            return []

        matching_articles = [
            article for article in self._articles
            if article.date == target_date
        ]
        return self._sort_articles(matching_articles)

    def fetch_most_recent_article(self) -> Optional[Article]:
        """
        Fetch the most recent article in the feed.
        
        Returns:
            The most recent Article object, or None if the feed is empty.
        """
        if not self._articles:
            return None
        return max(self._articles, key=lambda a: a.date)

    def get_article_count(self) -> int:
        """
        Get the total number of articles in the feed.
        
        Returns:
            The count of articles.
        """
        return len(self._articles)

    def is_empty(self) -> bool:
        """
        Check if the news feed is empty.
        
        Returns:
            True if the feed has no articles, False otherwise.
        """
        return len(self._articles) == 0


def load_articles_from_list(article_data: List[dict]) -> List[Article]:
    """
    Load articles from a list of dictionaries.
    
    Args:
        article_data: List of dictionaries with keys: title, author, date, content.
                     Date should be in 'YYYY-MM-DD' format.
    
    Returns:
        List of Article objects created from the input data.
        Invalid entries are skipped.
    """
    articles = []
    for data in article_data:
        try:
            article = Article(
                title=data.get("title", ""),
                author=data.get("author", ""),
                date=data.get("date", ""),
                content=data.get("content", "")
            )
            articles.append(article)
        except (ValueError, KeyError, TypeError):
            # Skip invalid article entries
            continue
    return articles


# Sample usage and demonstration
if __name__ == "__main__":
    # Sample article data
    sample_articles = [
        {
            "title": "Breaking News: Python 4.0 Released",
            "author": "Melkmau Elias",
            "date": "2026-02-04",
            "content": "Python 4.0 has been released with exciting new features."
        },
        {
            "title": "Weather Update",
            "author": "Melkmau Elias",
            "date": "2026-02-04",
            "content": "Sunny skies expected throughout the week."
        },
        {
            "title": "Tech Conference Announced",
            "author": "Melkmau Elias",
            "date": "2026-02-04",
            "content": "Major tech conference to be held next month."
        },
    ]

    # Create news feed
    articles = load_articles_from_list(sample_articles)
    feed = NewsFeed(articles)

    # Demonstrate functionality
    print("=== All Articles (sorted by date) ===")
    for article in feed.fetch_all_articles():
        print(f"- {article.title} by {article.author} on {article.date}")

    print("\n=== Articles for 2026-02-04 ===")
    for article in feed.fetch_articles_by_date("2026-02-04"):
        print(f"- {article.title}")

    print("\n=== Most Recent Article ===")
    recent = feed.fetch_most_recent_article()
    if recent:
        print(f"- {recent.title} by {recent.author}")

    print("\n=== Empty Feed Handling ===")
    empty_feed = NewsFeed()
    print(f"Empty feed articles: {empty_feed.fetch_all_articles()}")
    print(f"Empty feed most recent: {empty_feed.fetch_most_recent_article()}")
    print(f"Empty feed by date: {empty_feed.fetch_articles_by_date('2026-02-04')}")

    print("\n=== Invalid Date Handling ===")
    print(f"Invalid date result: {feed.fetch_articles_by_date('invalid-date')}")
