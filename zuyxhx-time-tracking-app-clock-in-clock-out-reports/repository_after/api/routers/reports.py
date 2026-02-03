"""Reports routes."""

from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from ..database import get_db
from ..schemas import ReportSummaryResponse
from ..services import ReportsService
from ..utils.dependencies import get_current_user
from ..models import User

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/summary", response_model=ReportSummaryResponse)
def get_report_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get report summary with daily and weekly totals."""
    service = ReportsService(db)
    return service.get_summary(current_user.id, start_date, end_date)


@router.get("/csv")
def download_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download time entries as CSV."""
    service = ReportsService(db)
    csv_content = service.generate_csv(current_user.id, start_date, end_date)
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=time_report.csv"}
    )
