# Trajectory


## The Problem: Implement a **server and client application** that considers **distributed system constraints**

currently the server and client are not implemented.
on implementing server and client applications needs to consider the following
- Server is **resource-constrained**, so it must prevent overselling resources.  
- Client sends requests but must **respect server responses**, e.g., if the server is overloaded, the client should retry after a delay.

## The Solution: "address the problem suing mutexes, rate limiting, and exponential backoff"
1. **Mutex:** Ensures that concurrent requests do not cause inconsistent resource state (e.g., negative resource values).  
2. **RateLImiter:** Server responds with `429 Too Many Requests` if the request rate exceeds a certain limit.  
3. **Retryable Request:** Client retries requests if the server responds with `429` or server errors (`5xx`).  
   - Maximum **5 retries** to avoid infinite request loops.  
3. **Exponential backoff:** when the server sends request again it delay the time by multiplying it with exponential of the attempt number. this will give more time for the server to respond
Delays retries using an exponential formula:  
     `delay = baseDelay * 2^(attempt-1)`  
   - This gives the server more time to recover before the next request.  


### 📚 Recommended Resources

*1. **Mutex in Go** – ensures strict serializability:  
   [https://go.dev/tour/concurrency/9](https://go.dev/tour/concurrency/9)  

2. **RateLimiter Concepts** – implement request throttling to prevent server overload.**