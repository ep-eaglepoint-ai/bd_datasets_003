#include "../repository_after/main.cpp"
#include <iostream>
#include <thread>
#include <vector>
#include <cassert>
#include <string>

// Test class to track construction/destruction
class TestObject {
public:
    static int instance_count;
    int value;
    
    TestObject(int v = 0) : value(v) {
        instance_count++;
    }
    
    ~TestObject() {
        instance_count--;
    }
    
    void print() const {
        std::cout << "Value: " << value << std::endl;
    }
};

int TestObject::instance_count = 0;

// Custom deleter for testing
struct CustomDeleter {
    int* delete_count;
    
    CustomDeleter(int* count) : delete_count(count) {}
    
    void operator()(TestObject* ptr) {
        (*delete_count)++;
        delete ptr;
    }
};

// Basic construction and destruction
void test_basic_construction() {
    std::cout << "Basic Construction... ";
    
    SharedPtr<TestObject> sp1;
    assert(sp1.get() == nullptr);
    assert(sp1.use_count() == 0);
    
    SharedPtr<TestObject> sp2(new TestObject(42));
    assert(sp2.get() != nullptr);
    assert(sp2.use_count() == 1);
    assert(sp2->value == 42);
    assert((*sp2).value == 42);
    
    std::cout << "PASSED" << std::endl;
}

// Copy semantics and reference counting
void test_copy_semantics() {
    std::cout << "Copy Semantics... ";
    
    SharedPtr<TestObject> sp1(new TestObject(100));
    assert(sp1.use_count() == 1);
    
    SharedPtr<TestObject> sp2(sp1);
    assert(sp1.use_count() == 2);
    assert(sp2.use_count() == 2);
    assert(sp1.get() == sp2.get());
    
    SharedPtr<TestObject> sp3;
    sp3 = sp1;
    assert(sp1.use_count() == 3);
    assert(sp2.use_count() == 3);
    assert(sp3.use_count() == 3);
    
    sp3 = sp3;
    assert(sp3.use_count() == 3);
    
    std::cout << "PASSED" << std::endl;
}

// Move semantics
void test_move_semantics() {
    std::cout << "Move Semantics... ";
    
    SharedPtr<TestObject> sp1(new TestObject(200));
    assert(sp1.use_count() == 1);
    
    SharedPtr<TestObject> sp2(std::move(sp1));
    assert(sp1.get() == nullptr);
    assert(sp1.use_count() == 0);
    assert(sp2.use_count() == 1);
    assert(sp2->value == 200);
    
    SharedPtr<TestObject> sp3;
    sp3 = std::move(sp2);
    assert(sp2.get() == nullptr);
    assert(sp2.use_count() == 0);
    assert(sp3.use_count() == 1);
    assert(sp3->value == 200);
    
    std::cout << "PASSED" << std::endl;
}

// Resource cleanup when ref count reaches zero
void test_resource_cleanup() {
    std::cout << "Resource Cleanup... ";
    
    int initial_count = TestObject::instance_count;
    
    {
        SharedPtr<TestObject> sp1(new TestObject(300));
        SharedPtr<TestObject> sp2 = sp1;
        SharedPtr<TestObject> sp3 = sp2;
        
        assert(TestObject::instance_count == initial_count + 1);
        assert(sp1.use_count() == 3);
    }
    
    assert(TestObject::instance_count == initial_count);
    
    std::cout << "PASSED" << std::endl;
}

// Custom deleter
void test_custom_deleter() {
    std::cout << "Custom Deleter... ";
    
    int delete_count = 0;
    
    {
        SharedPtr<TestObject> sp1(new TestObject(400), CustomDeleter(&delete_count));
        assert(sp1.use_count() == 1);
        assert(delete_count == 0);
        
        SharedPtr<TestObject> sp2 = sp1;
        assert(sp1.use_count() == 2);
        assert(delete_count == 0);
    }
    
    assert(delete_count == 1);
    
    std::cout << "PASSED" << std::endl;
}

