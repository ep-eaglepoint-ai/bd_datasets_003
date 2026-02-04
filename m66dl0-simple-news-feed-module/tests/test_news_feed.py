"""
Tests for the Simple News Feed Module.
"""

import pytest
from datetime import date
import sys
import os

# Add repository_after to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from news_feed import Article, NewsFeed, load_articles_from_list


class TestArticle:
    """Tests for the Article dataclass."""

    def test_article_creation_with_date_object(self):
        """Test creating an article with a date object."""
        article = Article(
            title="Test Article",
            author="Test Author",
            date=date(2026, 2, 4),
            content="Test content"
        )
        assert article.title == "Test Article"
        assert article.author == "Test Author"
        assert article.date == date(2026, 2, 4)
        assert article.content == "Test content"

    def test_article_creation_with_date_string(self):
        """Test creating an article with a date string."""
        article = Article(
            title="Test Article",
            author="Test Author",
            date="2026-02-04",
            content="Test content"
        )
        assert article.date == date(2026, 2, 4)

    def test_article_attributes(self):
        """Test that article has all required attributes."""
        article = Article(
            title="Title",
            author="Author",
            date=date(2026, 2, 4),
            content="Content"
        )
        assert hasattr(article, 'title')
        assert hasattr(article, 'author')
        assert hasattr(article, 'date')
        assert hasattr(article, 'content')


class TestNewsFeed:
    """Tests for the NewsFeed class."""

    @pytest.fixture
    def sample_articles(self):
        """Create sample articles for testing."""
        return [
            Article("Article 1", "Author A", date(2026, 2, 4), "Content 1"),
            Article("Article 2", "Author B", date(2026, 2, 3), "Content 2"),
            Article("Article 3", "Author A", date(2026, 2, 4), "Content 3"),
            Article("Article 4", "Author C", date(2026, 2, 5), "Content 4"),
        ]

    @pytest.fixture
    def empty_feed(self):
        """Create an empty news feed."""
        return NewsFeed()

    @pytest.fixture
    def populated_feed(self, sample_articles):
        """Create a news feed with sample articles."""
        return NewsFeed(sample_articles)

    # Tests for fetch_all_articles
    def test_fetch_all_articles_empty_feed(self, empty_feed):
        """Test fetching all articles from an empty feed."""
        result = empty_feed.fetch_all_articles()
        assert result == []
        assert isinstance(result, list)

    def test_fetch_all_articles_returns_all(self, populated_feed):
        """Test that fetch_all_articles returns all articles."""
        result = populated_feed.fetch_all_articles()
        assert len(result) == 4

    def test_fetch_all_articles_sorted_by_date(self, populated_feed):
        """Test that articles are sorted by date (oldest to newest)."""
        result = populated_feed.fetch_all_articles()
        dates = [article.date for article in result]
        assert dates == sorted(dates)

    def test_fetch_all_articles_ascending_order(self, populated_feed):
        """Test sort order is ascending (oldest first)."""
        result = populated_feed.fetch_all_articles()
        assert result[0].date == date(2026, 2, 3)  # Oldest
        assert result[-1].date == date(2026, 2, 5)  # Newest

    # Tests for fetch_articles_by_date
    def test_fetch_articles_by_date_with_date_object(self, populated_feed):
        """Test fetching articles by date using a date object."""
        result = populated_feed.fetch_articles_by_date(date(2026, 2, 4))
        assert len(result) == 2
        for article in result:
            assert article.date == date(2026, 2, 4)

    def test_fetch_articles_by_date_with_string(self, populated_feed):
        """Test fetching articles by date using a string."""
        result = populated_feed.fetch_articles_by_date("2026-02-04")
        assert len(result) == 2
        for article in result:
            assert article.date == date(2026, 2, 4)

    def test_fetch_articles_by_date_no_match(self, populated_feed):
        """Test fetching articles for a date with no articles."""
        result = populated_feed.fetch_articles_by_date(date(2026, 2, 10))
        assert result == []

    def test_fetch_articles_by_date_empty_feed(self, empty_feed):
        """Test fetching articles by date from an empty feed."""
        result = empty_feed.fetch_articles_by_date(date(2026, 2, 4))
        assert result == []

    def test_fetch_articles_by_date_invalid_date_string(self, populated_feed):
        """Test handling of invalid date string."""
        result = populated_feed.fetch_articles_by_date("invalid-date")
        assert result == []

    def test_fetch_articles_by_date_empty_string(self, populated_feed):
        """Test handling of empty date string."""
        result = populated_feed.fetch_articles_by_date("")
        assert result == []

    def test_fetch_articles_by_date_sorted(self, populated_feed):
        """Test that articles by date are sorted."""
        result = populated_feed.fetch_articles_by_date(date(2026, 2, 4))
        if len(result) > 1:
            dates = [article.date for article in result]
            assert dates == sorted(dates)

    # Tests for fetch_most_recent_article
    def test_fetch_most_recent_article(self, populated_feed):
        """Test fetching the most recent article."""
        result = populated_feed.fetch_most_recent_article()
        assert result is not None
        assert result.date == date(2026, 2, 5)
        assert result.title == "Article 4"

    def test_fetch_most_recent_article_empty_feed(self, empty_feed):
        """Test fetching most recent from empty feed returns None."""
        result = empty_feed.fetch_most_recent_article()
        assert result is None

    # Tests for empty list handling
    def test_empty_feed_is_empty(self, empty_feed):
        """Test that empty feed reports as empty."""
        assert empty_feed.is_empty() is True
        assert empty_feed.get_article_count() == 0

    def test_populated_feed_not_empty(self, populated_feed):
        """Test that populated feed is not empty."""
        assert populated_feed.is_empty() is False
        assert populated_feed.get_article_count() == 4

    # Tests for add_article
    def test_add_article(self, empty_feed):
        """Test adding an article to the feed."""
        article = Article("New Article", "Author", date(2026, 2, 4), "Content")
        empty_feed.add_article(article)
        assert empty_feed.get_article_count() == 1
        assert not empty_feed.is_empty()


