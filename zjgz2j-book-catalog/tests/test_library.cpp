#include <gtest/gtest.h>
#include <fstream>
#include <cstdlib>
#include <sys/stat.h>
#include <dirent.h>
#include <unistd.h>
#include "Book.h"
#include "Patron.h"
#include "Library.h"
#include "DateUtils.h"

// Helper to remove a directory and its contents
static void removeDir(const std::string& path) {
    DIR* dir = opendir(path.c_str());
    if (dir) {
        struct dirent* entry;
        while ((entry = readdir(dir)) != nullptr) {
            std::string name = entry->d_name;
            if (name == "." || name == "..") continue;
            std::string fullPath = path + "/" + name;
            remove(fullPath.c_str());
        }
        closedir(dir);
        rmdir(path.c_str());
    }
}

// ==================== DateUtils Tests ====================

TEST(DateUtilsTest, IsLeapYear) {
    EXPECT_TRUE(isLeapYear(2000));
    EXPECT_TRUE(isLeapYear(2024));
    EXPECT_FALSE(isLeapYear(1900));
    EXPECT_FALSE(isLeapYear(2023));
    EXPECT_TRUE(isLeapYear(2400));
    EXPECT_FALSE(isLeapYear(2100));
}

TEST(DateUtilsTest, DaysInMonth) {
    EXPECT_EQ(daysInMonth(1, 2026), 31);
    EXPECT_EQ(daysInMonth(2, 2026), 28);
    EXPECT_EQ(daysInMonth(2, 2024), 29);
    EXPECT_EQ(daysInMonth(4, 2026), 30);
    EXPECT_EQ(daysInMonth(12, 2026), 31);
    EXPECT_EQ(daysInMonth(0, 2026), 0);
    EXPECT_EQ(daysInMonth(13, 2026), 0);
}

TEST(DateUtilsTest, IsValidDate) {
    EXPECT_TRUE(isValidDate("2026-02-06"));
    EXPECT_TRUE(isValidDate("2024-02-29"));
    EXPECT_TRUE(isValidDate("2026-12-31"));
    EXPECT_FALSE(isValidDate("2026-02-29"));
    EXPECT_FALSE(isValidDate("2026-13-01"));
    EXPECT_FALSE(isValidDate("2026-00-01"));
    EXPECT_FALSE(isValidDate("2026-01-32"));
    EXPECT_FALSE(isValidDate("invalid"));
    EXPECT_FALSE(isValidDate(""));
    EXPECT_FALSE(isValidDate("2026/02/06"));
    EXPECT_FALSE(isValidDate("26-02-06"));
    EXPECT_FALSE(isValidDate("2026-2-6"));
}

TEST(DateUtilsTest, AddDaysSimple) {
    EXPECT_EQ(addDays("2026-02-06", 14), "2026-02-20");
    EXPECT_EQ(addDays("2026-02-06", 0), "2026-02-06");
    EXPECT_EQ(addDays("2026-02-06", 1), "2026-02-07");
}

TEST(DateUtilsTest, AddDaysCrossMonth) {
    EXPECT_EQ(addDays("2026-02-20", 14), "2026-03-06");
    EXPECT_EQ(addDays("2026-01-25", 14), "2026-02-08");
    EXPECT_EQ(addDays("2026-03-25", 14), "2026-04-08");
}

TEST(DateUtilsTest, AddDaysCrossYear) {
    EXPECT_EQ(addDays("2026-12-25", 14), "2027-01-08");
    EXPECT_EQ(addDays("2026-12-31", 1), "2027-01-01");
}

TEST(DateUtilsTest, AddDaysLeapYear) {
    EXPECT_EQ(addDays("2024-02-15", 14), "2024-02-29");
    EXPECT_EQ(addDays("2024-02-20", 14), "2024-03-05");
}

TEST(DateUtilsTest, AddDaysInvalidDate) {
    EXPECT_EQ(addDays("invalid", 14), "");
    EXPECT_EQ(addDays("", 14), "");
}

TEST(DateUtilsTest, IsDateBefore) {
    EXPECT_TRUE(isDateBefore("2026-01-01", "2026-02-01"));
    EXPECT_TRUE(isDateBefore("2025-12-31", "2026-01-01"));
    EXPECT_FALSE(isDateBefore("2026-02-01", "2026-01-01"));
    EXPECT_FALSE(isDateBefore("2026-01-01", "2026-01-01"));
}

