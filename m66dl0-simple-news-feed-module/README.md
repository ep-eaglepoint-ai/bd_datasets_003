# M66DL0 - Simple News Feed Module

A Python module that provides a simple news feed with article management. Fetches articles from a local list and provides them by date.

## Commands

### 1. Setup
```bash
docker compose build
```

### 2. Run Tests on repository_before
```bash
docker compose run --rm app bash -c 'cd repository_before && python -c "print(\"No implementation in repository_before\")"'
```

### 3. Run Tests on repository_after
```bash
docker compose run --rm app bash -c 'cd repository_after && python -m pytest ../tests/test_news_feed.py -v'
```

### 4. Run Evaluation
```bash
docker compose run --rm app python evaluation/evaluation.py
```

## Features

- **Article Representation**: Each article has `title`, `author`, `date`, and `content` attributes
- **Fetch All Articles**: Returns all articles sorted by date (oldest to newest)
- **Fetch Articles by Date**: Filter articles by a specific date
- **Fetch Most Recent Article**: Get the latest article
- **Safe Handling**: Gracefully handles empty lists and invalid/missing dates

## Test Results

```
tests/test_news_feed.py::TestArticle::test_article_creation_with_date_object PASSED
tests/test_news_feed.py::TestArticle::test_article_creation_with_date_string PASSED
tests/test_news_feed.py::TestArticle::test_article_attributes PASSED
tests/test_news_feed.py::TestNewsFeed::test_fetch_all_articles_empty_feed PASSED
tests/test_news_feed.py::TestNewsFeed::test_fetch_all_articles_returns_all PASSED
tests/test_news_feed.py::TestNewsFeed::test_fetch_all_articles_sorted_by_date PASSED
...
============================== 26 passed ==============================
```

All 26 tests passing means:
- ✅ Article creation with date object and string
- ✅ Fetch all articles sorted by date
- ✅ Fetch articles by specific date
- ✅ Fetch most recent article
- ✅ Handle empty feed gracefully
- ✅ Handle invalid/missing dates safely

## Structure

```
.
├── Dockerfile
├── README.md
├── docker-compose.yml
├── requirements.txt
├── evaluation/
│   ├── evaluation.py
│   └── reports/
├── patches/
├── repository_before/
│   └── .gitkeep
├── repository_after/
│   └── news_feed.py
├── tests/
│   └── test_news_feed.py
└── trajectory/
```

## Usage

```python
from news_feed import Article, NewsFeed, load_articles_from_list
from datetime import date

# Create articles manually
article = Article(
    title="Breaking News",
    author="Melkmau Elias",
    date=date(2024, 1, 15),
    content="Important news content"
)

# Or load from a list of dictionaries
data = [
    {"title": "News 1", "author": "Author 1", "date": "2024-01-15", "content": "Content 1"},
    {"title": "News 2", "author": "Author 2", "date": "2024-01-16", "content": "Content 2"},
]
articles = load_articles_from_list(data)

# Create a news feed
feed = NewsFeed(articles)

# Fetch all articles (sorted by date)
all_articles = feed.fetch_all_articles()

# Fetch articles for a specific date
jan_15_articles = feed.fetch_articles_by_date("2024-01-15")

# Get the most recent article
latest = feed.fetch_most_recent_article()
```