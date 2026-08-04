from src.main import greet


def test_greet_john():
    assert greet("John") == "Hello, John!"


def test_greet_maria():
    assert greet("Maria") == "Hello, Maria!"


def test_greet_cpe106l():
    assert greet("CPE106L") == "Hello, CPE106L!"