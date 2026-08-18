import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
from main import BurgerBuilder, Burger


class TestBurgerBuilder(unittest.TestCase):

    def test_classic_burger_layer_order(self):
        burger = (
            BurgerBuilder()
            .add_bun()
            .add_cheese()
            .add_ketchup()
            .add_patty()
            .add_patty()
            .add_lettuce()
            .add_bun()
            .build()
        )
        expected = ["bun", "cheese", "ketchup", "patty", "patty", "lettuce", "bun"]
        self.assertEqual(burger.layers, expected)

    def test_burger_with_no_patty(self):
        burger = BurgerBuilder().add_bun().add_lettuce().add_bun().build()
        self.assertNotIn("patty", burger.layers)
        self.assertEqual(len(burger.layers), 3)

    def test_burger_with_no_bun(self):
        burger = BurgerBuilder().add_patty().add_cheese().build()
        self.assertNotIn("bun", burger.layers)

    def test_empty_burger(self):
        burger = BurgerBuilder().build()
        self.assertEqual(burger.layers, [])
        self.assertIsInstance(burger, Burger)

    def test_builder_is_reusable_after_build(self):
        builder = BurgerBuilder()
        first = builder.add_bun().add_patty().build()
        second = builder.add_lettuce().build()

        self.assertEqual(first.layers, ["bun", "patty"])
        self.assertEqual(second.layers, ["lettuce"])


if __name__ == "__main__":
    unittest.main()