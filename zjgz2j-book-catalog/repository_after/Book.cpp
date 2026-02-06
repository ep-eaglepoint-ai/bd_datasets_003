#include "Book.h"
#include <sstream>

Book::Book() : isAvailable(true) {}

Book::Book(const std::string& isbn, const std::string& title, const std::string& author)
    : isbn(isbn), title(title), author(author), isAvailable(true) {}

std::string Book::serialize() const {
    std::ostringstream oss;
    oss << isbn << "|" << title << "|" << author << "|"
        << (isAvailable ? "1" : "0") << "|" << borrowedBy << "|" << dueDate;
    return oss.str();
}

Book Book::deserialize(const std::string& line) {
    Book book;
    std::istringstream iss(line);
    std::string token;

    if (!std::getline(iss, token, '|')) return book;
    book.isbn = token;

    if (!std::getline(iss, token, '|')) return book;
    book.title = token;

    if (!std::getline(iss, token, '|')) return book;
    book.author = token;

    if (!std::getline(iss, token, '|')) return book;
    book.isAvailable = (token == "1");

    if (!std::getline(iss, token, '|')) return book;
    book.borrowedBy = token;

    if (!std::getline(iss, token, '|')) return book;
    book.dueDate = token;

    return book;
}
