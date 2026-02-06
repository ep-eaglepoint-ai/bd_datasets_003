#include "Patron.h"
#include <sstream>
#include <algorithm>

Patron::Patron() {}

Patron::Patron(const std::string& id, const std::string& name)
    : patronId(id), name(name) {}

int Patron::getBorrowedCount() const {
    return static_cast<int>(borrowedBooks.size());
}

void Patron::addBook(const std::string& isbn) {
    borrowedBooks.push_back(isbn);
}

void Patron::removeBook(const std::string& isbn) {
    auto it = std::find(borrowedBooks.begin(), borrowedBooks.end(), isbn);
    if (it != borrowedBooks.end()) {
        borrowedBooks.erase(it);
    }
}

bool Patron::hasBorrowed(const std::string& isbn) const {
    return std::find(borrowedBooks.begin(), borrowedBooks.end(), isbn) != borrowedBooks.end();
}

std::string Patron::serialize() const {
    std::ostringstream oss;
    oss << patronId << "|" << name << "|";
    for (size_t i = 0; i < borrowedBooks.size(); ++i) {
        if (i > 0) oss << ",";
        oss << borrowedBooks[i];
    }
    return oss.str();
}

Patron Patron::deserialize(const std::string& line) {
    Patron patron;
    std::istringstream iss(line);
    std::string token;

    if (!std::getline(iss, token, '|')) return patron;
    patron.patronId = token;

    if (!std::getline(iss, token, '|')) return patron;
    patron.name = token;

    if (!std::getline(iss, token, '|')) return patron;
    if (!token.empty()) {
        std::istringstream bookStream(token);
        std::string isbn;
        while (std::getline(bookStream, isbn, ',')) {
            if (!isbn.empty()) {
                patron.borrowedBooks.push_back(isbn);
            }
        }
    }

    return patron;
}
