
def main():

    builder = BurgerBuilder()
    classic = (
        builder.add_bun()
        .add_cheese()
        .add_ketchup()
        .add_patty()
        .add_patty()
        .add_lettuce()
        .add_bun()
        .build()
    )

    print("=== Classic Double Patty Burger ===")
    classic.display()

    veggie = BurgerBuilder().add_bun().add_lettuce().add_cheese().add_bun().build()
    print("\n=== Veggie Burger ===")
    veggie.display()

    messy = (
        BurgerBuilder()
        .add_bun()
        .add_ketchup()
        .add_patty()
        .add_patty()
        .add_patty()
        .add_patty()
        .add_cheese()
        .add_bun()
        .build()
    )

    print("\n=== Burrrrger ===")
    messy.display()

class Burger:

    LAYER_EMOJIS = {
        "bun": "🟧",
        "cheese": "🟨",
        "ketchup": "🟥",
        "patty": "🟫",
        "lettuce": "🟩",
    }

    def __init__(self):
        self.layers = []

    def add_layer(self, layer_name):
        self.layers.append(layer_name)

    def display(self):
        if not self.layers:
            print("(empty burger... nothing was added)")
            return
        for layer in self.layers:
            emoji = self.LAYER_EMOJIS[layer]
            print(f"{emoji * 5}  <= {layer.capitalize()}")


class BurgerBuilder:
    def __init__(self):
        self._burger = Burger()

    def add_bun(self):
        self._burger.add_layer("bun")
        return self

    def add_cheese(self):
        self._burger.add_layer("cheese")
        return self

    def add_ketchup(self):
        self._burger.add_layer("ketchup")
        return self

    def add_patty(self):
        self._burger.add_layer("patty")
        return self

    def add_lettuce(self):
        self._burger.add_layer("lettuce")
        return self

    def build(self):
        finished = self._burger
        self._burger = Burger()
        return finished

if __name__ == "__main__":
    main()