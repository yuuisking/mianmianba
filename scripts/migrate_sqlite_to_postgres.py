#!/usr/bin/env python3
"""Migrate Prisma business data from a SQLite file to a PostgreSQL database."""

import csv
import datetime
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple


TABLES = [
    ("User", ["id", "email", "password", "name", "createdAt", "updatedAt"]),
    (
        "InterviewSession",
        ["id", "userId", "status", "score", "mode", "createdAt", "updatedAt"],
    ),
    ("Message", ["id", "sessionId", "role", "content", "createdAt"]),
    (
        "Report",
        [
            "id",
            "sessionId",
            "highlights",
            "risks",
            "nextSteps",
            "dimensions",
            "evidence",
            "createdAt",
            "updatedAt",
        ],
    ),
    ("Weakness", ["id", "userId", "dimension", "description", "createdAt", "updatedAt"]),
    (
        "KnowledgeDocument",
        [
            "id",
            "userId",
            "name",
            "sourceType",
            "sourceUrl",
            "size",
            "status",
            "arkDocId",
            "createdAt",
            "updatedAt",
        ],
    ),
]


def require_env(name: str) -> str:
    """Read a required environment variable and fail loudly when missing."""
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def export_table(sqlite_conn: sqlite3.Connection, table: str, columns: List[str], output_dir: Path) -> Path:
    """Export one SQLite table to a CSV file with a deterministic column order."""
    output_path = output_dir / f"{table}.csv"
    quoted_columns = ", ".join(f'"{column}"' for column in columns)
    query = f'SELECT {quoted_columns} FROM "{table}"'
    cursor = sqlite_conn.execute(query)

    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(columns)
        for row in cursor.fetchall():
            writer.writerow([normalize_value(column, value) for column, value in zip(columns, row)])

    return output_path


def normalize_value(column: str, value):
    """Normalize SQLite values into PostgreSQL-friendly CSV content."""
    if value is None:
        return None

    if column.endswith("At"):
        numeric = None
        if isinstance(value, int):
            numeric = value
        elif isinstance(value, str) and value.isdigit():
            numeric = int(value)

        if numeric is not None:
            if numeric > 10**12:
                numeric = numeric / 1000.0
            elif numeric > 10**10:
                numeric = numeric / 1000.0
            return datetime.datetime.utcfromtimestamp(numeric).strftime("%Y-%m-%d %H:%M:%S.%f")

    return value


def run_psql(command: str, env: Dict[str, str]) -> None:
    """Run one psql command and stop immediately on any PostgreSQL error."""
    subprocess.run(
        [
            "psql",
            "-h",
            env["PGHOST"],
            "-p",
            env["PGPORT"],
            "-U",
            env["PGUSER"],
            "-d",
            env["PGDATABASE"],
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            command,
        ],
        check=True,
        env=env,
    )


def import_table(table: str, columns: List[str], csv_path: Path, env: Dict[str, str]) -> None:
    """Import one CSV file into the target PostgreSQL table with explicit columns."""
    column_list = ", ".join(f'"{column}"' for column in columns)
    copy_sql = (
        f'\\copy "{table}" ({column_list}) '
        f"FROM '{csv_path.as_posix()}' WITH (FORMAT csv, HEADER true)"
    )
    run_psql(copy_sql, env)


def main() -> None:
    """Export all Prisma tables from SQLite and import them into PostgreSQL."""
    sqlite_path = Path(require_env("SQLITE_PATH"))
    if not sqlite_path.exists():
        raise SystemExit(f"SQLite database not found: {sqlite_path}")

    pg_env = {
        "PGHOST": require_env("PGHOST"),
        "PGPORT": os.environ.get("PGPORT", "5432"),
        "PGUSER": require_env("PGUSER"),
        "PGDATABASE": require_env("PGDATABASE"),
        "PGPASSWORD": require_env("PGPASSWORD"),
        **os.environ,
    }

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row

    with tempfile.TemporaryDirectory(prefix="sqlite-to-postgres-") as temp_dir:
        temp_path = Path(temp_dir)
        exported_files = []  # type: List[Tuple[str, List[str], Path]]

        for table, columns in TABLES:
            csv_path = export_table(sqlite_conn, table, columns, temp_path)
            exported_files.append((table, columns, csv_path))

        run_psql(
            'TRUNCATE TABLE "Message", "Report", "Weakness", "KnowledgeDocument", "InterviewSession", "User" CASCADE',
            pg_env,
        )

        for table, columns, csv_path in exported_files:
            import_table(table, columns, csv_path, pg_env)

    sqlite_conn.close()
    print("SQLite -> PostgreSQL migration completed successfully.")


if __name__ == "__main__":
    main()
