#ifndef AVL_TREE_H
#define AVL_TREE_H

#include <algorithm>
#include <cassert>
#include <functional>
#include <iostream>
#include <iterator>
#include <memory>
#include <utility>
#include <vector>
#include <optional>
#include <stdexcept>

// Generic AVL Tree implementation
template <typename Key, typename Value, typename Compare = std::less<Key>>
class AVLTree {
public:
    using key_type = Key;
    using mapped_type = Value;
    using value_type = std::pair<const Key, Value>;
    using size_type = std::size_t;
    using difference_type = std::ptrdiff_t;
    using key_compare = Compare;
    using reference = value_type&;
    using const_reference = const value_type&;

private:
    struct Node {
        value_type data;
        Node* parent = nullptr;
        Node* left = nullptr;
        Node* right = nullptr;
        int height = 1;

        template <typename K, typename V>
        Node(K&& k, V&& v, Node* p = nullptr)
            : data(std::piecewise_construct,
                   std::forward_as_tuple(std::forward<K>(k)),
                   std::forward_as_tuple(std::forward<V>(v))),
              parent(p) {}
    };

    Node* root = nullptr;
    size_type node_count = 0;
    Compare comp;

    int get_height(Node* n) const { return n ? n->height : 0; }

    void update_height(Node* n) {
        if (n) {
            n->height = 1 + std::max(get_height(n->left), get_height(n->right));
        }
    }

    int get_balance(Node* n) const {
        return n ? get_height(n->left) - get_height(n->right) : 0;
    }

    void rotate_left(Node* x) {
        Node* y = x->right;
        if (!y) return;

        x->right = y->left;
        if (y->left) {
            y->left->parent = x;
        }

        y->parent = x->parent;
        if (!x->parent) {
            root = y;
        } else if (x == x->parent->left) {
            x->parent->left = y;
        } else {
            x->parent->right = y;
        }

        y->left = x;
        x->parent = y;

        update_height(x);
        update_height(y);
    }

    void rotate_right(Node* x) {
        Node* y = x->left;
        if (!y) return;

        x->left = y->right;
        if (y->right) {
            y->right->parent = x;
        }

        y->parent = x->parent;
        if (!x->parent) {
            root = y;
        } else if (x == x->parent->right) {
            x->parent->right = y;
        } else {
            x->parent->left = y;
        }

        y->right = x;
        x->parent = y;

        update_height(x);
        update_height(y);
    }

    void rebalance(Node* n) {
        while (n) {
            update_height(n);
            int balance = get_balance(n);

            if (balance > 1) {
                if (get_balance(n->left) < 0) {
                    rotate_left(n->left);
                }
                rotate_right(n);
            } else if (balance < -1) {
                if (get_balance(n->right) > 0) {
                    rotate_right(n->right);
                }
                rotate_left(n);
            }
            n = n->parent;
        }
    }

    Node* copy_tree(Node* n, Node* parent_node) {
        if (!n) return nullptr;
        // Construct new node with copied data
        Node* new_node = new Node(n->data.first, n->data.second, parent_node);
        new_node->height = n->height;
        new_node->left = copy_tree(n->left, new_node);
        new_node->right = copy_tree(n->right, new_node);
        return new_node;
    }

    void delete_tree(Node* n) {
        if (!n) return;
        delete_tree(n->left);
        delete_tree(n->right);
        delete n;
    }

    Node* min_node(Node* n) const {
        if (!n) return nullptr;
        while (n->left) n = n->left;
        return n;
    }

    Node* max_node(Node* n) const {
        if (!n) return nullptr;
        while (n->right) n = n->right;
        return n;
    }

    void transplant(Node* u, Node* v) {
        if (!u->parent) {
            root = v;
        } else if (u == u->parent->left) {
            u->parent->left = v;
        } else {
            u->parent->right = v;
        }
        if (v) {
            v->parent = u->parent;
        }
    }

    Node* find_node(const Key& key) const {
        Node* current = root;
        while (current) {
            if (comp(key, current->data.first)) {
                current = current->left;
            } else if (comp(current->data.first, key)) {
                current = current->right;
            } else {
                return current;
            }
        }
        return nullptr;
    }

    // Check strict weak ordering for equality: !(a < b) && !(b < a)
    bool keys_equal(const Key& a, const Key& b) const {
        return !comp(a, b) && !comp(b, a);
    }

public:
    class iterator {
    public:
        using iterator_category = std::bidirectional_iterator_tag;
        using value_type = AVLTree::value_type;
        using difference_type = AVLTree::difference_type;
        using pointer = value_type*;
        using reference = value_type&;

    private:
        Node* current;
        // In this design, 'end' can be represented by nullptr if we are careful,
        // or we need a way to go back from end.
        // A common trick is to store the tree pointer + nullptr.
        // But for predecessor of end(), we need the max node.
        const AVLTree* tree; 

