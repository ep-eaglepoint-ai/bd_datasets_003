#include <iostream>
#include <string>
#include <vector>
#include "Library.h"
#include "DateUtils.h"

static void printBooks(const std::vector<Book>& books) {
    if (books.empty()) {
        std::cout << "No books found.\n";
        return;
    }
    for (const auto& book : books) {
        std::cout << "  ISBN: " << book.isbn
                  << " | Title: " << book.title
                  << " | Author: " << book.author
                  << " | " << (book.isAvailable ? "Available" : "Checked Out");
        if (!book.isAvailable) {
            std::cout << " (Due: " << book.dueDate << ")";
        }
        std::cout << "\n";
    }
}

int main() {
    std::string currentDate;
    std::cout << "Welcome to the Library Catalog System\n";
    std::cout << "Enter current date (YYYY-MM-DD): ";
    std::getline(std::cin, currentDate);

    while (!isValidDate(currentDate)) {
        std::cout << "Invalid date format. Please enter date as YYYY-MM-DD: ";
        std::getline(std::cin, currentDate);
    }

    Library library("./data");

    int choice = 0;
    while (choice != 8) {
        std::cout << "\n===== Library Catalog System =====\n";
        std::cout << "1. Add Book\n";
        std::cout << "2. Add Patron\n";
        std::cout << "3. Search Books\n";
        std::cout << "4. Checkout Book\n";
        std::cout << "5. Return Book\n";
        std::cout << "6. View Patron's Books\n";
        std::cout << "7. View Overdue Books\n";
        std::cout << "8. Exit\n";
        std::cout << "Enter choice: ";

        std::string input;
        std::getline(std::cin, input);
        try {
            choice = std::stoi(input);
        } catch (...) {
            std::cout << "Invalid input. Please enter a number.\n";
            continue;
        }

        if (choice == 1) {
            std::string isbn, title, author;
            std::cout << "Enter ISBN: ";
            std::getline(std::cin, isbn);
            std::cout << "Enter Title: ";
            std::getline(std::cin, title);
            std::cout << "Enter Author: ";
            std::getline(std::cin, author);
            if (library.addBook(isbn, title, author)) {
                std::cout << "Book added successfully.\n";
            } else {
                std::cout << "Failed to add book. ISBN may already exist or fields are empty.\n";
            }
        } else if (choice == 2) {
            std::string id, name;
            std::cout << "Enter Patron ID: ";
            std::getline(std::cin, id);
            std::cout << "Enter Name: ";
            std::getline(std::cin, name);
            if (library.addPatron(id, name)) {
                std::cout << "Patron added successfully.\n";
            } else {
                std::cout << "Failed to add patron. ID may already exist or fields are empty.\n";
            }
        } else if (choice == 3) {
            std::cout << "Search by (1) Title or (2) Author: ";
            std::string searchChoice;
            std::getline(std::cin, searchChoice);
            std::cout << "Enter search query: ";
            std::string query;
            std::getline(std::cin, query);
            std::vector<Book> results;
            if (searchChoice == "1") {
                results = library.searchByTitle(query);
            } else if (searchChoice == "2") {
                results = library.searchByAuthor(query);
            } else {
                std::cout << "Invalid search option.\n";
                continue;
            }
            std::cout << "Search Results:\n";
            printBooks(results);
        } else if (choice == 4) {
            std::string isbn, patronId;
            std::cout << "Enter Book ISBN: ";
            std::getline(std::cin, isbn);
            std::cout << "Enter Patron ID: ";
            std::getline(std::cin, patronId);
            if (library.checkoutBook(isbn, patronId, currentDate)) {
                std::cout << "Book checked out successfully.\n";
            } else {
                std::cout << "Checkout failed. Book may not exist, already checked out, or patron not found.\n";
            }
        } else if (choice == 5) {
            std::string isbn;
            std::cout << "Enter Book ISBN: ";
            std::getline(std::cin, isbn);
            if (library.returnBook(isbn)) {
                std::cout << "Book returned successfully.\n";
            } else {
                std::cout << "Return failed. Book may not exist or was not checked out.\n";
            }
        } else if (choice == 6) {
            std::string patronId;
            std::cout << "Enter Patron ID: ";
            std::getline(std::cin, patronId);
            std::vector<Book> patronBooks = library.getPatronBooks(patronId);
            std::cout << "Books checked out by patron " << patronId << ":\n";
            printBooks(patronBooks);
        } else if (choice == 7) {
            std::vector<Book> overdue = library.getOverdueBooks(currentDate);
            std::cout << "Overdue Books:\n";
            printBooks(overdue);
        } else if (choice == 8) {
            library.saveData();
            std::cout << "Data saved. Goodbye!\n";
        } else {
            std::cout << "Invalid choice. Please try again.\n";
        }
    }

    return 0;
}
