#include <iostream>
#include <string>
#include <vector>
#include <cassert>
#include <random>
#include <algorithm>
#include <set>
#include "../repository_after/avl_tree.h"

// Simple test runner helper
#define TEST(name) \
    std::cout << "Running " << #name << "... "; \
    name(); \
    std::cout << "PASSED" << std::endl;

void test_basic_insert() {
    AVLTree<int, std::string> tree;
    tree.insert(10, "ten");
    tree.insert(20, "twenty");
    tree.insert(5, "five");
    
    assert(tree.size() == 3);
    assert(tree.find(10) != tree.end());
    assert(tree.find(20) != tree.end());
    assert(tree.find(5) != tree.end());
    assert(tree.find(15) == tree.end());
    
    tree.validate();
}

void test_update_value() {
    AVLTree<int, std::string> tree;
    tree.insert(10, "ten");
    tree.insert(10, "TEN");
    
    assert(tree.size() == 1);
    assert(tree.find(10)->second == "TEN");
    
    tree.validate();
}

void test_delete_cases() {
    AVLTree<int, int> tree;
    
    // 1. Delete Leaf
    tree.insert(10, 10);
    tree.insert(5, 5);
    tree.insert(15, 15); // Tree: 10 -> (5, 15)
    tree.remove(5);
    assert(tree.size() == 2);
    assert(tree.find(5) == tree.end());
    tree.validate();
    
    // 2. Delete One Child
    tree.insert(2, 2); // 10 -> (null, 15), but 5 gone. wait.
    // Rebuild for clarity
    tree.clear();
    tree.insert(10, 10);
    tree.insert(5, 5);
    tree.insert(15, 15);
    tree.insert(1, 1); // 5 has left child 1
    tree.remove(5); // Should replace 5 with 1
    assert(tree.find(5) == tree.end());
    assert(tree.find(1) != tree.end());
    tree.validate();
    
    // 3. Delete Two Children
    tree.clear();
    tree.insert(10, 10);
    tree.insert(5, 5);
    tree.insert(15, 15);
    tree.insert(12, 12);
    tree.insert(20, 20); // 15 has 12 and 20
    tree.remove(15);
    assert(tree.find(15) == tree.end());
    assert(tree.find(12) != tree.end());
    assert(tree.find(20) != tree.end());
    tree.validate();
}

void test_const_key() {
    // This is a strict requirement test
    AVLTree<const int, int> tree;
    tree.insert(10, 100);
    tree.insert(5, 50);
    tree.insert(15, 150);
    tree.insert(12, 120);
    tree.insert(20, 200);
    
    // Delete node with two children (15)
    tree.remove(15); 
    
    assert(tree.find(15) == tree.end());
    assert(tree.find(12)->second == 120);
    assert(tree.find(20)->second == 200);
    tree.validate();
}

void test_iterator() {
    AVLTree<int, int> tree;
    std::vector<int> keys = {50, 30, 70, 20, 40, 60, 80};
    for (int k : keys) tree.insert(k, k);
    
    std::vector<int> sorted;
    for (auto it = tree.begin(); it != tree.end(); ++it) {
        sorted.push_back(it->first);
    }
    
    std::vector<int> expected = {20, 30, 40, 50, 60, 70, 80};
    assert(sorted == expected);
    
    // Test decrement
    auto it = tree.end();
    it--;
    assert(it->first == 80);
    it--;
    assert(it->first == 70);
}

void test_range_query() {
    AVLTree<int, int> tree;
    for (int i = 0; i <= 100; i += 10) tree.insert(i, i);
    
    // Range [25, 75] should be 30, 40, 50, 60, 70
    auto result = tree.range_query(25, 75);
    assert(result.size() == 5);
    assert(result[0].first == 30);
    assert(result[4].first == 70);
}

void test_large_random() {
    AVLTree<int, int> tree;
    const int N = 10000;
    std::mt19937 rng(42);
    std::vector<int> keys;
    
    for (int i = 0; i < N; ++i) {
        keys.push_back(i);
    }
    std::shuffle(keys.begin(), keys.end(), rng);
    
    for (int k : keys) {
        tree.insert(k, k);
    }
    
    assert(tree.size() == N);
    tree.validate();
    
    std::shuffle(keys.begin(), keys.end(), rng);
    for (int i = 0; i < N / 2; ++i) {
        tree.remove(keys[i]);
    }
    
    assert(tree.size() == N - (N / 2));
    tree.validate();
}

void test_copy_move() {
    AVLTree<int, int> t1;
    t1.insert(1, 1);
    t1.insert(2, 2);
    
    // Copy
    AVLTree<int, int> t2 = t1;
    assert(t2.size() == 2);
    t2.insert(3, 3);
    assert(t1.size() == 2); // Unaffected
    assert(t2.size() == 3);
    
    // Move
    AVLTree<int, int> t3 = std::move(t2);
    assert(t3.size() == 3);
    assert(t2.size() == 0); // Moved from
}

int main() {
    TEST(test_basic_insert);
    TEST(test_update_value);
    TEST(test_delete_cases);
    TEST(test_const_key);
    TEST(test_iterator);
    TEST(test_range_query);
    TEST(test_copy_move);
    TEST(test_large_random);
    
    std::cout << "All tests passed!" << std::endl;
    return 0;
}
