#!/usr/bin/env python3
"""Select the primary database without applying staging credentials to production."""
import os
from urllib.parse import quote, urlsplit


def resolve_database_url(env):
    branch = env.get("GITHUB_REF_NAME")
    user = quote(env.get("POSTGRES_USER", "syncbeats"), safe="")
    password = quote(env.get("POSTGRES_PASSWORD", "syncbeats"), safe="")
    database = quote(env["ENV_POSTGRES_DB"], safe="")
    local = f"postgresql://{user}:{password}@postgres:5432/{database}"
    if branch == "main":
        # A remote production database must be chosen explicitly, separately
        # from the repository's staging DATABASE_URL secret.
        result = env.get("PRODUCTION_DATABASE_URL") or local
    elif branch == "nodejs-dev":
        result = env.get("DATABASE_URL") or local
    else:
        raise ValueError("Unsupported deployment branch")
    parsed = urlsplit(result)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.path.strip("/"):
        raise ValueError("Invalid primary database URL")
    return result


if __name__ == "__main__":
    print(resolve_database_url(os.environ))
