# Trajectory: Building a Bulletproof Payment System

## The Problem: "It Works on My Machine" isn't Enough
Imagine you're building a payment system. If you mess up, people lose money. You can't just run the app and click "Pay" manually every time you change a line of code. That's slow, error-prone, and impossible to scale.

We need a way to **prove** our code works automatically, in seconds, without actually charging real credit cards.

## The Solution: Unit Testing with Mocking
We use **JUnit 5** (the testing framework) and **Mockito** (the faking framework).
1.  **Isolation:** We test *one* thing at a time. When testing the `PaymentService`, we don't want to test the `CardValidator` or the external `Stripe` gateway. We assume they work.
2.  **Mocking:** We create "fake" versions of dependencies. Instead of calling the real Stripe API (which takes time and money), we tell Mockito: "When the code asks to charge $100, just say 'Success' immediately."
3.  **Verification:** We don't just check if the code runs. We check if it called the right methods with the exact right data.

## Implementation Steps
1.  **Validating the Basics:** We started with `CardValidator`. Pure logic. No mocks needed. Just "Does '123' pass the Luhn check?"
2.  **Mocking the Gateway:** For `PaymentService`, we mocked the `PaymentGateway`.
    *   *Challenge:* How do we know we sent the right ID to Stripe?
    *   *Solution:* **ArgumentCaptor**. It's like a spy that steals the data passed to the mock so we can inspect it later.
3.  **Controlling Time:** Tests need to be predictable. If a card expires "tomorrow," that test will fail in 24 hours.
    *   *Solution:* We injected a **Clock**. We forced the code to think it's always Oct 1, 2023. Now the test works forever.
4.  **Meta-Testing:** We wrote tests *for our tests* using JavaParser. This ensures we didn't cheat by skipping assertions or forgetting to mock things.

## Why I did it this way (Refinement)
I could have used a real database or a real test-stripe account.
*   **Correction:** I chose **pure unit tests**. Real connections are "Integration Tests." They are flaky (what if internet is down?) and slow. Unit tests give us instant feedback.

## Testing
We ran `mvn test`. It scans our project, finds all files ending in `Test.java`, and runs them.
*   **Green:** Everything is good.
*   **Red:** We broke something. Fix it immediately.

---

### 📚 Recommended Resources

**1. Watch: Mockito Crash Course**
Understand why we "mock" and how to do it in Java.
*   [YouTube: Mockito Tutorial for Beginners](https://www.youtube.com/watch?v=kXhAlDd6Sgk)

**2. Read: What is Dependency Injection?**
This is the pattern that makes testing possible. You pass the "Clock" *into* the class instead of creating it *inside*.
*   [Article: Dependency Injection in Java](https://www.baeldung.com/java-dependency-injection)

**3. Watch: TDD (Test Driven Development)**
The philosophy of writing the test *before* the code (though here we did it after, the principles apply).
*   [YouTube: TDD Explained with Java](https://www.youtube.com/watch?v=GusF0zZcd5E)

**4. Deep Dive: The Luhn Algorithm**
How credit card validation actually works mathematically.
*   [Video: The Luhn Algorithm - Computerphile](https://www.youtube.com/watch?v=PnFX5MyTnEbE)
