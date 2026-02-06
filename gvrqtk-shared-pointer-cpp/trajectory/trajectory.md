## 1. Designed the Control Block Architecture
I created a separate control block to manage reference counting independently from the managed object. The control block stores an atomic reference count and handles object destruction, allowing multiple SharedPtr instances to safely share ownership of the same resource.
Learn about smart pointer internals: [https://shaharmike.com/cpp/shared-ptr/](https://shaharmike.com/cpp/shared-ptr/)

## 2. Implemented Type Erasure for Custom Deleters
I used an abstract base class (ControlBlockBase) with a virtual destroy() method to achieve type erasure. This allows SharedPtr<T> to support any deleter type without exposing it in the template signature, enabling flexible cleanup strategies while maintaining a clean interface.
Practical type erasure techniques: [https://www.modernescpp.com/index.php/c-core-guidelines-type-erasure-with-templates](https://www.modernescpp.com/index.php/c-core-guidelines-type-erasure-with-templates)

## 3. Ensured Thread-Safe Reference Counting with Atomics
I used std::atomic<long> for the reference count with proper memory ordering. Increments use memory_order_relaxed (no synchronization needed), while decrements use memory_order_acq_rel to ensure the last owner sees all modifications before destroying the object.
Learn about C++ memory ordering: [https://youtu.be/A8eCGOqgvH4](https://youtu.be/A8eCGOqgvH4)
Understanding std::memory_order: [https://en.cppreference.com/w/cpp/atomic/memory_order](https://en.cppreference.com/w/cpp/atomic/memory_order)

## 4. Implemented the Rule of Five for Resource Management
I implemented all five special member functions: copy constructor (shallow copy with ref count increment), move constructor (ownership transfer with no ref count change), copy assignment (release old resource, acquire new one), move assignment (release and transfer), and destructor (decrement and conditionally destroy).


## 5. Created the Centralized Release Pattern
I implemented a release() method that atomically decrements the reference count and destroys the object only when the count reaches zero. This ensures exactly-once destruction semantics—the last owner is responsible for cleanup, preventing both double-free errors and memory leaks.
Learn about RAII cleanup patterns: [https://isocpp.org/wiki/faq/dtors](https://isocpp.org/wiki/faq/dtors)

## 6. Added Self-Assignment Protection
I added self-assignment checks in both copy and move assignment operators. Without this check, assigning a SharedPtr to itself would prematurely release the resource before trying to acquire it again, causing use-after-free errors.

## 7. Optimized Move Operations to Avoid Atomic Operations
Move constructor and move assignment transfer ownership by copying pointers and nullifying the source, without touching the reference count. This makes moves essentially free compared to copies, providing significant performance benefits in scenarios like returning SharedPtr from functions.


## 8. Implemented Standard Smart Pointer Interface
I added get(), operator*(), operator->(), use_count(), and operator bool() to match the standard smart pointer interface. These const-qualified accessors provide safe, convenient access to the managed object without modifying the SharedPtr state.
Learn about smart pointer best practices: [https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rr-smartptrparam](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rr-smartptrparam)

## 9. Handled Nullptr Edge Cases
I ensured that constructing with nullptr doesn't allocate a control block, use_count() returns 0 for empty SharedPtr, and all operations safely handle null state. This keeps empty SharedPtr lightweight and prevents unnecessary allocations.

## 10. Result: Thread-Safe, Zero-Overhead Abstraction
The implementation provides automatic memory management with RAII, thread-safe reference counting using atomics, zero-overhead move semantics, and support for custom deleters through type erasure. It prevents double-free errors, memory leaks, and use-after-free bugs that plague manual memory management.
