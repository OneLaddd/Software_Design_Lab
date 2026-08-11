# Lab Activity 2: Strings, Lists, Tuples, and Dictionaries

Author: John David C. Ajon

## What it does

Menu-driven product inventory CRUD program using:
- **Dictionary** - products, the main database
- **Tuple** - dimensions (fixed, doesn't change)
- **List** - history (logs price/stock changes)
- **String** - input cleaning and formatted output

## Command to run

```
python3 src/main.py
```

## Test cases

```
python3 src/main.py < tests/test1_input.txt   # Add + view all
python3 src/main.py < tests/test2_input.txt   # Update + view history
python3 src/main.py < tests/test3_input.txt   # Delete + invalid ID handling
```

## Limitations

- No file storage or JSON data is in-memory only and resets on exit, per rubric scope.
- Test inputs are piped from .txt files, so typed values aren't echoed in the terminal; the input files themselves show what was entered.
- Basic error handling only (invalid numbers/IDs); no business-rule validation.
