#include <iostream>
#include "RecordManager.h"

int main() {
    std::cout << "Starting application..." << std::endl;

    RecordManager manager;
    manager.loadRecords();
    manager.processRecords();
    manager.generateReport();

    std::cout << "Application finished." << std::endl;
    return 0;
}
