import os
import sys
import pytest
import asyncio

# Ensure backend root is on sys.path
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from database.mongodb import connect_to_mongo, get_database

@pytest.fixture(scope="session", autouse=True)
def setup_mongo_session():
    """
    Connect to MongoDB once for the entire test session.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(connect_to_mongo())
    except Exception as e:
        print(f"\n[conftest] Warning: MongoDB connection failed: {e}")
