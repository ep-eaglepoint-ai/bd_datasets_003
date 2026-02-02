from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from database import get_db
from schemas.transaction import (
    TransactionCreate,
    TransactionResponse,
    TransactionListResponse,
    CategorySummary
)
from services.transaction_service import TransactionService
from routes.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=TransactionListResponse)
def get_transactions(
    category: Optional[str] = Query(None, description="Filter by category"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get paginated list of transactions with optional filters.
    """
    service = TransactionService(db)
    transactions, total = service.get_transactions(
        user_id=current_user.id,
        category=category,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size
    )
    
    return TransactionListResponse(
        transactions=transactions,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new transaction.
    """
    service = TransactionService(db)
    transaction = service.create_transaction(
        user_id=current_user.id,
        category=transaction_data.category,
        description=transaction_data.description,
        amount=transaction_data.amount,
        transaction_date=transaction_data.transaction_date
    )
    return transaction


@router.get("/summary", response_model=List[CategorySummary])
def get_category_summary(
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get transaction summary grouped by category.
    """
    service = TransactionService(db)
    summary = service.get_category_summary(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date
    )
    
    return [
        CategorySummary(
            category=cat,
            total_amount=total,
            transaction_count=count
        )
        for cat, total, count in summary
    ]


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a single transaction by ID.
    """
    service = TransactionService(db)
    transaction = service.get_transaction_by_id(transaction_id, current_user.id)
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a transaction.
    """
    service = TransactionService(db)
    deleted = service.delete_transaction(transaction_id, current_user.id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )


@router.get("/stats/monthly")
def get_monthly_stats(
    year: int = Query(..., description="Year to get monthly stats for"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get monthly spending totals for a given year.
    """
    service = TransactionService(db)
    monthly_data = service.get_monthly_totals(current_user.id, year)
    
    return [
        {"month": int(month), "total": total}
        for month, total in monthly_data
    ]
