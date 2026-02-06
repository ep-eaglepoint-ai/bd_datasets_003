#include "Library.h"
#include "DateUtils.h"
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cctype>
#include <sys/stat.h>

static std::string toLowerStr(const std::string& s) {
    std::string result = s;
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return result;
}

Library::Library(const std::string& dataDir) : dataDir(dataDir) {
    struct stat st;
    if (stat(dataDir.c_str(), &st) != 0) {
        mkdir(dataDir.c_str(), 0755);
    }
    loadData();
}

bool Library::addBook(const std::string& isbn, const std::string& title, const std::string& author) {
    if (isbn.empty() || title.empty() || author.empty()) return false;
    if (books.find(isbn) != books.end()) return false;

    books[isbn] = Book(isbn, title, author);
    saveData();
    return true;
}

bool Library::addPatron(const std::string& id, const std::string& name) {
    if (id.empty() || name.empty()) return false;
    if (patrons.find(id) != patrons.end()) return false;

    patrons[id] = Patron(id, name);
    saveData();
    return true;
}

bool Library::checkoutBook(const std::string& isbn, const std::string& patronId, const std::string& currentDate) {
    auto bookIt = books.find(isbn);
    if (bookIt == books.end()) return false;

    if (!bookIt->second.isAvailable) return false;

    auto patronIt = patrons.find(patronId);
    if (patronIt == patrons.end()) return false;

    std::string dueDate = addDays(currentDate, 14);
    if (dueDate.empty()) return false;

    bookIt->second.isAvailable = false;
    bookIt->second.borrowedBy = patronId;
    bookIt->second.dueDate = dueDate;
    patronIt->second.addBook(isbn);

    saveData();
    return true;
}

bool Library::returnBook(const std::string& isbn) {
    auto bookIt = books.find(isbn);
    if (bookIt == books.end()) return false;

    if (bookIt->second.isAvailable) return false;

    std::string patronId = bookIt->second.borrowedBy;
    auto patronIt = patrons.find(patronId);
    if (patronIt != patrons.end()) {
        patronIt->second.removeBook(isbn);
    }

    bookIt->second.isAvailable = true;
    bookIt->second.borrowedBy = "";
    bookIt->second.dueDate = "";

    saveData();
    return true;
}

std::vector<Book> Library::searchByTitle(const std::string& query) const {
    std::vector<Book> results;
    std::string lowerQuery = toLowerStr(query);

    for (const auto& pair : books) {
        std::string lowerTitle = toLowerStr(pair.second.title);
        if (lowerTitle.find(lowerQuery) != std::string::npos) {
            results.push_back(pair.second);
        }
    }
    return results;
}

std::vector<Book> Library::searchByAuthor(const std::string& author) const {
    std::vector<Book> results;
    std::string lowerAuthor = toLowerStr(author);

    for (const auto& pair : books) {
        std::string lowerBookAuthor = toLowerStr(pair.second.author);
        if (lowerBookAuthor.find(lowerAuthor) != std::string::npos) {
            results.push_back(pair.second);
        }
    }
    return results;
}

std::vector<Book> Library::getPatronBooks(const std::string& patronId) const {
    std::vector<Book> results;
    auto patronIt = patrons.find(patronId);
    if (patronIt == patrons.end()) return results;

    for (const auto& isbn : patronIt->second.borrowedBooks) {
        auto bookIt = books.find(isbn);
        if (bookIt != books.end()) {
            results.push_back(bookIt->second);
        }
    }
    return results;
}

std::vector<Book> Library::getOverdueBooks(const std::string& currentDate) const {
    std::vector<Book> results;
    for (const auto& pair : books) {
        if (!pair.second.isAvailable && !pair.second.dueDate.empty()) {
            if (isDateBefore(pair.second.dueDate, currentDate)) {
                results.push_back(pair.second);
            }
        }
    }
    return results;
}

std::string Library::displayBookInfo(const std::string& isbn) const {
    auto it = books.find(isbn);
    if (it == books.end()) return "Book not found.";

    const Book& book = it->second;
    std::ostringstream oss;
    oss << "ISBN: " << book.isbn << "\n";
    oss << "Title: " << book.title << "\n";
    oss << "Author: " << book.author << "\n";
    oss << "Status: " << (book.isAvailable ? "Available" : "Checked Out") << "\n";

    if (!book.isAvailable) {
        oss << "Borrowed By: " << book.borrowedBy << "\n";
        oss << "Due Date: " << book.dueDate << "\n";
    }

    return oss.str();
}

void Library::saveData() const {
    std::string booksFile = dataDir + "/books.txt";
    std::ofstream booksOut(booksFile);
    if (booksOut.is_open()) {
        for (const auto& pair : books) {
            booksOut << pair.second.serialize() << "\n";
        }
        booksOut.close();
    }

    std::string patronsFile = dataDir + "/patrons.txt";
    std::ofstream patronsOut(patronsFile);
    if (patronsOut.is_open()) {
        for (const auto& pair : patrons) {
            patronsOut << pair.second.serialize() << "\n";
        }
        patronsOut.close();
    }
}

void Library::loadData() {
    books.clear();
    patrons.clear();

    std::string booksFile = dataDir + "/books.txt";
    std::ifstream booksIn(booksFile);
    if (booksIn.is_open()) {
        std::string line;
        while (std::getline(booksIn, line)) {
            if (!line.empty()) {
                Book book = Book::deserialize(line);
                if (!book.isbn.empty()) {
                    books[book.isbn] = book;
                }
            }
        }
        booksIn.close();
    }

    std::string patronsFile = dataDir + "/patrons.txt";
    std::ifstream patronsIn(patronsFile);
    if (patronsIn.is_open()) {
        std::string line;
        while (std::getline(patronsIn, line)) {
            if (!line.empty()) {
                Patron patron = Patron::deserialize(line);
                if (!patron.patronId.empty()) {
                    patrons[patron.patronId] = patron;
                }
            }
        }
        patronsIn.close();
    }
}

const std::map<std::string, Book>& Library::getBooks() const {
    return books;
}

const std::map<std::string, Patron>& Library::getPatrons() const {
    return patrons;
}