TEST(DateUtilsTest, ParseDate) {
    int y, m, d;
    EXPECT_TRUE(parseDate("2026-02-06", y, m, d));
    EXPECT_EQ(y, 2026);
    EXPECT_EQ(m, 2);
    EXPECT_EQ(d, 6);

    EXPECT_FALSE(parseDate("not-a-date", y, m, d));
}

// ==================== Book Tests ====================

TEST(BookTest, DefaultConstructor) {
    Book book;
    EXPECT_TRUE(book.isbn.empty());
    EXPECT_TRUE(book.title.empty());
    EXPECT_TRUE(book.author.empty());
    EXPECT_TRUE(book.isAvailable);
    EXPECT_TRUE(book.borrowedBy.empty());
    EXPECT_TRUE(book.dueDate.empty());
}

TEST(BookTest, ParameterizedConstructor) {
    Book book("978-0-13-110362-7", "The C Programming Language", "Kernighan and Ritchie");
    EXPECT_EQ(book.isbn, "978-0-13-110362-7");
    EXPECT_EQ(book.title, "The C Programming Language");
    EXPECT_EQ(book.author, "Kernighan and Ritchie");
    EXPECT_TRUE(book.isAvailable);
    EXPECT_TRUE(book.borrowedBy.empty());
    EXPECT_TRUE(book.dueDate.empty());
}

TEST(BookTest, SerializeAvailable) {
    Book book("ISBN001", "Test Title", "Test Author");
    std::string serialized = book.serialize();
    EXPECT_EQ(serialized, "ISBN001|Test Title|Test Author|1||");
}

TEST(BookTest, SerializeCheckedOut) {
    Book book("ISBN001", "Test Title", "Test Author");
    book.isAvailable = false;
    book.borrowedBy = "P001";
    book.dueDate = "2026-02-20";
    std::string serialized = book.serialize();
    EXPECT_EQ(serialized, "ISBN001|Test Title|Test Author|0|P001|2026-02-20");
}

TEST(BookTest, DeserializeAvailable) {
    Book book = Book::deserialize("ISBN001|Test Title|Test Author|1||");
    EXPECT_EQ(book.isbn, "ISBN001");
    EXPECT_EQ(book.title, "Test Title");
    EXPECT_EQ(book.author, "Test Author");
    EXPECT_TRUE(book.isAvailable);
    EXPECT_TRUE(book.borrowedBy.empty());
    EXPECT_TRUE(book.dueDate.empty());
}

TEST(BookTest, DeserializeCheckedOut) {
    Book book = Book::deserialize("ISBN001|Test Title|Test Author|0|P001|2026-02-20");
    EXPECT_EQ(book.isbn, "ISBN001");
    EXPECT_EQ(book.title, "Test Title");
    EXPECT_EQ(book.author, "Test Author");
    EXPECT_FALSE(book.isAvailable);
    EXPECT_EQ(book.borrowedBy, "P001");
    EXPECT_EQ(book.dueDate, "2026-02-20");
}

TEST(BookTest, SerializeDeserializeRoundTrip) {
    Book original("978-123", "My Book", "Some Author");
    original.isAvailable = false;
    original.borrowedBy = "PAT42";
    original.dueDate = "2026-03-15";

    Book restored = Book::deserialize(original.serialize());
    EXPECT_EQ(restored.isbn, original.isbn);
    EXPECT_EQ(restored.title, original.title);
    EXPECT_EQ(restored.author, original.author);
    EXPECT_EQ(restored.isAvailable, original.isAvailable);
    EXPECT_EQ(restored.borrowedBy, original.borrowedBy);
    EXPECT_EQ(restored.dueDate, original.dueDate);
}

TEST(BookTest, DeserializeEmptyString) {
    Book book = Book::deserialize("");
    EXPECT_TRUE(book.isbn.empty());
}

// ==================== Patron Tests ====================

TEST(PatronTest, DefaultConstructor) {
    Patron patron;
    EXPECT_TRUE(patron.patronId.empty());
    EXPECT_TRUE(patron.name.empty());
    EXPECT_EQ(patron.getBorrowedCount(), 0);
}

TEST(PatronTest, ParameterizedConstructor) {
    Patron patron("P001", "John Doe");
    EXPECT_EQ(patron.patronId, "P001");
    EXPECT_EQ(patron.name, "John Doe");
    EXPECT_EQ(patron.getBorrowedCount(), 0);
}

