from datetime import datetime, timedelta

def calculate_reading_stats(user):
    books = user.books 
    finished_books = [b for b in books if b.status == 'finished']
    
    # onthly Data for Chart.js
    monthly_data = [0] * 12
    current_year = datetime.utcnow().year
    for b in finished_books:
        if b.finish_date and b.finish_date.year == current_year:
            month_idx = b.finish_date.month - 1
            monthly_data[month_idx] += 1

    # verage Rating
    ratings = [b.rating for b in finished_books if b.rating is not None]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0

    # Simple Streak Logic
    last_updates = [b.last_updated for b in books if b.last_updated]
    streak = 0
    if last_updates:
        latest = max(last_updates)
        if latest > datetime.utcnow() - timedelta(days=2):
            streak = 1 

    return {
        "streak": streak,
        "books_read": len(finished_books),
        "total_pages": sum(b.current_page for b in books if b.current_page),
        "average_rating": round(avg_rating, 1),
        "completed_this_year": sum(monthly_data),
        "monthly_data": monthly_data,
        "yearly_goal": user.yearly_goal or 12
    }