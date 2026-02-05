package com.system;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.IOException;
import java.util.*;

public class CheckoutSystem {
    private final Map<String, Product> catalog = new HashMap<>();
    private final Cart cart = new Cart();

    public CheckoutSystem(String jsonPath) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            Product[] products = mapper.readValue(new File(jsonPath), Product[].class);
            for (Product p : products) {
                catalog.put(p.getId(), p);
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
        if (product == null) {
            return false;
        }

        int alreadyInCart = 0;
        for (CartItem item : cart.getItems()) {
            if (item.getProduct().getId().equals(productId)) {
                alreadyInCart = item.getQuantity();
                break;
            }
        }

        return product.getQuantity() >= (alreadyInCart + requestedQuantity);
    }

    public void addToCart(String productId, int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be a positive number");
        }

        Product product = getProduct(productId);
        if (product == null) {
            throw new IllegalArgumentException("Product not found with ID: " + productId);
        }

        if (!validateStock(productId, quantity)) {
            throw new IllegalStateException(
                "Insufficient stock for " + product.getName() +
                " (requested: " + quantity + ", available: " + product.getQuantity() + ")"
            );
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
        if (cart.getItems().isEmpty()) {
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

    public void checkout() {
        if (cart.getItems().isEmpty()) {
            System.out.println("Cart is empty. Nothing to check out.");
            return;
        }

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
        System.out.println("Thank you for your purchase!");
        System.out.println();

        cart.clear();
    }

    public Cart getCart() {
        return cart;
    }
}