TEST(PatronTest, AddBook) {
    Patron patron("P001", "John Doe");
    patron.addBook("ISBN001");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
    EXPECT_TRUE(patron.hasBorrowed("ISBN001"));
}

TEST(PatronTest, RemoveBook) {
    Patron patron("P001", "John Doe");
    patron.addBook("ISBN001");
    patron.addBook("ISBN002");
    EXPECT_EQ(patron.getBorrowedCount(), 2);

    patron.removeBook("ISBN001");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
    EXPECT_FALSE(patron.hasBorrowed("ISBN001"));
    EXPECT_TRUE(patron.hasBorrowed("ISBN002"));
}

TEST(PatronTest, RemoveNonExistentBook) {
    Patron patron("P001", "John Doe");
    patron.addBook("ISBN001");
    patron.removeBook("ISBN999");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
}

TEST(PatronTest, HasBorrowed) {
    Patron patron("P001", "John Doe");
    EXPECT_FALSE(patron.hasBorrowed("ISBN001"));
    patron.addBook("ISBN001");
    EXPECT_TRUE(patron.hasBorrowed("ISBN001"));
    EXPECT_FALSE(patron.hasBorrowed("ISBN002"));
}

TEST(PatronTest, SerializeNoBorrowed) {
    Patron patron("P001", "John Doe");
    EXPECT_EQ(patron.serialize(), "P001|John Doe|");
}

TEST(PatronTest, SerializeWithBorrowed) {
    Patron patron("P001", "John Doe");
    patron.addBook("ISBN001");
    patron.addBook("ISBN002");
    EXPECT_EQ(patron.serialize(), "P001|John Doe|ISBN001,ISBN002");
}

TEST(PatronTest, DeserializeNoBorrowed) {
    Patron patron = Patron::deserialize("P001|John Doe|");
    EXPECT_EQ(patron.patronId, "P001");
    EXPECT_EQ(patron.name, "John Doe");
    EXPECT_EQ(patron.getBorrowedCount(), 0);
}

TEST(PatronTest, DeserializeWithBorrowed) {
    Patron patron = Patron::deserialize("P001|John Doe|ISBN001,ISBN002");
    EXPECT_EQ(patron.patronId, "P001");
    EXPECT_EQ(patron.name, "John Doe");
    EXPECT_EQ(patron.getBorrowedCount(), 2);
    EXPECT_TRUE(patron.hasBorrowed("ISBN001"));
    EXPECT_TRUE(patron.hasBorrowed("ISBN002"));
}

TEST(PatronTest, SerializeDeserializeRoundTrip) {
    Patron original("P042", "Jane Smith");
    original.addBook("ISBN-A");
    original.addBook("ISBN-B");
    original.addBook("ISBN-C");

    Patron restored = Patron::deserialize(original.serialize());
    EXPECT_EQ(restored.patronId, original.patronId);
    EXPECT_EQ(restored.name, original.name);
    EXPECT_EQ(restored.getBorrowedCount(), original.getBorrowedCount());
    for (const auto& isbn : original.borrowedBooks) {
        EXPECT_TRUE(restored.hasBorrowed(isbn));
    }
}

TEST(PatronTest, GetBorrowedCount) {
    Patron patron("P001", "Test");
    EXPECT_EQ(patron.getBorrowedCount(), 0);
    patron.addBook("A");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
    patron.addBook("B");
    EXPECT_EQ(patron.getBorrowedCount(), 2);
    patron.removeBook("A");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
}

// ==================== Library Tests ====================

class LibraryTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "./test_data_" + std::to_string(getpid());
        removeDir(testDir);
        mkdir(testDir.c_str(), 0755);
    }

    void TearDown() override {
        removeDir(testDir);
    }
};

// --- addBook Tests ---

TEST_F(LibraryTest, AddBookSuccess) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addBook("ISBN001", "Test Book", "Test Author"));
    EXPECT_EQ(lib.getBooks().size(), 1u);
}

TEST_F(LibraryTest, AddBookDuplicateISBN) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addBook("ISBN001", "Test Book", "Test Author"));
    EXPECT_FALSE(lib.addBook("ISBN001", "Another Book", "Another Author"));
    EXPECT_EQ(lib.getBooks().size(), 1u);
}

TEST_F(LibraryTest, AddBookEmptyISBN) {
    Library lib(testDir);
    EXPECT_FALSE(lib.addBook("", "Title", "Author"));
    EXPECT_EQ(lib.getBooks().size(), 0u);
}

