# Trajectory: Building a Simple, In-Memory News Feed


We need to create a system that acts like a database for news articles but operates entirely within a single Python script. We have to store structured data (titles, authors, dates), search through it (find by date), and organize it (sort by time), all without the help of SQL or external APIs.

1. **Structure:** How do we ensure every article has the same fields?
2. **Searching:** How do we efficiently find articles from a specific day without looking through unrelated data?
3. **Safety:** What happens if the feed is empty or the user asks for a date that doesn't exist?

## The Solution: Dataclasses & List Comprehensions

We will use Python's standard library to build a lightweight, robust system.

1. **Structured Data:** We will use `dataclasses` (from Python 3.7+) instead of plain dictionaries. This enforces a schema: every article *must* have a title, date, etc.
2. **Filtering:** We will use list comprehensions to filter articles. This is Python's most efficient and readable way to say "Give me items from this list ONLY IF the date matches X."
3. **Date Handling:** We will strictly use the `datetime` module. Storing dates as strings (e.g., "01-02-2023") is dangerous because string sorting doesn't always match chronological sorting (e.g., "10-01" comes before "2-01" in strings). Real date objects resolve this.

## Implementation Steps

1. **Define the Blueprint:** Create an `Article` dataclass. This acts as our "table definition."
2. **Mock Data:** Create a list of `Article` objects to simulate a loaded feed.
3. **The Sorting Logic:** Implement a `fetch_all_articles()` function that returns the list sorted by date. We will use Python's built-in `sorted()` function with a lambda key.
4. **The Filter Logic:** Implement `fetch_articles_by_date(date_str)`.  This requires converting the input string into a date object and comparing it against our stored data.
5. **Edge Case Protection:** Add checks for `len(articles) == 0`. If the feed is empty, `fetch_most_recent_article()` should return `None` (or a safe message) rather than crashing with an `IndexError`.

## Why I did it this way (Refinement)

I initially considered just using a list of dictionaries, like `{'title': '...', 'date': '...'}`.

* **Correction:** I chose `dataclasses` instead. While dictionaries are flexible, they are error-prone (typos in keys like 'Date' vs 'date'). Dataclasses provide dot-notation access (`article.date`), type hinting, and auto-generated string representations, making the code much easier to debug and maintain.

## Testing Strategy

Since this is a single-file module, we will include a `if __name__ == "__main__":` block at the bottom of the file. This block will act as a manual test suite:

1. **Happy Path:** Add articles, fetch them, and print the results to verify sorting.
2. **Edge Case:** Clear the list and try to fetch the "latest" article to ensure the program doesn't crash.

---

### 📚 Recommended Resources

**1. Read: Python Dataclasses**
Understanding why we use classes for data storage instead of just dictionaries.

* [Real Python: The Ultimate Guide to Data Classes](https://realpython.com/python-data-classes/)

**2. Read: Python Sorting HOWTO**
A guide on how to sort complex objects (like our Articles) using specific keys (like the Date).

* [Python Docs: Sorting HOWTO](https://docs.python.org/3/howto/sorting.html)

**3. Read: Python Datetime**
Handling dates correctly is crucial. This explains how to parse strings into date objects.

* [W3Schools: Python Datetime](https://www.w3schools.com/python/python_datetime.asp)