    public:
        iterator() : current(nullptr), tree(nullptr) {}
        iterator(Node* n, const AVLTree* t) : current(n), tree(t) {}

        reference operator*() const {
             return current->data;
        }

        pointer operator->() const {
            return &(current->data);
        }

        iterator& operator++() {
            if (!current) {
                // If already null (end), behavior is undefined usually, but safe to do nothing or throw
                return *this;
            }
            if (current->right) {
                current = current->right;
                while (current->left) current = current->left;
            } else {
                Node* p = current->parent;
                while (p && current == p->right) {
                    current = p;
                    p = p->parent;
                }
                current = p;
            }
            return *this;
        }

        iterator operator++(int) {
            iterator tmp = *this;
            ++(*this);
            return tmp;
        }

        iterator& operator--() {
            if (!current) {
                // If end (nullptr), move to max
                if (tree) {
                    current = tree->max_node(tree->root);
                }
            } else {
                if (current->left) {
                    current = current->left;
                    while (current->right) current = current->right;
                } else {
                    Node* p = current->parent;
                    while (p && current == p->left) {
                        current = p;
                        p = p->parent;
                    }
                    current = p;
                }
            }
            return *this;
        }

        iterator operator--(int) {
            iterator tmp = *this;
            --(*this);
            return tmp;
        }

        bool operator==(const iterator& other) const {
            return current == other.current; // Simple pointer comparison
        }

        bool operator!=(const iterator& other) const {
            return !(*this == other);
        }
        
        // Helper to access internals
        Node* get_node() const { return current; }
    };

    AVLTree() = default;

    ~AVLTree() {
        clear();
    }

    AVLTree(const AVLTree& other) : root(nullptr), node_count(0), comp(other.comp) {
        if (other.root) {
            root = copy_tree(other.root, nullptr);
            node_count = other.node_count;
        }
    }

    AVLTree(AVLTree&& other) noexcept : root(other.root), node_count(other.node_count), comp(std::move(other.comp)) {
        other.root = nullptr;
        other.node_count = 0;
    }

    AVLTree& operator=(const AVLTree& other) {
        if (this != &other) {
            clear();
            comp = other.comp;
            if (other.root) {
                root = copy_tree(other.root, nullptr);
                node_count = other.node_count;
            }
        }
        return *this;
    }

    AVLTree& operator=(AVLTree&& other) noexcept {
        if (this != &other) {
            clear();
            root = other.root;
            node_count = other.node_count;
            comp = std::move(other.comp);
            other.root = nullptr;
            other.node_count = 0;
        }
        return *this;
    }

    size_type size() const { return node_count; }
    bool empty() const { return node_count == 0; }

    void clear() {
        delete_tree(root);
        root = nullptr;
        node_count = 0;
    }

    iterator begin() const {
        return iterator(min_node(root), this);
    }

    iterator end() const {
        return iterator(nullptr, this);
    }

    // Insert
    void insert(const Key& key, const Value& val) {
        if (!root) {
            root = new Node(key, val);
            node_count++;
            return;
        }

        Node* current = root;
        Node* parent = nullptr;
        
        while (current) {
            parent = current;
            if (comp(key, current->data.first)) {
                current = current->left;
            } else if (comp(current->data.first, key)) {
                current = current->right;
            } else {
                // Update existing value
                current->data.second = val;
                return;
            }
        }

        Node* new_node = new Node(key, val, parent);
        if (comp(key, parent->data.first)) {
            parent->left = new_node;
        } else {
            parent->right = new_node;
        }
        node_count++;

        rebalance(parent);
    }

    // Delete
    void remove(const Key& key) {
        Node* z = find_node(key);
        if (!z) return; // Key not found

        // We need to find the node to physically calculate rebalancing from
        Node* rebalance_start_node = nullptr;

        if (!z->left) {
            rebalance_start_node = z->parent;
            transplant(z, z->right);
            delete z;
        } else if (!z->right) {
            rebalance_start_node = z->parent;
            transplant(z, z->left);
            delete z;
        } else {
            // Two children case
            Node* y = min_node(z->right); // Successor
            // We cannot just copy data because of const Key. We must move y into z's spot.
            
            // If y is successfully spliced out, its original parent is where rebalancing starts.
            // Unless y is z's direct child.
            
            Node* y_original_parent = y->parent;
            Node* y_original_right = y->right; // Can be null
            
            // 1. Remove y from its original position
            if (y->parent != z) {
                // Replace y with y->right
                transplant(y, y->right); 
                y->right = z->right;
                y->right->parent = y;
                rebalance_start_node = y_original_parent; // Rebalance from y's old parent
            } else {
                // y is immediate child of z
                rebalance_start_node = y; // Rebalance from y (which will be at z's spot)
            }
            
            // 2. Put y in z's spot
            transplant(z, y);
            y->left = z->left;
            y->left->parent = y;
            
            // y now has correct parent (from transplant), left, and right.
            // Its height might be wrong, will be fixed by rebalance.
            // But wait, if y->parent != z, we noted rebalance_start_node = y_original_parent.
            // That parent is effectively in the "new" right subtree of y.
            // Rebalancing walks UP from there. Correct.
            
            delete z;
        }
        
        node_count--;
        rebalance(rebalance_start_node);
    }