class TestLoadArticlesFromList:
    """Tests for the load_articles_from_list function."""

    def test_load_valid_articles(self):
        """Test loading articles from valid dictionary list."""
        data = [
            {
                "title": "Test Article",
                "author": "Test Author",
                "date": "2026-02-04",
                "content": "Test content"
            }
        ]
        articles = load_articles_from_list(data)
        assert len(articles) == 1
        assert articles[0].title == "Test Article"
        assert articles[0].date == date(2026, 2, 4)

    def test_load_multiple_articles(self):
        """Test loading multiple articles."""
        data = [
            {"title": "Article 1", "author": "Author 1", "date": "2026-02-04", "content": "Content 1"},
            {"title": "Article 2", "author": "Author 2", "date": "2026-02-04", "content": "Content 2"},
        ]
        articles = load_articles_from_list(data)
        assert len(articles) == 2

    def test_load_empty_list(self):
        """Test loading from empty list."""
        articles = load_articles_from_list([])
        assert articles == []

    def test_load_with_missing_fields(self):
        """Test loading articles with missing optional fields."""
        data = [{"title": "Only Title", "author": "", "date": "2026-02-04", "content": ""}]
        articles = load_articles_from_list(data)
        assert len(articles) == 1
        assert articles[0].title == "Only Title"


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_single_article_feed(self):
        """Test feed with single article."""
        article = Article("Solo", "Author", date(2026, 2, 4), "Content")
        feed = NewsFeed([article])
        
        assert feed.fetch_all_articles() == [article]
        assert feed.fetch_most_recent_article() == article
        assert len(feed.fetch_articles_by_date(date(2026, 2, 4))) == 1

    def test_all_same_date(self):
        """Test feed where all articles have the same date."""
        articles = [
            Article(f"Article {i}", "Author", date(2026, 2, 4), "Content")
            for i in range(3)
        ]
        feed = NewsFeed(articles)
        
        result = feed.fetch_articles_by_date(date(2026, 2, 4))
        assert len(result) == 3

    def test_articles_not_modified_after_fetch(self):
        """Test that fetching doesn't modify internal list."""
        article = Article("Test", "Author", date(2026, 2, 4), "Content")
        feed = NewsFeed([article])
        
        result = feed.fetch_all_articles()
        result.append(Article("New", "Author", date(2026, 2, 5), "Content"))
        
        assert feed.get_article_count() == 1
