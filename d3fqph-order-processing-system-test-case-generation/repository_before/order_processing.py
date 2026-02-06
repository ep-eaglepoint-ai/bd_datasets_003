import asyncio
import random
import time
from typing import List, Dict, Callable

# Custom exception for invalid orders
class InvalidOrderError(Exception):
    pass

# A class that simulates an order
class Order:
    def __init__(self, order_id: int, product: str, quantity: int, price: float):
        self.order_id = order_id
        self.product = product
        self.quantity = quantity
        self.price = price
        self.total = self.calculate_total()

    def calculate_total(self) -> float:
        return self.quantity * self.price

    def __repr__(self):
        return f"Order({self.order_id}, {self.product}, {self.quantity}, {self.total})"


# A class to handle user data and their orders
class User:
    def __init__(self, user_id: int, name: str):
        self.user_id = user_id
        self.name = name
        self.orders = []

    def add_order(self, order: Order):
        self.orders.append(order)

    def __repr__(self):
        return f"User({self.user_id}, {self.name}, Orders: {len(self.orders)})"


# Function that simulates a long-running network operation (e.g., external API call)
async def fetch_order_from_external_api(order_id: int) -> Order:
    await asyncio.sleep(2)  # Simulate network delay
    product = random.choice(["Laptop", "Phone", "Tablet"])
    quantity = random.randint(1, 5)
    price = random.uniform(100, 2000)
    return Order(order_id, product, quantity, price)


# Function that validates the order data
def validate_order(order: Order) -> bool:
    if order.quantity <= 0:
        raise InvalidOrderError(f"Invalid quantity for order {order.order_id}")
    if order.price <= 0:
        raise InvalidOrderError(f"Invalid price for order {order.order_id}")
    return True


# Dynamically create a function to process the order, based on a product type
def create_order_processor(product_type: str) -> Callable[[Order], None]:
    def process_order(order: Order):
        if order.product != product_type:
            raise InvalidOrderError(f"Order product does not match {product_type}")
        print(f"Processing {product_type} order: {order}")
    return process_order


# A class to simulate an order processing service
class OrderProcessingService:
    def __init__(self):
        self.users: Dict[int, User] = {}

    def get_user(self, user_id: int) -> User:
        if user_id not in self.users:
            self.users[user_id] = User(user_id, f"User{user_id}")
        return self.users[user_id]

    async def process_order(self, user_id: int, order_id: int):
        user = self.get_user(user_id)
        try:
            order = await fetch_order_from_external_api(order_id)
            print(f"Fetched order: {order}")

            if validate_order(order):
                # Dynamically create a product-specific processor function
                processor = create_order_processor(order.product)
                processor(order)  # Process the order

                user.add_order(order)  # Add the order to the user’s list
                print(f"Order processed for user {user.name}. Total: {order.total}")
            else:
                print(f"Order validation failed for order {order_id}.")
        except InvalidOrderError as e:
            print(f"Error processing order {order_id}: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")


# A function to simulate multiple asynchronous order processing tasks
async def process_multiple_orders():
    service = OrderProcessingService()

    # Simulate a batch of orders for multiple users
    tasks = [
        service.process_order(user_id=1, order_id=101),
        service.process_order(user_id=2, order_id=102),
        service.process_order(user_id=1, order_id=103),
        service.process_order(user_id=3, order_id=104),
        service.process_order(user_id=2, order_id=105)
    ]
    
    await asyncio.gather(*tasks)


# Main function to run the order processing system
def main():
    start_time = time.time()
    asyncio.run(process_multiple_orders())
    print(f"Total time for processing orders: {time.time() - start_time:.2f} seconds")


if __name__ == "__main__":
    main()