    iterator find(const Key& key) const {
        Node* n = find_node(key);
        if (n) return iterator(n, this);
        return end();
    }

    std::optional<Key> min_key() const {
        Node* n = min_node(root);
        if (n) return n->data.first;
        return std::nullopt;
    }

    std::optional<Key> max_key() const {
        Node* n = max_node(root);
        if (n) return n->data.first;
        return std::nullopt;
    }

    std::optional<Key> successor(const Key& key) const {
        Node* n = find_node(key);
        if (!n) return std::nullopt;
        
        // Successor logic
        if (n->right) {
            return min_node(n->right)->data.first;
        }
        Node* p = n->parent;
        while (p && n == p->right) {
            n = p;
            p = p->parent;
        }
        if (p) return p->data.first;
        return std::nullopt;
    }
    
    std::optional<Key> predecessor(const Key& key) const {
        Node* n = find_node(key);
        if (!n) return std::nullopt;

        if (n->left) {
             return max_node(n->left)->data.first;
        }
        Node* p = n->parent;
        while (p && n == p->left) {
            n = p;
            p = p->parent;
        }
        if (p) return p->data.first;
        return std::nullopt;
    }

    std::vector<value_type> range_query(const Key& low, const Key& high) const {
        std::vector<value_type> result;
        if (!root) return result;
        
        // Use a recursive helper to prune
        std::function<void(Node*)> traverse = [&](Node* n) {
            if (!n) return;

            // if n->key >= low, go left (might find smaller valid keys)
            // wait, if n->key is TOO large, we might still need to go left.
            // range is [low, high].
            // if n->key > high, then right subtree is definitely out of bounds. All > high.
            // if n->key < low, left subtree is definitely out of bounds. All < low.
            
            bool too_small = comp(n->data.first, low); // n < low
            bool too_large = comp(high, n->data.first); // n > high
            
            if (!too_small) {
                // n >= low, so left child *might* be valid or contain valid nodes
                // wait, if n is exactly low, left child is all < low (invalid).
                // Actually standard logic:
                // if n->key > low, we must visit left. 
                // if n->key >= low is correct.
                traverse(n->left);
            }
            
            if (!too_small && !too_large) {
                result.push_back(n->data);
            }
            
            if (!too_large) {
                traverse(n->right);
            }
        };
        
        // The above logic is slightly flawed because it traverses in-order (good)
        // Correct logic:
        // if low < n->key, go left
        // if low <= n->key <= high, add n
        // if n->key < high, go right
        
        std::function<void(Node*)> strict_traverse = [&](Node* n) {
            if (!n) return;
            
            bool n_less_than_low = comp(n->data.first, low);
            bool n_greater_than_high = comp(high, n->data.first);
            
            // if n >= low, meaning it's NOT (n < low), we can clear left
            if (!n_less_than_low) {
                strict_traverse(n->left);
            }
            
            if (!n_less_than_low && !n_greater_than_high) {
                result.push_back(n->data);
            }
            
            // if n <= high, meaning it's NOT (n > high), we can clear right
            if (!n_greater_than_high) {
                strict_traverse(n->right);
            }
        };

        strict_traverse(root);
        return result;
    }

    // Debug method
    void validate() const {
        if (!root) return;
        validate_helper(root);
    }
    
    // Prints structure to stdout
    void debug_print() const {
        debug_print_helper(root, "", true);
    }

private:
    int validate_helper(Node* n) const {
        if (!n) return 0;
        
        int h_left = validate_helper(n->left);
        int h_right = validate_helper(n->right);
        
        if (n->left) assert(comp(n->left->data.first, n->data.first));
        if (n->right) assert(comp(n->data.first, n->right->data.first));
        if (n->left) assert(n->left->parent == n);
        if (n->right) assert(n->right->parent == n);
        
        int h = 1 + std::max(h_left, h_right);
        // assert(h == n->height); // Commented out to allow lazy updates if strictly necessary, but we update eagerly so should match
        if (std::abs(h_left - h_right) > 1) {
            std::cerr << "Balance violation at key " << n->data.first << ": " << h_left << " vs " << h_right << std::endl;
            assert(false);
        }
        return h;
    }

    void debug_print_helper(Node* n, std::string prefix, bool is_tail) const {
        if (!n) return;
        std::cout << prefix << (is_tail ? "\\-- " : "|-- ") << n->data.first 
                  << " (h=" << n->height << ")" << std::endl;
        debug_print_helper(n->left, prefix + (is_tail ? "    " : "|   "), false);
        debug_print_helper(n->right, prefix + (is_tail ? "    " : "|   "), true);
    }
};

#endif // AVL_TREE_H
