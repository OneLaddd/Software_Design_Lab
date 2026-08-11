
products = {}
next_id = 1
 
 
def add_product():
    global next_id
 
    name = input("Product name: ").strip().title() 
 
    try:
        price = float(input("Price (PHP): "))
        reserves = int(input("Stock reserves: "))
        length = float(input("Length (cm): "))
        width = float(input("Width (cm): "))
        height = float(input("Height (cm): "))
    except ValueError:
        print("Invalid number entered. Product not added.")
        return
 
    dimensions = (length, width, height) 
    history = []                          
 
    products[next_id] = {
        "name": name,
        "price": price,
        "reserves": reserves,
        "dimensions": dimensions,
        "history": history,
    }
 
    print(f"Product '{name}' added with ID {next_id}.")
    next_id += 1
 
 
def view_products():
    print("\n--- Product Inventory ---")
    if not products:
        print("No products found.")
        return
 
    print(f"{'ID':<5}{'Name':<20}{'Price':<10}{'Stock':<8}{'Dimensions':<15}")
    print("-" * 58)
    for pid, info in products.items():
        dims = f"{info['dimensions'][0]}x{info['dimensions'][1]}x{info['dimensions'][2]}"
        print(f"{pid:<5}{info['name']:<20}{info['price']:<10.2f}{info['reserves']:<8}{dims:<15}")
 
    print("-" * 58)
    print("Inventory value per product:")
    total_value = 0
    for pid, info in products.items():
        value = info["price"] * info["reserves"]
        total_value += value
        print(f"  {info['name']}: PHP {value:,.2f}")
 
    print(f"\nTotal inventory value: PHP {total_value:,.2f}")
 
 
def view_product_detail():
    view_products()
    if not products:
        return
 
    try:
        pid = int(input("\nEnter product ID to view: "))
    except ValueError:
        print("Invalid ID.")
        return
 
    if pid not in products:
        print("Product ID not found.")
        return
 
    info = products[pid]
    print(f"\n--- Product #{pid}: {info['name']} ---")
    print(f"Price: PHP {info['price']:.2f}")
    print(f"Stock: {info['reserves']}")
    print(f"Dimensions (LxWxH): {info['dimensions']}")
    if info["history"]:
        print("Change history:")
        for entry in info["history"]:
            print(f"  - {entry}")
    else:
        print("Change history: (no changes yet)")
 
 
def update_product():
    view_products()
    if not products:
        return
 
    try:
        pid = int(input("\nEnter product ID to update: "))
    except ValueError:
        print("Invalid ID.")
        return
 
    if pid not in products:
        print("Product ID not found.")
        return
 
    info = products[pid]
    new_price = input(f"New price (current: {info['price']:.2f}, blank to skip): ").strip()
    new_stock = input(f"New stock (current: {info['reserves']}, blank to skip): ").strip()
 
    if new_price:
        try:
            new_price = float(new_price)
            info["history"].append(f"Price {info['price']:.2f} -> {new_price:.2f}")
            info["price"] = new_price
        except ValueError:
            print("Invalid price, skipped.")
 
    if new_stock:
        try:
            new_stock = int(new_stock)
            info["history"].append(f"Stock {info['reserves']} -> {new_stock}")
            info["reserves"] = new_stock
        except ValueError:
            print("Invalid stock value, skipped.")
 
    print(f"Product #{pid} updated.")
 
 
def delete_product():
    """DELETE: Remove a product."""
    view_products()
    if not products:
        return
 
    try:
        pid = int(input("\nEnter product ID to delete: "))
    except ValueError:
        print("Invalid ID.")
        return
 
    if pid in products:
        del products[pid]
        print("Product deleted.")
    else:
        print("Product ID not found.")
 
 
def main_menu():
    """Main program loop."""
    while True:
        print("\n===== PRODUCT INVENTORY SYSTEM =====")
        print("1. Add Product (Create)")
        print("2. View All Products (Read + Value Summary)")
        print("3. View Product Details (Read + History)")
        print("4. Update Product (Update)")
        print("5. Delete Product (Delete)")
        print("6. Exit")
 
        choice = input("Choose an option (1-6): ").strip()
 
        if choice == "1":
            add_product()
        elif choice == "2":
            view_products()
        elif choice == "3":
            view_product_detail()
        elif choice == "4":
            update_product()
        elif choice == "5":
            delete_product()
        elif choice == "6":
            print("Exiting program. Goodbye!")
            break
        else:
            print("Invalid choice.")
 
 
if __name__ == "__main__":
    main_menu()
 