import com.system.CartItem;
import com.system.CheckoutSystem;
import com.system.Product;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class SystemTestSuite {

    private static void fail(String message) {
        System.err.println("\n[FAIL] " + message);
        System.exit(1);
    }

    private static void success(String message) {
        System.out.println("[PASS] " + message);
    }

    public static void main(String[] args) {
        System.out.println("==================================================");
        System.out.println("   CHECKOUT SYSTEM VALIDATION SUITE   ");
        System.out.println("==================================================\n");

        String testFilePath = "test_products.json";

        try {
            // create sample product data file
            String jsonContent = "[" +
                    "{\"id\": \"P001\", \"name\": \"Wireless Mouse\", \"price\": 29.99, \"quantity\": 15}," +
                    "{\"id\": \"P002\", \"name\": \"USB-C Cable\", \"price\": 12.50, \"quantity\": 40}," +
                    "{\"id\": \"P003\", \"name\": \"Mechanical Keyboard\", \"price\": 89.99, \"quantity\": 5}," +
                    "{\"id\": \"P004\", \"name\": \"HDMI Cable\", \"price\": 9.99, \"quantity\": 100}," +
                    "{\"id\": \"P005\", \"name\": \"Laptop Stand\", \"price\": 34.99, \"quantity\": 1}" +
                    "]";
            Files.writeString(Path.of(testFilePath), jsonContent);
            success("Sample product data file created");

            CheckoutSystem system = new CheckoutSystem(testFilePath);
            success("Product catalog loaded successfully");

            // getProduct test
            Product p = system.getProduct("P001");
            if (p == null || !p.getName().equals("Wireless Mouse") || p.getPrice() != 29.99)
                fail("getProduct returned incorrect product data");
            if (system.getProduct("NON-EXISTENT") != null)
                fail("getProduct did not return null for non-existing product");
            success("getProduct returns correct product or null");

            // validateStock test
            if (!system.validateStock("P001", 10))
                fail("validateStock failed for valid quantity");
            if (system.validateStock("P001", 20))
                fail("validateStock allowed quantity exceeding available stock");
            success("validateStock correctly checks availability");

            // addToCart normal test
            system.getCart().clear();
            system.addToCart("P001", 3);
            system.addToCart("P001", 2);
            system.addToCart("P003", 1);

            List<CartItem> items = system.getCart().getItems();
            if (items.size() != 2)
                fail("Cart does not contain expected number of items");

            CartItem mouseItem = items.stream().filter(i -> i.getProduct().getId().equals("P001")).findFirst()
                    .orElse(null);
            if (mouseItem == null || mouseItem.getQuantity() != 5)
                fail("Adding same product did not update quantity");
            success("addToCart correctly adds and updates quantities");

            // addToCart overstock test
            try {
                system.addToCart("P003", 10);
                fail("addToCart allowed quantity exceeding stock");
            } catch (IllegalStateException e) {
                success("addToCart throws exception for insufficient stock");
            }

            // addToCart negative quantity test
            try {
                system.addToCart("P001", -1);
                fail("addToCart allowed negative quantity");
            } catch (IllegalArgumentException e) {
                success("addToCart throws exception for negative quantity");
            }

            // checkout clears cart test
            system.checkout();
            if (!system.getCart().getItems().isEmpty())
                fail("Cart not empty after checkout");
            success("checkout clears cart correctly");

            // atomic checkout test
            system.getCart().clear();
            system.getProduct("P003").setQuantity(5);
            system.getProduct("P005").setQuantity(1);

            system.addToCart("P003", 5); // exact stock

            try {
                system.addToCart("P005", 2); // exceeds stock
            } catch (IllegalStateException e) {
                success("addToCart correctly throws exception when adding more than available stock");
            }

            system.getCart().addItem(system.getProduct("P005"), 2); // add overstock directly

            try {
                system.checkout(); // should fail
                fail("Checkout should fail atomically when any item has insufficient stock");
            } catch (IllegalStateException e) {
                success("Atomic checkout fails correctly when stock insufficient");
            }

            // verify stock unchanged
            if (system.getProduct("P003").getQuantity() != 5 || system.getProduct("P005").getQuantity() != 1)
                fail("Stock changed despite failed checkout");
            success("Stock unchanged after failed checkout");

            // successful checkout test
            system.getCart().clear();
            system.addToCart("P003", 3);
            system.addToCart("P005", 1); // within stock
            system.checkout();
            if (system.getProduct("P003").getQuantity() != 2 || system.getProduct("P005").getQuantity() != 0)
                fail("Stock did not reduce correctly after successful checkout");
            success("Stock reduces correctly after successful checkout");

            // checkout empty cart test
            system.getCart().clear();
            system.checkout();
            success("Checkout on empty cart works without error");

            // duplicate product IDs test
            String dupJson = "[" +
                    "{\"id\": \"DUP1\", \"name\": \"Item1\", \"price\": 10.0, \"quantity\": 5}," +
                    "{\"id\": \"DUP1\", \"name\": \"Item1-DUP\", \"price\": 12.0, \"quantity\": 6}" +
                    "]";
            Files.writeString(Path.of("dup_products.json"), dupJson);
            CheckoutSystem dupSystem = new CheckoutSystem("dup_products.json");
            Product dupProduct = dupSystem.getProduct("DUP1");
            if (dupProduct.getPrice() != 12.0 || dupProduct.getQuantity() != 6)
                fail("Duplicate product IDs not handled correctly");
            success("Duplicate product IDs handled correctly");

            // malformed JSON test
            String badJson = "[" +
                    "{\"id\": \"BAD1\", \"name\": \"BadItem\"}" + // missing price & quantity
                    "]";
            Files.writeString(Path.of("bad_products.json"), badJson);
            try {
                new CheckoutSystem("bad_products.json");
                fail("Malformed product JSON did not throw exception");
            } catch (RuntimeException e) {
                success("Malformed product JSON throws exception");
            }

            // product quantity persists test
            system.getCart().clear();
            system.getProduct("P003").setQuantity(5); // reset stock
            int stockBefore = system.getProduct("P003").getQuantity();
            system.addToCart("P003", 2);
            system.checkout();
            if (system.getProduct("P003").getQuantity() != stockBefore - 2)
                fail("Product quantity did not persist after checkout");
            success("Product quantity persists across multiple checkouts");

            // simulate external stock change between addToCart and checkout
            system.getCart().clear();
            system.getProduct("P001").setQuantity(5);
            system.addToCart("P001", 3);
            system.getProduct("P001").setQuantity(2); // stock decreased externally
            try {
                system.checkout();
                fail("Checkout did not detect external stock change");
            } catch (IllegalStateException e) {
                success("Checkout correctly detects stock changes made after addToCart");
            }

            // Cleanup
            Files.deleteIfExists(Path.of(testFilePath));
            Files.deleteIfExists(Path.of("dup_products.json"));
            Files.deleteIfExists(Path.of("bad_products.json"));

            System.out.println("\n==================================================");
            System.out.println("      VALIDATION COMPLETE - ALL CHECKS PASSED      ");
            System.out.println("==================================================");
            System.exit(0);

        } catch (IOException e) {
            fail("File I/O error: " + e.getMessage());
        } catch (Exception e) {
            fail("Unexpected error: " + e.getMessage());
        }
    }
}
