

class Student:
    def __init__(self, student_id, name, year_level):
        self.student_id = student_id
        self.name = name
        self.year_level = year_level
        self.enrolled_courses = []
    def enroll(self, course):
        if course in self.enrolled_courses:
            print(f"[!] Already enrolled in {course}.")
            return
        self.enrolled_courses.append(course)
        print(f"[+] {self.name} enrolled in {course}.")

    def drop(self, course):
        if course not in self.enrolled_courses:
            print(f"[!] Not enrolled in {course}.")
            return
        self.enrolled_courses.remove(course)
        print(f"[-] {self.name} dropped {course}.")

    def __str__(self):
        courses = ", ".join(self.enrolled_courses) or "None"
        return f"ID: {self.student_id} | {self.name} | {self.year_level} | Courses: {courses}"


class EnrollmentSystem:
    def __init__(self):
        self.students = {}
    def add_student(self, sid, name, year):
        if sid in self.students:
            print(f"[!] ID {sid} already exists.")
            return
        self.students[sid] = Student(sid, name, year)
        print(f"[+] Added {name} (ID: {sid}).")
    
    def find_student(self, sid):
        student = self.students.get(sid)
        if student is None:
            print(f"[!] No student with ID {sid}.")
        return student

    def remove_student(self, sid):
        if self.students.pop(sid, None) is None:
            print(f"[!] No student with ID {sid}.")
        else:
            print(f"[-] Removed student ID {sid}.")

    def list_students(self):
        if not self.students:
            print("No students in the system.")
            return
        for s in self.students.values():
            print(s)

    def list_by_course(self, course):
        found = [s for s in self.students.values() if course in s.enrolled_courses]
        if not found:
            print(f"No students enrolled in {course}.")
            return
        for s in found:
            print(s)

