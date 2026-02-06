#ifndef BOOK_H
#define BOOK_H

#include <string>

class Book {
public:
    std::string isbn;
    std::string title;
    std::string author;
    bool isAvailable;
    std::string borrowedBy;
    std::string dueDate;

    Book();
    Book(const std::string& isbn, const std::string& title, const std::string& author);

    std::string serialize() const;
    static Book deserialize(const std::string& line);
};

#endif
