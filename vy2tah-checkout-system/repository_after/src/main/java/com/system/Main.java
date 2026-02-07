package com.system;

public class Main {
    public static void main(String[] args) {
        CheckoutSystem system = new CheckoutSystem("products.json");

        System.out.println("========================================");
        System.out.println("    CHECKOUT SYSTEM FINAL DEMO          ");
        System.out.println("========================================\n");

        System.out.println("--- [Test 1] Adding Valid Items ---");
        system.addToCart("P001", 2);
        system.addToCart("P002", 3);
        system.addToCart("P001", 1);
        System.out.println("Items added successfully.\n");

        System.out.println("--- [Test 2] Testing Error Handling ---");
        
        System.out.print("Adding Invalid ID (P999): ");
        system.addToCart("P999", 1); 

        System.out.print("Adding Excessive Quantity (1000 units): ");
        system.addToCart("P001", 1000); 
        System.out.println();

        System.out.println("--- [Test 3] View Current Cart ---");
        system.viewCart();

        System.out.println("\n--- [Test 4] Removing Item (P002) ---");
        system.removeFromCart("P002");
        system.viewCart();

        System.out.println("\n--- [Test 5] Final Checkout ---");
        system.checkout();

        System.out.println("\n--- [Test 6] Verify Cart is Empty ---");
        system.viewCart();

        System.out.println("\n========================================");
        System.out.println("           DEMO COMPLETED               ");
        System.out.println("========================================");
    }
}