TEST_F(LibraryTest, AddBookEmptyTitle) {
    Library lib(testDir);
    EXPECT_FALSE(lib.addBook("ISBN001", "", "Author"));
    EXPECT_EQ(lib.getBooks().size(), 0u);
}

TEST_F(LibraryTest, AddBookEmptyAuthor) {
    Library lib(testDir);
    EXPECT_FALSE(lib.addBook("ISBN001", "Title", ""));
    EXPECT_EQ(lib.getBooks().size(), 0u);
}

TEST_F(LibraryTest, AddMultipleBooks) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addBook("ISBN001", "Book One", "Author One"));
    EXPECT_TRUE(lib.addBook("ISBN002", "Book Two", "Author Two"));
    EXPECT_TRUE(lib.addBook("ISBN003", "Book Three", "Author Three"));
    EXPECT_EQ(lib.getBooks().size(), 3u);
}

// --- addPatron Tests ---

TEST_F(LibraryTest, AddPatronSuccess) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addPatron("P001", "John Doe"));
    EXPECT_EQ(lib.getPatrons().size(), 1u);
}

TEST_F(LibraryTest, AddPatronDuplicateId) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addPatron("P001", "John Doe"));
    EXPECT_FALSE(lib.addPatron("P001", "Jane Doe"));
    EXPECT_EQ(lib.getPatrons().size(), 1u);
}

TEST_F(LibraryTest, AddPatronEmptyId) {
    Library lib(testDir);
    EXPECT_FALSE(lib.addPatron("", "John Doe"));
    EXPECT_EQ(lib.getPatrons().size(), 0u);
}

TEST_F(LibraryTest, AddPatronEmptyName) {
    Library lib(testDir);
    EXPECT_FALSE(lib.addPatron("P001", ""));
    EXPECT_EQ(lib.getPatrons().size(), 0u);
}

TEST_F(LibraryTest, AddMultiplePatrons) {
    Library lib(testDir);
    EXPECT_TRUE(lib.addPatron("P001", "John Doe"));
    EXPECT_TRUE(lib.addPatron("P002", "Jane Smith"));
    EXPECT_TRUE(lib.addPatron("P003", "Bob Wilson"));
    EXPECT_EQ(lib.getPatrons().size(), 3u);
}

// --- checkoutBook Tests ---

TEST_F(LibraryTest, CheckoutBookSuccess) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-06"));

    const auto& book = lib.getBooks().at("ISBN001");
    EXPECT_FALSE(book.isAvailable);
    EXPECT_EQ(book.borrowedBy, "P001");
    EXPECT_EQ(book.dueDate, "2026-02-20");
}

TEST_F(LibraryTest, CheckoutBookDueDateCalculation) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-20"));
    EXPECT_EQ(lib.getBooks().at("ISBN001").dueDate, "2026-03-06");
}

TEST_F(LibraryTest, CheckoutBookCrossYear) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-12-25"));
    EXPECT_EQ(lib.getBooks().at("ISBN001").dueDate, "2027-01-08");
}

TEST_F(LibraryTest, CheckoutBookNotFound) {
    Library lib(testDir);
    lib.addPatron("P001", "John Doe");
    EXPECT_FALSE(lib.checkoutBook("ISBN999", "P001", "2026-02-06"));
}

TEST_F(LibraryTest, CheckoutBookAlreadyBorrowed) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.addPatron("P002", "Jane Smith");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-06"));
    EXPECT_FALSE(lib.checkoutBook("ISBN001", "P002", "2026-02-06"));
}

TEST_F(LibraryTest, CheckoutBookPatronNotFound) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    EXPECT_FALSE(lib.checkoutBook("ISBN001", "P999", "2026-02-06"));
}

TEST_F(LibraryTest, CheckoutBookUpdatesPatronBorrowedList) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");

    lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    const auto& patron = lib.getPatrons().at("P001");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
    EXPECT_TRUE(patron.hasBorrowed("ISBN001"));
}

TEST_F(LibraryTest, CheckoutMultipleBooksSamePatron) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Book One", "Author One");
    lib.addBook("ISBN002", "Book Two", "Author Two");
    lib.addBook("ISBN003", "Book Three", "Author Three");
    lib.addPatron("P001", "John Doe");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-06"));
    EXPECT_TRUE(lib.checkoutBook("ISBN002", "P001", "2026-02-06"));
    EXPECT_TRUE(lib.checkoutBook("ISBN003", "P001", "2026-02-06"));

    const auto& patron = lib.getPatrons().at("P001");
    EXPECT_EQ(patron.getBorrowedCount(), 3);
}

