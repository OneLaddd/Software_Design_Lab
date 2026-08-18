from helpers import Student, EnrollmentSystem

def main():
    system = EnrollmentSystem()
    menu = (
        "\n===== Enrollment Records System =====\n"
        "1. Add Student        4. View All Students\n"
        "2. Enroll in Course    5. View by Course\n"
        "3. Drop Course         6. Remove Student\n"
        "              7. Exit\n"
        "======================================="
    )

    while True:
        print(menu)
        choice = input("Choice: ").strip()

        if choice == "1":
            system.add_student(input("ID: "), input("Name: "), input("Year: "))
        elif choice == "2":
            s = system.find_student(input("ID: "))
            if s: s.enroll(input("Course: "))
        elif choice == "3":
            s = system.find_student(input("ID: "))
            if s: s.drop(input("Course: "))
        elif choice == "4":
            system.list_students()
        elif choice == "5":
            system.list_by_course(input("Course: "))
        elif choice == "6":
            system.remove_student(input("ID: "))
        elif choice == "7":
            print("Goodbye!")
            break
        else:
            print("[!] Invalid choice.")

if __name__ == "__main__":
    main()