// Lambda as custom deleter
void test_lambda_deleter() {
    std::cout << "Lambda Deleter... ";
    
    bool lambda_called = false;
    
    {
        SharedPtr<TestObject> sp(new TestObject(500), [&lambda_called](TestObject* ptr) {
            lambda_called = true;
            delete ptr;
        });
        
        assert(sp.use_count() == 1);
        assert(!lambda_called);
    }
    
    assert(lambda_called);
    
    std::cout << "PASSED" << std::endl;
}

// Thread safety
void test_thread_safety() {
    std::cout << "Thread Safety... ";
    
    SharedPtr<TestObject> sp(new TestObject(600));
    
    const int num_threads = 10;
    const int copies_per_thread = 1000;
    
    std::vector<std::thread> threads;
    
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([sp]() mutable {
            for (int j = 0; j < copies_per_thread; ++j) {
                SharedPtr<TestObject> local = sp;
            }
        });
    }
    
    for (auto& t : threads) {
        t.join();
    }
    
    assert(sp.use_count() == 1);
    
    std::cout << "PASSED" << std::endl;
}

// Reset functionality
void test_reset() {
    std::cout << "Reset Functionality... ";
    
    SharedPtr<TestObject> sp(new TestObject(700));
    assert(sp.use_count() == 1);
    
    sp.reset();
    assert(sp.get() == nullptr);
    assert(sp.use_count() == 0);
    
    sp.reset(new TestObject(800));
    assert(sp.get() != nullptr);
    assert(sp.use_count() == 1);
    assert(sp->value == 800);
    
    int delete_count = 0;
    sp.reset(new TestObject(900), CustomDeleter(&delete_count));
    assert(sp->value == 900);
    assert(delete_count == 0);
    
    sp.reset();
    assert(delete_count == 1);
    
    std::cout << "PASSED" << std::endl;
}

// Mixed copy and move operations
void test_mixed_operations() {
    std::cout << "Mixed Operations... ";
    
    SharedPtr<TestObject> sp1(new TestObject(1000));
    SharedPtr<TestObject> sp2 = sp1;
    assert(sp1.use_count() == 2);
    
    SharedPtr<TestObject> sp3 = std::move(sp1);
    assert(sp1.use_count() == 0);
    assert(sp2.use_count() == 2);
    assert(sp3.use_count() == 2);
    
    sp1 = sp2;
    assert(sp1.use_count() == 3);
    
    sp2 = std::move(sp3);
    assert(sp3.use_count() == 0);
    assert(sp1.use_count() == 2);
    assert(sp2.use_count() == 2);
    
    std::cout << "PASSED" << std::endl;
}

// Nullptr handling
void test_nullptr_handling() {
    std::cout << "Nullptr Handling... ";
    
    SharedPtr<TestObject> sp1(nullptr);
    assert(sp1.get() == nullptr);
    assert(sp1.use_count() == 0);
    
    SharedPtr<TestObject> sp2 = sp1;
    assert(sp2.get() == nullptr);
    assert(sp2.use_count() == 0);
    
    SharedPtr<TestObject> sp3(new TestObject(1100));
    sp3 = sp1;
    assert(sp3.get() == nullptr);
    assert(sp3.use_count() == 0);
    
    std::cout << "PASSED" << std::endl;
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "   SharedPtr Test Suite" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << std::endl;
    
    test_basic_construction();
    test_copy_semantics();
    test_move_semantics();
    test_resource_cleanup();
    test_custom_deleter();
    test_lambda_deleter();
    test_thread_safety();
    test_reset();
    test_mixed_operations();
    test_nullptr_handling();
    
    std::cout << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "   ALL TESTS PASSED ✓" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Final instance count: " << TestObject::instance_count << std::endl;
    
    if (TestObject::instance_count == 0) {
        std::cout << "✓ No memory leaks detected!" << std::endl;
        return 0;
    } else {
        std::cout << "✗ WARNING: Possible memory leak!" << std::endl;
        return 1;
    }
}