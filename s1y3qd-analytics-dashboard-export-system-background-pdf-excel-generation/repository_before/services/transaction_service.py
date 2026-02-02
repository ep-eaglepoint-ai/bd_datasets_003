from sqlalchemy.orm import Session, Query
from sqlalchemy import func
from models.transaction import Transaction
from datetime import datetime
from typing import Optional, List, Tuple


class TransactionService:
    """
    Service for querying and managing transaction data.
    Used by the analytics dashboard for data retrieval and aggregation.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_transactions_query(
        self,
        user_id: int,
        category: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Query:
        """
        Build a query for transactions with optional filters.
        Returns a Query object that can be further modified (offset, limit, etc.)
        """
        query = self.db.query(Transaction).filter(Transaction.user_id == user_id)

        if category:
            query = query.filter(Transaction.category == category)
        if start_date:
            query = query.filter(Transaction.transaction_date >= start_date)
        if end_date:
            query = query.filter(Transaction.transaction_date <= end_date)

        query = query.order_by(Transaction.transaction_date.desc())
        return query

    def get_transactions(
        self,
        user_id: int,
        category: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 50
    ) -> Tuple[List[Transaction], int]:
        """
        Get paginated transactions with total count.
        """
        query = self.get_transactions_query(user_id, category, start_date, end_date)
        total = query.count()
        
        offset = (page - 1) * page_size
        transactions = query.offset(offset).limit(page_size).all()
        
        return transactions, total

    def get_total_count(
        self,
        user_id: int,
        category: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """
        Get total count of transactions matching the filters.
        """
        query = self.get_transactions_query(user_id, category, start_date, end_date)
        return query.count()

    def get_category_summary(
        self,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Tuple[str, float, int]]:
        """
        Get transaction summary grouped by category.
        Returns list of tuples: (category, total_amount, transaction_count)
        """
        query = self.db.query(
            Transaction.category,
            func.sum(Transaction.amount).label('total'),
            func.count(Transaction.id).label('count')
        ).filter(Transaction.user_id == user_id)

        if start_date:
            query = query.filter(Transaction.transaction_date >= start_date)
        if end_date:
            query = query.filter(Transaction.transaction_date <= end_date)

        query = query.group_by(Transaction.category)
        query = query.order_by(func.sum(Transaction.amount).desc())

        return query.all()

    def create_transaction(
        self,
        user_id: int,
        category: str,
        amount: float,
        transaction_date: datetime,
        description: Optional[str] = None
    ) -> Transaction:
        """
        Create a new transaction.
        """
        transaction = Transaction(
            user_id=user_id,
            category=category,
            description=description,
            amount=amount,
            transaction_date=transaction_date
        )
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)
        return transaction

    def get_transaction_by_id(self, transaction_id: int, user_id: int) -> Optional[Transaction]:
        """
        Get a single transaction by ID, ensuring it belongs to the user.
        """
        return self.db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id
        ).first()

    def delete_transaction(self, transaction_id: int, user_id: int) -> bool:
        """
        Delete a transaction by ID.
        """
        transaction = self.get_transaction_by_id(transaction_id, user_id)
        if transaction:
            self.db.delete(transaction)
            self.db.commit()
            return True
        return False

    def get_monthly_totals(
        self,
        user_id: int,
        year: int
    ) -> List[Tuple[int, float]]:
        """
        Get monthly spending totals for a given year.
        Returns list of tuples: (month, total_amount)
        """
        query = self.db.query(
            func.extract('month', Transaction.transaction_date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).filter(
            Transaction.user_id == user_id,
            func.extract('year', Transaction.transaction_date) == year
        ).group_by(
            func.extract('month', Transaction.transaction_date)
        ).order_by('month')

        return query.all()