// --- returnBook Tests ---

TEST_F(LibraryTest, ReturnBookSuccess) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    EXPECT_TRUE(lib.returnBook("ISBN001"));

    const auto& book = lib.getBooks().at("ISBN001");
    EXPECT_TRUE(book.isAvailable);
    EXPECT_TRUE(book.borrowedBy.empty());
    EXPECT_TRUE(book.dueDate.empty());
}

TEST_F(LibraryTest, ReturnBookUpdatesPatronList) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    lib.returnBook("ISBN001");
    const auto& patron = lib.getPatrons().at("P001");
    EXPECT_EQ(patron.getBorrowedCount(), 0);
    EXPECT_FALSE(patron.hasBorrowed("ISBN001"));
}

TEST_F(LibraryTest, ReturnBookNotFound) {
    Library lib(testDir);
    EXPECT_FALSE(lib.returnBook("ISBN999"));
}

TEST_F(LibraryTest, ReturnBookNotCheckedOut) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    EXPECT_FALSE(lib.returnBook("ISBN001"));
}

TEST_F(LibraryTest, ReturnBookThenCheckoutAgain) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.addPatron("P002", "Jane Smith");

    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-06"));
    EXPECT_TRUE(lib.returnBook("ISBN001"));
    EXPECT_TRUE(lib.checkoutBook("ISBN001", "P002", "2026-02-10"));

    const auto& book = lib.getBooks().at("ISBN001");
    EXPECT_FALSE(book.isAvailable);
    EXPECT_EQ(book.borrowedBy, "P002");
    EXPECT_EQ(book.dueDate, "2026-02-24");
}

// --- searchByTitle Tests ---

TEST_F(LibraryTest, SearchByTitleExactMatch) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addBook("ISBN002", "1984", "George Orwell");

    auto results = lib.searchByTitle("The Great Gatsby");
    EXPECT_EQ(results.size(), 1u);
    EXPECT_EQ(results[0].isbn, "ISBN001");
}

TEST_F(LibraryTest, SearchByTitlePartialMatch) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addBook("ISBN002", "Great Expectations", "Charles Dickens");

    auto results = lib.searchByTitle("Great");
    EXPECT_EQ(results.size(), 2u);
}

TEST_F(LibraryTest, SearchByTitleCaseInsensitive) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");

    auto results = lib.searchByTitle("the great gatsby");
    EXPECT_EQ(results.size(), 1u);

    results = lib.searchByTitle("THE GREAT GATSBY");
    EXPECT_EQ(results.size(), 1u);
}

TEST_F(LibraryTest, SearchByTitleNoResults) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");

    auto results = lib.searchByTitle("Nonexistent");
    EXPECT_EQ(results.size(), 0u);
}

TEST_F(LibraryTest, SearchByTitleEmptyQuery) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addBook("ISBN002", "1984", "George Orwell");

    auto results = lib.searchByTitle("");
    EXPECT_EQ(results.size(), 2u);
}

// --- searchByAuthor Tests ---

TEST_F(LibraryTest, SearchByAuthorExactMatch) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addBook("ISBN002", "1984", "George Orwell");

    auto results = lib.searchByAuthor("George Orwell");
    EXPECT_EQ(results.size(), 1u);
    EXPECT_EQ(results[0].isbn, "ISBN002");
}

TEST_F(LibraryTest, SearchByAuthorPartialMatch) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addBook("ISBN002", "Tender Is the Night", "F. Scott Fitzgerald");

    auto results = lib.searchByAuthor("Fitzgerald");
    EXPECT_EQ(results.size(), 2u);
}

TEST_F(LibraryTest, SearchByAuthorCaseInsensitive) {
    Library lib(testDir);
    lib.addBook("ISBN001", "1984", "George Orwell");

    auto results = lib.searchByAuthor("george orwell");
    EXPECT_EQ(results.size(), 1u);

    results = lib.searchByAuthor("GEORGE ORWELL");
    EXPECT_EQ(results.size(), 1u);
}

TEST_F(LibraryTest, SearchByAuthorNoResults) {
    Library lib(testDir);
    lib.addBook("ISBN001", "1984", "George Orwell");

    auto results = lib.searchByAuthor("Nonexistent");
    EXPECT_EQ(results.size(), 0u);
}

// --- getPatronBooks Tests ---

