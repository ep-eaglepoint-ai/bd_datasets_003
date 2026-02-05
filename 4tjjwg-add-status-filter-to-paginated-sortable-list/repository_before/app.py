"""
Flask app: paginated, sortable list of records. No status filter (pre-feature state).
"""
from flask import Flask, render_template, request

app = Flask(__name__)

# In-memory records: id, status, created_at (sortable).
# Status values: active, completed, cancelled.
RECORDS = [
    {"id": "1", "status": "active", "created_at": "2024-01-15T10:00:00Z"},
    {"id": "2", "status": "completed", "created_at": "2024-01-14T09:00:00Z"},
    {"id": "3", "status": "active", "created_at": "2024-01-16T11:00:00Z"},
    {"id": "4", "status": "cancelled", "created_at": "2024-01-13T08:00:00Z"},
    {"id": "5", "status": "completed", "created_at": "2024-01-17T12:00:00Z"},
    {"id": "6", "status": "active", "created_at": "2024-01-12T07:00:00Z"},
    {"id": "7", "status": "completed", "created_at": "2024-01-18T13:00:00Z"},
    {"id": "8", "status": "cancelled", "created_at": "2024-01-11T06:00:00Z"},
    {"id": "9", "status": "active", "created_at": "2024-01-19T14:00:00Z"},
    {"id": "10", "status": "completed", "created_at": "2024-01-10T05:00:00Z"},
]

VALID_SORT_FIELDS = {"id", "status", "created_at"}
VALID_ORDER = {"asc", "desc"}
DEFAULT_PER_PAGE = 5


def get_records(sort_by: str = "id", order: str = "asc"):
    """Return all records sorted by sort_by and order. No filtering."""
    key = sort_by
    reverse = order == "desc"
    return sorted(RECORDS, key=lambda r: r[key], reverse=reverse)


@app.route("/")
def list_records():
    """List records with pagination and sort. No filter parameter."""
    page = request.args.get("page", "1")
    per_page = request.args.get("per_page", str(DEFAULT_PER_PAGE))
    sort_by = request.args.get("sort_by", "id")
    order = request.args.get("order", "asc")

    try:
        page = max(1, int(page))
    except ValueError:
        page = 1
    try:
        per_page = max(1, min(100, int(per_page)))
    except ValueError:
        per_page = DEFAULT_PER_PAGE

    if sort_by not in VALID_SORT_FIELDS:
        sort_by = "id"
    if order not in VALID_ORDER:
        order = "asc"

    all_records = get_records(sort_by=sort_by, order=order)
    total = len(all_records)
    total_pages = max(1, (total + per_page - 1) // per_page) if total else 1
    page = min(page, total_pages)
    start = (page - 1) * per_page
    end = start + per_page
    records = all_records[start:end]

    # Build URL params for links (page, per_page, sort_by, order). No filter.
    query = {
        "page": page,
        "per_page": per_page,
        "sort_by": sort_by,
        "order": order,
    }

    return render_template(
        "list.html",
        records=records,
        total=total,
        total_pages=total_pages,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        order=order,
        query=query,
    )


@app.route("/api/records")
def api_list_records():
    """List API: pagination and sort. No filter parameter. Returns JSON."""
    page = request.args.get("page", "1")
    per_page = request.args.get("per_page", str(DEFAULT_PER_PAGE))
    sort_by = request.args.get("sort_by", "id")
    order = request.args.get("order", "asc")

    try:
        page = max(1, int(page))
    except ValueError:
        page = 1
    try:
        per_page = max(1, min(100, int(per_page)))
    except ValueError:
        per_page = DEFAULT_PER_PAGE

    if sort_by not in VALID_SORT_FIELDS:
        sort_by = "id"
    if order not in VALID_ORDER:
        order = "asc"

    all_records = get_records(sort_by=sort_by, order=order)
    total = len(all_records)
    total_pages = max(1, (total + per_page - 1) // per_page) if total else 1
    page = min(page, total_pages)
    start = (page - 1) * per_page
    end = start + per_page
    records = all_records[start:end]

    return {
        "records": records,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "sort_by": sort_by,
        "order": order,
    }


if __name__ == "__main__":
    app.run(debug=True, port=5000)
