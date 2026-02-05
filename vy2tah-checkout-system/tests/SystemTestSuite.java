import com.system.Cart;
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
            // Create sample product data file
            String jsonContent = "[" +
                    "{\"id\": \"P001\", \"name\": \"Wireless Mouse\", \"price\": 29.99, \"quantity\": 15}," +
                    "{\"id\": \"P002\", \"name\": \"USB-C Cable\", \"price\": 12.50, \"quantity\": 40}," +
                    "{\"id\": \"P003\", \"name\": \"Mechanical Keyboard\", \"price\": 89.99, \"quantity\": 8}," +
                    "{\"id\": \"P004\", \"name\": \"HDMI Cable\", \"price\": 9.99, \"quantity\": 100}," +
                    "{\"id\": \"P005\", \"name\": \"Laptop Stand\", \"price\": 34.99, \"quantity\": 20}" +
                    "]";

            Files.writeString(Path.of(testFilePath), jsonContent);
            success("Sample product data file created");

            // loading the catalog
            CheckoutSystem system = new CheckoutSystem(testFilePath);
            success("Product catalog loaded successfully");

            // loading fails when file is missing
            try {
                new CheckoutSystem("this-file-does-not-exist.json");
                fail("Constructor did NOT throw exception for missing file");
            } catch (RuntimeException e) {
                success("Constructor throws exception for missing/invalid file");
            }

            // getProduct returns correct data or null
            Product p = system.getProduct("P001");
            if (p == null || !p.getName().equals("Wireless Mouse") || p.getPrice() != 29.99) {
                fail("getProduct returned incorrect product data");
            }

            if (system.getProduct("NON-EXISTENT") != null) {
                fail("getProduct did not return null for non-existing product");
            }
            success("getProduct returns correct product or null");

            // stock validation logic
            if (!system.validateStock("P001", 10)) {
                fail("validateStock failed for valid quantity");
            }
            if (system.validateStock("P001", 20)) {
                fail("validateStock allowed quantity exceeding available stock");
            }
            success("validateStock correctly checks availability");

            // adding items new and update quantity
            system.addToCart("P001", 3);
            system.addToCart("P001", 2);
            system.addToCart("P003", 1);

            List<CartItem> items = system.getCart().getItems();
            if (items.size() != 2) {
                fail("Cart does not contain the expected number of items");
            }

            CartItem mouseItem = items.stream()
                    .filter(i -> i.getProduct().getId().equals("P001"))
                    .findFirst().orElse(null);

            if (mouseItem == null || mouseItem.getQuantity() != 5) {
                fail("Adding the same product did not correctly update quantity");
            }
            success("addToCart correctly adds and updates item quantities");

            // stock limit enforcement
            try {
                system.addToCart("P003", 10);
                fail("addToCart allowed quantity exceeding stock");
            } catch (IllegalStateException e) {
                success("addToCart throws exception when stock is insufficient");
            }

            // negative quantity rejection
            try {
                system.addToCart("P001", -1);
                fail("addToCart allowed negative quantity");
            } catch (IllegalArgumentException e) {
                success("addToCart throws exception for negative quantity");
            }

            system.checkout(); // reset to empty cart

            if (!system.getCart().getItems().isEmpty()) {
                fail("Cart was not empty after checkout");
            }

            system.viewCart(); // should show empty cart message

            system.addToCart("P001", 3);
            system.removeFromCart("P001");

            if (!system.getCart().getItems().stream().noneMatch(i -> i.getProduct().getId().equals("P001"))) {
                fail("removeFromCart did not remove the item");
            }

            system.removeFromCart("NON-EXISTENT");

            system.addToCart("P002", 2);
            system.addToCart("P004", 3);

            double totalBefore = system.getCart().getTotal();
            if (totalBefore <= 0) {
                fail("Cart total was not calculated correctly");
            }

            // to print the actual receipt to prove checkout formatting works
            system.checkout();

            if (!system.getCart().getItems().isEmpty()) {
                fail("Cart was not cleared after checkout");
            }
            success("removeFromCart, checkout (with receipt), and cart clear work correctly");

            // total calculation in CartItem
            system.addToCart("P005", 1);
            CartItem stand = system.getCart().getItems().get(0);
            if (Math.abs(stand.getLineTotal() - 34.99) > 0.001) {
                fail("CartItem line total calculation is incorrect");
            }
            success("CartItem line total is calculated correctly");

            // Cleanup
            Files.deleteIfExists(Path.of(testFilePath));

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