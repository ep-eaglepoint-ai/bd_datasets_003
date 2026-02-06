package com.system;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

public class CheckoutSystem {
    private final Map<String, Product> catalog = new LinkedHashMap<>(); // deterministic order
    private final Cart cart = new Cart();

    public CheckoutSystem(String jsonPath) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(new File(jsonPath));

            if (!root.isArray()) {
                throw new RuntimeException("Product catalog JSON must be an array");
            }

            for (JsonNode node : root) {
                if (!node.hasNonNull("id") || !node.hasNonNull("name")
                        || !node.hasNonNull("price") || !node.hasNonNull("quantity")) {
                    throw new RuntimeException("Malformed product JSON entry: " + node.toString());
                }

                String id = node.get("id").asText();
                String name = node.get("name").asText();
                double price = node.get("price").asDouble();
                int quantity = node.get("quantity").asInt();

                if (price <= 0 || quantity < 0)
                    throw new RuntimeException("Product JSON entry has invalid price or negative quantity: " + node.toString());

                Product product = new Product(id, name, price, quantity);

                if (catalog.containsKey(id)) {
                    System.out.println("Warning: Duplicate product ID '" + id + "' found. Overwriting previous entry.");
                }
                catalog.put(id, product);
            }

        } catch (IOException e) {
            throw new RuntimeException("Failed to load product catalog from " + jsonPath, e);
        }
    }

    public Product getProduct(String productId) {
        return catalog.get(productId);
    }

    public boolean validateStock(String productId, int requestedQuantity) {
        Product product = getProduct(productId);
        if (product == null) return false;

        int alreadyInCart = cart.getItems().stream()
                .filter(item -> item.getProduct().getId().equals(productId))
                .mapToInt(CartItem::getQuantity)
                .sum();

        return product.getQuantity() >= (alreadyInCart + requestedQuantity);
    }

    public void addToCart(String productId, int quantity) {
        if (quantity <= 0)
            throw new IllegalArgumentException("Quantity must be positive");

        Product product = getProduct(productId);
        if (product == null)
            throw new IllegalArgumentException("Product not found with ID: " + productId);

        if (!validateStock(productId, quantity)) {
            throw new IllegalStateException(
                    "Insufficient stock for " + product.getName() +
                            " (requested: " + (quantity) + ", available: " + product.getQuantity() + ")");
        }

        cart.addItem(product, quantity);
    }

    public void removeFromCart(String productId) {
        boolean removed = cart.removeItem(productId);
        if (!removed) {
            System.out.println("Product " + productId + " was not found in the cart.");
        }
    }

    public void viewCart() {
        if (cart.isEmpty()) {
            System.out.println("The cart is currently empty.");
            return;
        }

        System.out.println("\n=== Shopping Cart ===");
        System.out.println("-----------------------------------------------------------");
        System.out.printf("%-28s %5s %11s %13s%n", "Product Name", "Qty", "Unit Price", "Line Total");
        System.out.println("-----------------------------------------------------------");

        for (CartItem item : cart.getItems()) {
            System.out.printf("%-28s %5d %11.2f %13.2f%n",
                    item.getProduct().getName(),
                    item.getQuantity(),
                    item.getProduct().getPrice(),
                    item.getLineTotal());
        }

        System.out.println("-----------------------------------------------------------");
        System.out.printf("CART TOTAL: %45.2f%n", cart.getTotal());
        System.out.println();
    }

    // Atomic checkout either all items succeed or none do.
    
    public void checkout() {
        if (cart.isEmpty()) {
            System.out.println("Cart is empty. Nothing to check out.");
            return;
        }

        // verify stock for all items
        for (CartItem item : cart.getItems()) {
            int stock = item.getProduct().getQuantity();
            if (item.getQuantity() > stock) {
                throw new IllegalStateException(
                        "Insufficient stock for " + item.getProduct().getName() +
                                " (requested: " + item.getQuantity() + ", available: " + stock + ")");
            }
        }

        // deduct stock atomic update
        for (CartItem item : cart.getItems()) {
            Product p = item.getProduct();
            p.setQuantity(p.getQuantity() - item.getQuantity());
        }

        // print receipt
        System.out.println("\n=== FINAL RECEIPT ===");
        System.out.println("-----------------------------------------------------------");
        System.out.printf("%-28s %5s %11s %13s%n", "Product Name", "Qty", "Unit Price", "Total");
        System.out.println("-----------------------------------------------------------");

        for (CartItem item : cart.getItems()) {
            System.out.printf("%-28s %5d %11.2f %13.2f%n",
                    item.getProduct().getName(),
                    item.getQuantity(),
                    item.getProduct().getPrice(),
                    item.getLineTotal());
        }

        System.out.println("-----------------------------------------------------------");
        System.out.printf("GRAND TOTAL: %42.2f%n", cart.getTotal());
        System.out.println("Thank you for your purchase!\n");

        // clear cart
        cart.clear();
    }

    public Cart getCart() {
        return cart;
    }
}