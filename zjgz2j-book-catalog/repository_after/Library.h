#ifndef LIBRARY_H
#define LIBRARY_H

#include <string>
#include <vector>
#include <map>
#include "Book.h"
#include "Patron.h"

class Library {
private:
    std::map<std::string, Book> books;
    std::map<std::string, Patron> patrons;
    std::string dataDir;

public:
    Library(const std::string& dataDir);

    bool addBook(const std::string& isbn, const std::string& title, const std::string& author);
    bool addPatron(const std::string& id, const std::string& name);
    bool checkoutBook(const std::string& isbn, const std::string& patronId, const std::string& currentDate);
    bool returnBook(const std::string& isbn);

    std::vector<Book> searchByTitle(const std::string& query) const;
    std::vector<Book> searchByAuthor(const std::string& author) const;
    std::vector<Book> getPatronBooks(const std::string& patronId) const;
    std::vector<Book> getOverdueBooks(const std::string& currentDate) const;

    std::string displayBookInfo(const std::string& isbn) const;

    void saveData() const;
    void loadData();

    const std::map<std::string, Book>& getBooks() const;
    const std::map<std::string, Patron>& getPatrons() const;
};

#endif
