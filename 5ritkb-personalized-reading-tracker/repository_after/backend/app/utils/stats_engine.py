from datetime import datetime, timedelta, date
from ..models import ReadingLog

def calculate_reading_stats(user):
    books = user.books 
    finished_books = [b for b in books if b.status == 'finished']
    
    monthly_data = [0] * 12
    current_year = datetime.utcnow().year
    for b in finished_books:
        if b.finish_date and b.finish_date.year == current_year:
            month_idx = b.finish_date.month - 1
            monthly_data[month_idx] += 1

    ratings = [b.rating for b in finished_books if b.rating is not None]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0

    activity_dates = sorted(
        {log.date for b in books for log in b.activity_log}, 
        reverse=True
    )

    streak = 0
    if activity_dates:
        today = datetime.utcnow().date()
        yesterday = today - timedelta(days=1)
        
        if activity_dates[0] >= yesterday:
            streak = 1
            for i in range(len(activity_dates) - 1):
                if activity_dates[i] - activity_dates[i+1] == timedelta(days=1):
                    streak += 1
                else:
                    break

    durations = []
    for b in finished_books:
        if b.start_date and b.finish_date:
            days = (b.finish_date - b.start_date).days
            durations.append(max(days, 1))
    
    avg_reading_time = sum(durations) / len(durations) if durations else 0

    return {
        "streak": streak,
        "books_read": len(finished_books),
        "total_pages": sum(b.current_page for b in books if b.current_page),
        "average_rating": round(avg_rating, 1),
        "avg_reading_time": round(avg_reading_time, 1),
        "completed_this_year": sum(monthly_data),
        "monthly_data": monthly_data,
        "yearly_goal": user.yearly_goal or 12
    }