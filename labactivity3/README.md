# Lab Activity 3 - Enrollment Records System

CPE106L-4 Software Design Laboratory

## Description
- *Student* - stores student info and enrolled courses; can enroll/drop courses.
- *EnrollmentSystem* - manages a collection of Student objects; add, remove, find, and list students.

## Files
- helpers.py
- main.py
- screenshots 

## How to Run
bash
python3 -m venv venv
source venv/bin/activate
cd labactivity3
python3 main.py


## Menu Options
1. Add Student
2. Enroll in Course
3. Drop Course
4. View All Students
5. View by Course
6. Remove Student
7. Exit

## Testing
Tested manually via the menu, covering:
1. Adding a student and enrolling them in courses
2. Dropping a course and viewing the updated record
3. Removing Student

See testcases/ for sample outputs.