TEST_F(LibraryTest, GetPatronBooksEmpty) {
    Library lib(testDir);
    lib.addPatron("P001", "John Doe");

    auto results = lib.getPatronBooks("P001");
    EXPECT_EQ(results.size(), 0u);
}

TEST_F(LibraryTest, GetPatronBooksWithBooks) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Book One", "Author One");
    lib.addBook("ISBN002", "Book Two", "Author Two");
    lib.addPatron("P001", "John Doe");

    lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    lib.checkoutBook("ISBN002", "P001", "2026-02-06");

    auto results = lib.getPatronBooks("P001");
    EXPECT_EQ(results.size(), 2u);
}

TEST_F(LibraryTest, GetPatronBooksNonExistentPatron) {
    Library lib(testDir);

    auto results = lib.getPatronBooks("P999");
    EXPECT_EQ(results.size(), 0u);
}

TEST_F(LibraryTest, GetPatronBooksAfterReturn) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Book One", "Author One");
    lib.addBook("ISBN002", "Book Two", "Author Two");
    lib.addPatron("P001", "John Doe");

    lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    lib.checkoutBook("ISBN002", "P001", "2026-02-06");
    lib.returnBook("ISBN001");

    auto results = lib.getPatronBooks("P001");
    EXPECT_EQ(results.size(), 1u);
    EXPECT_EQ(results[0].isbn, "ISBN002");
}

// --- getOverdueBooks Tests ---

TEST_F(LibraryTest, GetOverdueBooksNone) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    auto overdue = lib.getOverdueBooks("2026-02-10");
    EXPECT_EQ(overdue.size(), 0u);
}

TEST_F(LibraryTest, GetOverdueBooksOnDueDate) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    auto overdue = lib.getOverdueBooks("2026-02-20");
    EXPECT_EQ(overdue.size(), 0u);
}

TEST_F(LibraryTest, GetOverdueBooksAfterDueDate) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    auto overdue = lib.getOverdueBooks("2026-02-21");
    EXPECT_EQ(overdue.size(), 1u);
    EXPECT_EQ(overdue[0].isbn, "ISBN001");
}

TEST_F(LibraryTest, GetOverdueBooksMultiple) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Book One", "Author One");
    lib.addBook("ISBN002", "Book Two", "Author Two");
    lib.addBook("ISBN003", "Book Three", "Author Three");
    lib.addPatron("P001", "John Doe");

    lib.checkoutBook("ISBN001", "P001", "2026-01-01");
    lib.checkoutBook("ISBN002", "P001", "2026-01-10");
    lib.checkoutBook("ISBN003", "P001", "2026-02-06");

    auto overdue = lib.getOverdueBooks("2026-02-06");
    EXPECT_EQ(overdue.size(), 2u);
}

TEST_F(LibraryTest, GetOverdueBooksEmptyLibrary) {
    Library lib(testDir);
    auto overdue = lib.getOverdueBooks("2026-02-06");
    EXPECT_EQ(overdue.size(), 0u);
}

// --- displayBookInfo Tests ---

TEST_F(LibraryTest, DisplayBookInfoAvailable) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");

    std::string info = lib.displayBookInfo("ISBN001");
    EXPECT_NE(info.find("ISBN: ISBN001"), std::string::npos);
    EXPECT_NE(info.find("Title: The Great Gatsby"), std::string::npos);
    EXPECT_NE(info.find("Author: F. Scott Fitzgerald"), std::string::npos);
    EXPECT_NE(info.find("Available"), std::string::npos);
}

TEST_F(LibraryTest, DisplayBookInfoCheckedOut) {
    Library lib(testDir);
    lib.addBook("ISBN001", "The Great Gatsby", "F. Scott Fitzgerald");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    std::string info = lib.displayBookInfo("ISBN001");
    EXPECT_NE(info.find("Checked Out"), std::string::npos);
    EXPECT_NE(info.find("Borrowed By: P001"), std::string::npos);
    EXPECT_NE(info.find("Due Date: 2026-02-20"), std::string::npos);
}

TEST_F(LibraryTest, DisplayBookInfoNotFound) {
    Library lib(testDir);
    std::string info = lib.displayBookInfo("ISBN999");
    EXPECT_NE(info.find("not found"), std::string::npos);
}

// --- File Persistence Tests ---

