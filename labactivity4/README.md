# Lab Activity 4 - Design Patterns and Unit Testing

**Design Choice: Builder Pattern**

## About it
A burger can have any number of layers, in any order, and any layer
can be skipped entirely (no patty, no bun, no lettuce, etc.). A
regular constructor would need a long list of optional parameters
like Burger(bun=True, patty_count=2, lettuce=False, ...), which
gets messy and hard to read.

The Builder Pattern instead constructs the burger one layer at a time
through chained method calls (.add_bun().add_patty().add_lettuce()),
and only assembles the final object when .build() is called. This
lets the caller freely decide which layers to include and in what
order, without the Burger class itself needing to handle every
possible combination.

## Folder structure

labactivity4/
  README.md
  screenshots/
  src/
     main.py         
  testcase/
     testcases.py  


## How to run

Run the program (from `src/`):

-*cd src*
-*python3 main.py*

Run the tests (from the `labactivity4` root):

*python -m unittest discover -s testcase -v*


## Test cases covered
1. Builder assembles layers in the exact order they were added
2. Builder supports skipping a layer
3. Builder supports a bunless burger
4. Calling build() with zero layers still returns a valid (empty) burger
5. Builder resets properly after build() so it can be reused for a new burger

