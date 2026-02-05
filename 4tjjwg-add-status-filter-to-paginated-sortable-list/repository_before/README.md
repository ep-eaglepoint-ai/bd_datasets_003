# repositore_before — Pre-feature state (no status filter)

Existing app: paginated, sortable list of records. **No status filter.**  
This is the state before adding the "filter by status" feature.

## Stack

- Python 3.11+
- Flask 3.x
- Jinja2 (server-rendered)
- In-memory data (no DB)

## Data

- **Record**: `id`, `status` (active | completed | cancelled), `created_at`
- **List**: pagination (`page`, `per_page`) and sort (`sort_by`, `order`). No filter.

## Run

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
flask --app app run
```

- Web UI: http://127.0.0.1:5000/
- API: http://127.0.0.1:5000/api/records?page=1&per_page=5&sort_by=id&order=asc

## URL / API (before feature)

- **Page**: `/?page=1&per_page=5&sort_by=id&order=asc` — no `filter` or `status` param.
- **API**: `GET /api/records?page=1&per_page=5&sort_by=id&order=asc` — same; no filter param.
- Unfiltered list: all records, then sort, then paginate.

## Tests

```bash
pytest
```

Existing tests cover list (HTML and API) with pagination and sort only; no filter.