TEST_F(LibraryTest, SaveAndLoadBooks) {
    {
        Library lib(testDir);
        lib.addBook("ISBN001", "Book One", "Author One");
        lib.addBook("ISBN002", "Book Two", "Author Two");
        lib.saveData();
    }

    Library lib2(testDir);
    EXPECT_EQ(lib2.getBooks().size(), 2u);
    EXPECT_EQ(lib2.getBooks().at("ISBN001").title, "Book One");
    EXPECT_EQ(lib2.getBooks().at("ISBN002").title, "Book Two");
}

TEST_F(LibraryTest, SaveAndLoadPatrons) {
    {
        Library lib(testDir);
        lib.addPatron("P001", "John Doe");
        lib.addPatron("P002", "Jane Smith");
        lib.saveData();
    }

    Library lib2(testDir);
    EXPECT_EQ(lib2.getPatrons().size(), 2u);
    EXPECT_EQ(lib2.getPatrons().at("P001").name, "John Doe");
    EXPECT_EQ(lib2.getPatrons().at("P002").name, "Jane Smith");
}

TEST_F(LibraryTest, SaveAndLoadWithCheckouts) {
    {
        Library lib(testDir);
        lib.addBook("ISBN001", "Book One", "Author One");
        lib.addBook("ISBN002", "Book Two", "Author Two");
        lib.addPatron("P001", "John Doe");
        lib.checkoutBook("ISBN001", "P001", "2026-02-06");
        lib.saveData();
    }

    Library lib2(testDir);
    const auto& book = lib2.getBooks().at("ISBN001");
    EXPECT_FALSE(book.isAvailable);
    EXPECT_EQ(book.borrowedBy, "P001");
    EXPECT_EQ(book.dueDate, "2026-02-20");

    const auto& patron = lib2.getPatrons().at("P001");
    EXPECT_EQ(patron.getBorrowedCount(), 1);
    EXPECT_TRUE(patron.hasBorrowed("ISBN001"));
}

TEST_F(LibraryTest, LoadFromEmptyDirectory) {
    Library lib(testDir);
    EXPECT_EQ(lib.getBooks().size(), 0u);
    EXPECT_EQ(lib.getPatrons().size(), 0u);
}

TEST_F(LibraryTest, LoadFromNonExistentDirectory) {
    std::string newDir = testDir + "_nonexistent";
    removeDir(newDir);
    Library lib(newDir);
    EXPECT_EQ(lib.getBooks().size(), 0u);
    EXPECT_EQ(lib.getPatrons().size(), 0u);
    removeDir(newDir);
}

TEST_F(LibraryTest, PersistenceAfterAddBook) {
    {
        Library lib(testDir);
        lib.addBook("ISBN001", "Book One", "Author One");
    }

    Library lib2(testDir);
    EXPECT_EQ(lib2.getBooks().size(), 1u);
    EXPECT_EQ(lib2.getBooks().at("ISBN001").title, "Book One");
}

TEST_F(LibraryTest, PersistenceAfterCheckout) {
    {
        Library lib(testDir);
        lib.addBook("ISBN001", "Book One", "Author One");
        lib.addPatron("P001", "John Doe");
        lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    }

    Library lib2(testDir);
    EXPECT_FALSE(lib2.getBooks().at("ISBN001").isAvailable);
    EXPECT_EQ(lib2.getBooks().at("ISBN001").borrowedBy, "P001");
}

TEST_F(LibraryTest, PersistenceAfterReturn) {
    {
        Library lib(testDir);
        lib.addBook("ISBN001", "Book One", "Author One");
        lib.addPatron("P001", "John Doe");
        lib.checkoutBook("ISBN001", "P001", "2026-02-06");
        lib.returnBook("ISBN001");
    }

    Library lib2(testDir);
    EXPECT_TRUE(lib2.getBooks().at("ISBN001").isAvailable);
    EXPECT_EQ(lib2.getPatrons().at("P001").getBorrowedCount(), 0);
}

// --- Edge Cases ---

TEST_F(LibraryTest, CheckoutReturnCheckoutCycle) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");

    for (int i = 0; i < 5; ++i) {
        EXPECT_TRUE(lib.checkoutBook("ISBN001", "P001", "2026-02-06"));
        EXPECT_FALSE(lib.getBooks().at("ISBN001").isAvailable);
        EXPECT_TRUE(lib.returnBook("ISBN001"));
        EXPECT_TRUE(lib.getBooks().at("ISBN001").isAvailable);
    }
}

