from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class TransactionCreate(BaseModel):
    category: str
    description: Optional[str] = None
    amount: float
    transaction_date: datetime


class TransactionResponse(BaseModel):
    id: int
    user_id: int
    category: str
    description: Optional[str]
    amount: float
    transaction_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionFilter(BaseModel):
    category: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class TransactionListResponse(BaseModel):
    transactions: List[TransactionResponse]
    total: int
    page: int
    page_size: int


class CategorySummary(BaseModel):
    category: str
    total_amount: float
    transaction_count: int


# Export schemas - to be used by export feature
class ExportRequest(BaseModel):
    format: str  # "pdf" or "excel"
    category: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ExportJobResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    download_url: Optional[str] = None
    error: Optional[str] = None
