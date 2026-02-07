#!/bin/bash

# Evaluation script for C++ Record Processor
# Remove set -e to continue even if some tests fail
# set -e  # COMMENTED OUT - don't exit on error

echo "=========================================="
echo "C++ Record Processor Evaluation"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create reports directory
mkdir -p evaluation/reports

# Function to run and check a test - returns weight on success, 0 on failure
run_test() {
    local test_name=$1
    local command=$2
    local weight=$3
    
    echo -e "\n${YELLOW}Running: ${test_name} (${weight} points)${NC}"
    echo "Command: $command"
    
    if eval $command > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        return $weight
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        cat /tmp/test_output.log
        return 0
    fi
}

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    local weight=$3
    
    echo -e "\n${YELLOW}Checking: ${description}${NC}"
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ Found ${file}${NC}"
        return $weight
    else
        echo -e "${RED}✗ Missing ${file}${NC}"
        return 0
    fi
}

# Initialize score
SCORE=0
MAX_SCORE=100

echo -e "\n${YELLOW}Phase 1: Build System Check${NC}"
echo "------------------------------------------"

# Check required files
check_file "repository_after/main.cpp" "Main program source" 5
SCORE=$((SCORE + $?))

check_file "repository_after/record_processor.h" "Header file" 5
SCORE=$((SCORE + $?))

check_file "repository_after/record_processor.cpp" "Implementation file" 5
SCORE=$((SCORE + $?))

check_file "tests/Makefile" "Makefile" 5
SCORE=$((SCORE + $?))

check_file "tests/test_record_processor.cpp" "Test file" 5
SCORE=$((SCORE + $?))

echo -e "\n${YELLOW}Phase 2: Build Tests${NC}"
echo "------------------------------------------"

# Clean and build
cd tests
REPO_DIR="${REPO_DIR:-../repository_after}"

if ! command -v make >/dev/null 2>&1; then
    echo -e "${YELLOW}make not found; using g++ fallback${NC}"
    # Fallback: compile main program directly
    echo -e "\n${YELLOW}Compiling main program...${NC}"
    if g++ -std=c++17 -Wall -Wextra -Wpedantic -I"${REPO_DIR}" \
        -o record_processor "${REPO_DIR}/main.cpp" "${REPO_DIR}/record_processor.cpp" \
        > /tmp/compile.log 2>&1; then
        echo -e "${GREEN}✓ Compilation successful${NC}"
        SCORE=$((SCORE + 10))
    else
        echo -e "${RED}✗ Compilation failed${NC}"
        cat /tmp/compile.log
    fi
else
    make clean > /dev/null 2>&1 || true
    # Test compilation
    echo -e "\n${YELLOW}Compiling main program...${NC}"
    if make REPO_DIR="$REPO_DIR" > /tmp/compile.log 2>&1; then
        echo -e "${GREEN}✓ Compilation successful${NC}"
        SCORE=$((SCORE + 10))
    else
        echo -e "${RED}✗ Compilation failed${NC}"
        cat /tmp/compile.log
    fi
fi

# Verify executable was created
if [ -f "record_processor" ]; then
    echo -e "${GREEN}✓ Main executable created${NC}"
    SCORE=$((SCORE + 5))
else
    echo -e "${RED}✗ Main executable not created${NC}"
fi

echo -e "\n${YELLOW}Phase 3: Program Execution${NC}"
echo "------------------------------------------"

# Run main program
echo -e "\n${YELLOW}Running main program...${NC}"
if [ -f "record_processor" ]; then
    ./record_processor > /tmp/program_output.txt 2>&1
    RET_CODE=$?
    
    if [ $RET_CODE -eq 0 ]; then
        echo -e "${GREEN}✓ Program executed successfully${NC}"
        SCORE=$((SCORE + 10))
        
        echo -e "\n${YELLOW}Program output:${NC}"
        cat /tmp/program_output.txt
        
        # Validate output format
        echo -e "\n${YELLOW}Validating output format...${NC}"
        
        # Check each line has correct format
        FORMAT_CORRECT=true
        LINE_COUNT=0
        
        while IFS= read -r line; do
            if [ -n "$line" ]; then
                LINE_COUNT=$((LINE_COUNT + 1))
                # Check line format: CATEGORY | COUNT=# | TOTAL=#
                if [[ ! "$line" =~ ^[^|]+\ \|\ COUNT=[0-9]+\ \|\ TOTAL=[0-9]+$ ]]; then
                    echo -e "${RED}✗ Invalid format on line: $line${NC}"
                    echo "Expected: CATEGORY | COUNT=# | TOTAL=#"
                    FORMAT_CORRECT=false
                fi
            fi
        done < /tmp/program_output.txt
        
        if [ "$FORMAT_CORRECT" = true ] && [ $LINE_COUNT -gt 0 ]; then
            echo -e "${GREEN}✓ All lines have correct format${NC}"
            SCORE=$((SCORE + 10))
        else
            echo -e "${RED}✗ Output format incorrect${NC}"
        fi
        
        # Check lexicographical order
        echo -e "\n${YELLOW}Checking lexicographical order...${NC}"
        CATEGORIES=$(grep -o '^[^|]*' /tmp/program_output.txt | sed 's/ *$//')
        SORTED_CATEGORIES=$(echo "$CATEGORIES" | sort)
        
        if [ "$CATEGORIES" = "$SORTED_CATEGORIES" ]; then
            echo -e "${GREEN}✓ Categories in lexicographical order${NC}"
            SCORE=$((SCORE + 10))
        else
            echo -e "${RED}✗ Categories not sorted correctly${NC}"
            echo "Got: $CATEGORIES"
            echo "Expected sorted: $SORTED_CATEGORIES"
        fi
        
        # Check we have output
        if [ $LINE_COUNT -ge 1 ]; then
            echo -e "${GREEN}✓ Output contains $LINE_COUNT lines${NC}"
            SCORE=$((SCORE + 10))
        fi
    else
        echo -e "${RED}✗ Program execution failed with code $RET_CODE${NC}"
        cat /tmp/program_output.txt
    fi
