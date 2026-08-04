from src.main import greet

def test_greet():
    assert greet("John") == "Hello, John!"
    assert greet("Maria") == "Hello, Maria!"
    assert greet("CPE106L") == "Hello, CPE106L!"