TEST_F(LibraryTest, LargeDataset) {
    Library lib(testDir);

    for (int i = 0; i < 500; ++i) {
        std::string isbn = "ISBN-" + std::to_string(i);
        std::string title = "Book Title " + std::to_string(i);
        std::string author = "Author " + std::to_string(i % 50);
        EXPECT_TRUE(lib.addBook(isbn, title, author));
    }

    for (int i = 0; i < 100; ++i) {
        std::string id = "P" + std::to_string(i);
        std::string name = "Patron " + std::to_string(i);
        EXPECT_TRUE(lib.addPatron(id, name));
    }

    EXPECT_EQ(lib.getBooks().size(), 500u);
    EXPECT_EQ(lib.getPatrons().size(), 100u);

    for (int i = 0; i < 100; ++i) {
        std::string isbn = "ISBN-" + std::to_string(i);
        std::string patronId = "P" + std::to_string(i);
        EXPECT_TRUE(lib.checkoutBook(isbn, patronId, "2026-02-06"));
    }

    auto overdue = lib.getOverdueBooks("2026-03-01");
    EXPECT_EQ(overdue.size(), 100u);
}

TEST_F(LibraryTest, LargeDatasetPersistence) {
    {
        Library lib(testDir);
        for (int i = 0; i < 100; ++i) {
            lib.addBook("ISBN-" + std::to_string(i), "Book " + std::to_string(i), "Author " + std::to_string(i));
        }
        for (int i = 0; i < 20; ++i) {
            lib.addPatron("P" + std::to_string(i), "Patron " + std::to_string(i));
        }
        lib.saveData();
    }

    Library lib2(testDir);
    EXPECT_EQ(lib2.getBooks().size(), 100u);
    EXPECT_EQ(lib2.getPatrons().size(), 20u);
}

TEST_F(LibraryTest, SearchByTitleMultipleResults) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Introduction to Algorithms", "Cormen");
    lib.addBook("ISBN002", "Introduction to Machine Learning", "Alpaydin");
    lib.addBook("ISBN003", "Data Structures and Algorithms", "Aho");

    auto results = lib.searchByTitle("Introduction");
    EXPECT_EQ(results.size(), 2u);

    results = lib.searchByTitle("Algorithms");
    EXPECT_EQ(results.size(), 2u);
}

TEST_F(LibraryTest, SearchByAuthorMultipleBooksPerAuthor) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Harry Potter 1", "J.K. Rowling");
    lib.addBook("ISBN002", "Harry Potter 2", "J.K. Rowling");
    lib.addBook("ISBN003", "The Casual Vacancy", "J.K. Rowling");

    auto results = lib.searchByAuthor("Rowling");
    EXPECT_EQ(results.size(), 3u);
}

TEST_F(LibraryTest, OverdueBooksNotReturnedAfterDue) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Book", "Author");
    lib.addPatron("P001", "Patron");
    lib.checkoutBook("ISBN001", "P001", "2026-01-01");

    auto overdue = lib.getOverdueBooks("2026-02-01");
    EXPECT_EQ(overdue.size(), 1u);

    lib.returnBook("ISBN001");
    overdue = lib.getOverdueBooks("2026-02-01");
    EXPECT_EQ(overdue.size(), 0u);
}

TEST_F(LibraryTest, DisplayBookInfoAfterReturn) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    lib.returnBook("ISBN001");

    std::string info = lib.displayBookInfo("ISBN001");
    EXPECT_NE(info.find("Available"), std::string::npos);
}

TEST_F(LibraryTest, AutoSaveOnAddBook) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");

    Library lib2(testDir);
    EXPECT_EQ(lib2.getBooks().size(), 1u);
}

TEST_F(LibraryTest, AutoSaveOnAddPatron) {
    Library lib(testDir);
    lib.addPatron("P001", "John Doe");

    Library lib2(testDir);
    EXPECT_EQ(lib2.getPatrons().size(), 1u);
}

TEST_F(LibraryTest, AutoSaveOnCheckout) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");

    Library lib2(testDir);
    EXPECT_FALSE(lib2.getBooks().at("ISBN001").isAvailable);
}

TEST_F(LibraryTest, AutoSaveOnReturn) {
    Library lib(testDir);
    lib.addBook("ISBN001", "Test Book", "Test Author");
    lib.addPatron("P001", "John Doe");
    lib.checkoutBook("ISBN001", "P001", "2026-02-06");
    lib.returnBook("ISBN001");

    Library lib2(testDir);
    EXPECT_TRUE(lib2.getBooks().at("ISBN001").isAvailable);
}
