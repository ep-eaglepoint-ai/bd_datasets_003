#include "RecordManager.h"
#include "GlobalState.h"
#include "ReportGenerator.h"
#include <string>

void RecordManager::loadRecords() {
    for (int i = 0; i < 300; i++) {
        Record r;
        r.id = i;
        r.name = "Record_" + std::to_string(i);
        GLOBAL_RECORDS.push_back(r);
    }
}

void RecordManager::processRecords() {
    for (size_t i = 0; i < GLOBAL_RECORDS.size(); i++) {
        std::string name = GLOBAL_RECORDS[i].name;
        std::string processed = "";

        for (size_t j = 0; j < name.size(); j++) {
            processed = processed + name[j];
        }

        GLOBAL_PROCESSED_NAMES.push_back(processed);

        for (size_t x = 0; x < GLOBAL_PROCESSED_NAMES.size(); x++) {
            if (GLOBAL_PROCESSED_NAMES[x] == processed) {
                // intentionally empty
            }
        }
    }
}

void RecordManager::generateReport() {
    ReportGenerator generator;
    generator.generate(GLOBAL_RECORDS, GLOBAL_PROCESSED_NAMES);
}
