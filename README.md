# Hex

A FastAPI application for Hex games and board displays.

## Run locally

Use Python 3.10 or newer. From the repository root:

```sh
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/ for the game menu.
Python dependencies are declared in `requirements.txt`.
