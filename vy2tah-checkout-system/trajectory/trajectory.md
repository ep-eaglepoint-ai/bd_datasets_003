# Project Trajectory: Java Checkout System Implementation

## Analysis
I deconstructed the Checkout System requirements into four main pillars: **Catalog Management** (JSON loading & $O(1)$ lookup), **Cart Semantics** (add/update/remove with quantity merging), **Stock Integrity** (cart-aware availability checks + meaningful exceptions), and **User Experience** (formatted `viewCart` & checkout receipt + cart reset). 

The most challenging part was implementing **cart-aware stock validation**. Most simple implementations only check the catalog stock and forget to account for quantities already in the cart. I addressed this by calculating the "effective available stock" using:
Stock_effective = Stock_catalog - Quantity_in\_cart



## Strategy
* **Data Structure:** Used `HashMap<String, Product>` for fast product lookups by ID and `ArrayList<CartItem>` in the `Cart` for simple iteration and quantity updates.
* **JSON Parsing:** Chose **Jackson** over Gson due to its robust error handling and direct support for deserializing JSON arrays into object arrays—a standard recommendation in Java communities.
* **Stock Validation:** Created a dedicated `validateStock` method that scans the cart to compute current quantity. I kept it linear since cart sizes are expected to be small.
* **Exception Handling:** Threw `IllegalArgumentException` for invalid input (missing product, non-positive quantity) and `IllegalStateException` for business rule violations (insufficient stock), following standard Java practices.
* **Output Formatting:** Used `System.out.printf` with fixed-width specifiers (`%-28s %5d %11.2f %13.2f`) to create aligned, table-like receipts. 
* **Testability:** Added a `getCart()` accessor (package-private) to allow the validation suite to inspect cart state without breaking encapsulation.



## Execution
1.  **Skeleton:** Defined `Product`, `CartItem`, `Cart`, and `CheckoutSystem` classes with fields and getters first.
2.  **JSON Loading:** Implemented the constructor using `ObjectMapper.readValue(file, Product[].class)`. I spent significant time fixing missing default constructors and field name mismatches.
3.  **Cart Logic:** Built `addItem` with ID-based merge logic. Fixed a bug where repeated adds created duplicate entries instead of updating the quantity.
4.  **Stock Check:** Wrote `validateStock` to sum existing cart quantity before checking catalog stock. Tested edge cases like over-requesting and zero-stock scenarios.
5.  **Operations:** Added `addToCart`, `removeFromCart`, `viewCart`, and `checkout`. Adjusted `printf` patterns multiple times to get the clean alignment seen in the final receipt.
6.  **Validation Suite:** Created `CheckoutSystemTest.java` to verify every major behavior and requirement.
7.  **Dockerization:** Fixed the `Evaluation.java` script to run on Linux containers by removing Windows-specific `cmd.exe` calls.

## Resources & Documentation
* **Jackson - ObjectMapper:** [Class ObjectMapper](https://fasterxml.github.io/jackson-databind/javadoc/2.7/com/fasterxml/jackson/databind/ObjectMapper.html)
* [**JSON Serialization and Deserialization in Java:** ](https://medium.com/@bubu.tripathy/json-serialization-and-deserialization-in-java-2a3f08266b70)
* **Java Formatting:** [Oracle: Formatting Numeric Output](https://docs.oracle.com/javase/tutorial/java/data/numberformat.html)
* **Collections:** [Oracle: The Map Interface](https://docs.oracle.com/javase/tutorial/collections/interfaces/map.html)
* **Stack Overflow - JSON Lists:** [How to deserialize JSON array of list elements in Java?](https://stackoverflow.com/questions/11359666/how-to-deserialize-json-array-to-java-list-with-jackson)
* **Stack Overflow - Table Padding:** [Left-pad printf with spaces](https://stackoverflow.com/questions/293438/left-pad-printf-with-spaces)
* **Exception Patterns:** [Baeldung: Common Java Exceptions](https://www.baeldung.com/java-common-exceptions)
* **Java Exception Best Practices:** [Oracle Tutorial](https://docs.oracle.com/javase/tutorial/essential/exceptions/runtime.html)