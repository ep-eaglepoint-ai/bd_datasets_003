#ifndef PATRON_H
#define PATRON_H

#include <string>
#include <vector>

class Patron {
public:
    std::string patronId;
    std::string name;
    std::vector<std::string> borrowedBooks;

    Patron();
    Patron(const std::string& id, const std::string& name);

    int getBorrowedCount() const;
    void addBook(const std::string& isbn);
    void removeBook(const std::string& isbn);
    bool hasBorrowed(const std::string& isbn) const;

    std::string serialize() const;
    static Patron deserialize(const std::string& line);
};

#endif
