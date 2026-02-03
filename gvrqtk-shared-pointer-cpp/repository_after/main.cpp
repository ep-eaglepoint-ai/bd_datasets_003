#ifndef SHARED_PTR_H
#define SHARED_PTR_H

#include <atomic>
#include <utility>

template <typename T>
class SharedPtr {
private:
    struct ControlBlockBase {
        std::atomic<long> ref_count;
        
        ControlBlockBase() : ref_count(1) {}
        
        virtual ~ControlBlockBase() = default;
        
        virtual void destroy() = 0;
    };
    
    template <typename Deleter>
    struct ControlBlockImpl : public ControlBlockBase {
        T* ptr;
        Deleter deleter;
        
        ControlBlockImpl(T* p, Deleter d) : ptr(p), deleter(std::move(d)) {}
        
        void destroy() override {
            if (ptr) {
                deleter(ptr);
                ptr = nullptr;
            }
        }
    };
    
    struct ControlBlockDefault : public ControlBlockBase {
        T* ptr;
        
        explicit ControlBlockDefault(T* p) : ptr(p) {}
        
        void destroy() override {
            if (ptr) {
                delete ptr;
                ptr = nullptr;
            }
        }
    };
    
    T* ptr_;
    ControlBlockBase* control_;

    void release() {
        if (control_) {
            long old_count = control_->ref_count.fetch_sub(1, std::memory_order_acq_rel);
            
            if (old_count == 1) {
                control_->destroy();
                delete control_;
            }
        }
    }

public:
    SharedPtr() : ptr_(nullptr), control_(nullptr) {}
    
    explicit SharedPtr(T* ptr) : ptr_(ptr), control_(nullptr) {
        if (ptr_) {
            control_ = new ControlBlockDefault(ptr_);
        }
    }
    
    template <typename Deleter>
    SharedPtr(T* ptr, Deleter deleter) : ptr_(ptr), control_(nullptr) {
        if (ptr_) {
            control_ = new ControlBlockImpl<Deleter>(ptr_, std::move(deleter));
        }
    }
    
    SharedPtr(const SharedPtr& other) : ptr_(other.ptr_), control_(other.control_) {
        if (control_) {
            control_->ref_count.fetch_add(1, std::memory_order_relaxed);
        }
    }
    
    SharedPtr(SharedPtr&& other) noexcept 
        : ptr_(other.ptr_), control_(other.control_) {
        other.ptr_ = nullptr;
        other.control_ = nullptr;
    }
    
    SharedPtr& operator=(const SharedPtr& other) {
        if (this != &other) {
            release();
            ptr_ = other.ptr_;
            control_ = other.control_;
            if (control_) {
                control_->ref_count.fetch_add(1, std::memory_order_relaxed);
            }
        }
        return *this;
    }
    
    SharedPtr& operator=(SharedPtr&& other) noexcept {
        if (this != &other) {
            release();
            ptr_ = other.ptr_;
            control_ = other.control_;
            other.ptr_ = nullptr;
            other.control_ = nullptr;
        }
        return *this;
    }
    
    ~SharedPtr() {
        release();
    }
    
    T* get() const {
        return ptr_;
    }
    
    T& operator*() const {
        return *ptr_;
    }
    
    T* operator->() const {
        return ptr_;
    }
    
    long use_count() const {
        if (control_) {
            return control_->ref_count.load(std::memory_order_relaxed);
        }
        return 0;
    }
    
    void reset() {
        release();
        ptr_ = nullptr;
        control_ = nullptr;
    }
    
    void reset(T* ptr) {
        release();
        ptr_ = ptr;
        if (ptr_) {
            control_ = new ControlBlockDefault(ptr_);
        } else {
            control_ = nullptr;
        }
    }
    
    template <typename Deleter>
    void reset(T* ptr, Deleter deleter) {
        release();
        ptr_ = ptr;
        if (ptr_) {
            control_ = new ControlBlockImpl<Deleter>(ptr_, std::move(deleter));
        } else {
            control_ = nullptr;
        }
    }
    
    explicit operator bool() const {
        return ptr_ != nullptr;
    }
};

#endif // SHARED_PTR_H