else
    echo -e "${RED}✗ Cannot run program - executable not found${NC}"
fi

cd ..

echo -e "\n${YELLOW}Phase 4: Error Handling${NC}"
echo "------------------------------------------"

# Test negative value handling
echo -e "\n${YELLOW}Testing negative value handling...${NC}"
cd repository_after

# Create test program
cat > /tmp/test_negative.cpp << 'EOF'
#include <iostream>
#include "record_processor.h"

int main() {
    RecordProcessor p;
    try {
        p.processRecord({1, "Test", -5});
        std::cout << "ERROR: Should have thrown!" << std::endl;
        return 1;
    } catch (const InvalidDataException& e) {
        std::cout << "SUCCESS: Caught exception: " << e.what() << std::endl;
        return 0;
    }
}
EOF

# Compile and run
g++ -std=c++17 -I. -o /tmp/test_negative /tmp/test_negative.cpp record_processor.cpp 2>/dev/null
if [ $? -eq 0 ]; then
    /tmp/test_negative > /tmp/negative_output.txt 2>&1
    if grep -q "SUCCESS" /tmp/negative_output.txt; then
        echo -e "${GREEN}✓ Negative value handling works${NC}"
        SCORE=$((SCORE + 10))
        cat /tmp/negative_output.txt
    else
        echo -e "${RED}✗ Negative value handling failed${NC}"
        cat /tmp/negative_output.txt
    fi
else
    echo -e "${RED}✗ Could not compile negative test${NC}"
fi

# Test empty category handling
echo -e "\n${YELLOW}Testing empty category handling...${NC}"
cat > /tmp/test_empty.cpp << 'EOF'
#include <iostream>
#include "record_processor.h"

int main() {
    RecordProcessor p;
    try {
        p.processRecord({1, "", 100});
        std::cout << "ERROR: Should have thrown!" << std::endl;
        return 1;
    } catch (const InvalidDataException& e) {
        std::cout << "SUCCESS: Caught exception: " << e.what() << std::endl;
        return 0;
    }
}
EOF

g++ -std=c++17 -I. -o /tmp/test_empty /tmp/test_empty.cpp record_processor.cpp 2>/dev/null
if [ $? -eq 0 ]; then
    /tmp/test_empty > /tmp/empty_output.txt 2>&1
    if grep -q "SUCCESS" /tmp/empty_output.txt; then
        echo -e "${GREEN}✓ Empty category handling works${NC}"
        SCORE=$((SCORE + 10))
    else
        echo -e "${RED}✗ Empty category handling failed${NC}"
    fi
fi

cd ..

echo -e "\n${YELLOW}==========================================${NC}"
echo -e "${YELLOW}FINAL SCORE: ${SCORE}/${MAX_SCORE}${NC}"
echo -e "${YELLOW}==========================================${NC}"

# Generate JSON report
REPORT_FILE="evaluation/reports/report.json"
cat > "$REPORT_FILE" << EOF
{
  "build": {
    "success": $(if [ $SCORE -ge 30 ]; then echo "true"; else echo "false"; fi),
    "message": "Build system and compilation"
  },
  "execution": {
    "success": $(if [ $SCORE -ge 50 ]; then echo "true"; else echo "false"; fi),
    "message": "Program execution and output validation"
  },
  "validation": {
    "success": $(if [ $SCORE -ge 70 ]; then echo "true"; else echo "false"; fi),
    "message": "Error handling and input validation"
  },
  "code_quality": {
    "success": $(if [ $SCORE -ge 80 ]; then echo "true"; else echo "false"; fi),
    "issues": []
  },
  "overall_score": $SCORE,
  "max_score": $MAX_SCORE
}
EOF

echo -e "\n${GREEN}Evaluation report saved to: $REPORT_FILE${NC}"
echo "Report contents:"
cat "$REPORT_FILE"
echo ""

echo -e "\n${YELLOW}Summary:${NC}"
if [ $SCORE -ge 90 ]; then
    echo -e "${GREEN}Excellent! All requirements met.${NC}"
    exit 0
elif [ $SCORE -ge 70 ]; then
    echo -e "${GREEN}Good! Most requirements met.${NC}"
    exit 0
elif [ $SCORE -ge 50 ]; then
    echo -e "${YELLOW}Fair. Basic functionality working.${NC}"
    exit 0
else
    echo -e "${RED}Needs improvement.${NC}"
    exit 1
fi
