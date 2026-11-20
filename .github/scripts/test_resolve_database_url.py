import unittest
from resolve_database_url import resolve_database_url


class DeploymentDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "GITHUB_REF_NAME": "main", "POSTGRES_USER": "test-user",
            "POSTGRES_PASSWORD": "test@:$%", "ENV_POSTGRES_DB": "syncbeats",
            "DATABASE_URL": "postgresql://fake:fake@staging.example.invalid/test",
        }

    def test_production_keeps_local_database_when_staging_secret_exists(self):
        self.assertEqual(resolve_database_url(self.env),
                         "postgresql://test-user:test%40%3A%24%25@postgres:5432/syncbeats")

    def test_remote_production_requires_separate_configuration(self):
        uri = "postgresql://fake:fake@production.example.invalid/prod"
        self.assertEqual(resolve_database_url({**self.env, "PRODUCTION_DATABASE_URL": uri}), uri)

    def test_staging_keeps_configured_database_and_local_fallback(self):
        env = {**self.env, "GITHUB_REF_NAME": "nodejs-dev", "ENV_POSTGRES_DB": "syncbeats_staging"}
        self.assertEqual(resolve_database_url(env), self.env["DATABASE_URL"])
        self.assertTrue(resolve_database_url({**env, "DATABASE_URL": ""}).endswith("@postgres:5432/syncbeats_staging"))

    def test_unknown_branch_or_invalid_configuration_fails(self):
        with self.assertRaises(ValueError):
            resolve_database_url({**self.env, "GITHUB_REF_NAME": "other"})
        with self.assertRaises(ValueError):
            resolve_database_url({**self.env, "PRODUCTION_DATABASE_URL": "invalid"})


if __name__ == "__main__":
    unittest.main()
