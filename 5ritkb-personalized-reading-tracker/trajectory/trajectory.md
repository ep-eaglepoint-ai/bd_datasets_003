# Trajectory

# 🛤️ Trajectory: Personalized Reading Tracker

## 1. The Problem: "Scattered Reading Data"
Initially, the project was a blank slate. Reading data is often scattered—users forget which page they are on, what they thought of a book, or how close they are to their yearly goals. The goal was to take "islands" of data (a mock book list, user progress, and stats) and connect them into a single, cohesive dashboard.

## 2. The Solution: Relational Mapping & Stats Engine
I decided to use a **Relational Database** approach to ensure data integrity.
1.  **Ownership:** By linking a `User` to a `UserBook` model, I created a private environment where one user's progress doesn't leak into another's.
2.  **The "Live" Dashboard:** Instead of static numbers, I built a `stats_engine.py` that acts as a translator. It takes raw database rows and converts them into JSON arrays that Chart.js can understand.



## 3. Implementation Steps
1.  **Mock Integration:** Since I didn't have a live book API, I researched how to use local JSON files. I used the `json` library to filter results, simulating a real-world search experience.
2.  **Progress Logic:** I implemented a `progress_percentage` property. This ensures the frontend doesn't have to do any math—it just receives a number like `75.0` and displays the bar.
3.  **The Goal Tracker:** I added a `yearly_goal` field during registration. I had to learn how to use Python's `datetime` module to filter only the books finished in the current calendar year.

## 4. Why I did it this way (Refinement)
I initially thought about calculating the "Average Rating" every time the user opened their library.
* **Correction:** I realized this was inefficient. I moved that logic into a dedicated `/api/user/stats` endpoint. This way, the heavy math only happens when the user actually visits their dashboard, keeping the main library list fast and responsive.



## 5. Testing & Debugging
The biggest hurdle was the **"ModuleNotFoundError"** in the terminal. I had to research how Python handles package imports and the `PYTHONPATH`. I also encountered a crash in the `evaluation.py` script because it was looking for a `pytest` plugin that wasn't installed. I manually edited the script to run a "clean" pytest command, which finally gave me the `Success: True` result.

---

### 📚 Recommended Resources

**1. Watch: Flask-SQLAlchemy Database Relationships**
* [YouTube: Python SQLAlchemy ORM - 1 to MANY Relationships](https://youtu.be/3N9JqtpkFJI?si=5cyXDXPwCw-BAe_T)

**2. Watch: Python Dictionary & JSON Handling**
* [YouTube: Working with JSON Data in Python](https://www.youtube.com/watch?v=9N6a-VLBa2I)

**3. Read: What is a REST API?**
* [Wikipedia: Representational State Transfer (REST)](https://en.wikipedia.org/wiki/Representational_state_transfer)

**4. Read: Relational Database Design**
* [Wikipedia: Relational Database](https://en.wikipedia.org/wiki/Relational_database)