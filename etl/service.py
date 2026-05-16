from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from etl import sync_whooing

app = FastAPI(title="HB Finance Ledger ETL")


class WhooingSyncRequest(BaseModel):
    start_date: str = Field(pattern=r"^\d{8}$")
    end_date: str = Field(pattern=r"^\d{8}$")

    @model_validator(mode="after")
    def validate_range(self):
        if self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        return self


class WhooingSyncResponse(BaseModel):
    ok: bool
    start_date: str
    end_date: str
    fetched: int
    upserted: int
    deleted: int


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/sync/whooing", response_model=WhooingSyncResponse)
def sync_whooing_entries(request: WhooingSyncRequest) -> dict[str, Any]:
    try:
        result = sync_whooing.sync(
            start_date=request.start_date,
            end_date=request.end_date,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Whooing sync failed") from exc

    return {
        "ok": True,
        **result,
    }
