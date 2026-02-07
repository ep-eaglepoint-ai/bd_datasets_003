package com.payment.meta;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MetaTest {

    private static final String REPO_PATH = "../repository_after/src/test/java/com/payment";
    private static CompilationUnit paymentServiceTestCu;
    private static CompilationUnit cardValidatorTestCu;
    private static CompilationUnit refundServiceTestCu;
    private static CompilationUnit fraudServiceTestCu;

    @BeforeAll
    static void parseFiles() throws IOException {
        File repoDir = new File(REPO_PATH);
        if (!repoDir.exists()) {
            repoDir = new File(
                    "C:/Users/user/Documents/COMEBACK_2025/Projects/eaglepointai/bd_datasets_003/amjz69-payment-processing-module-unit-test-suite-with-junit-5-and-mockito/repository_after/src/test/java/com/payment");
        }

        assertThat(repoDir).exists().isDirectory();

        paymentServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/PaymentServiceTest.java"));
        cardValidatorTestCu = StaticJavaParser.parse(new File(repoDir, "validation/CardValidatorTest.java"));
        refundServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/RefundServiceTest.java"));
        fraudServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/FraudServiceTest.java"));
    }

    @Test
    void allTestClasses_shouldUseBeforeEachForIsolation() {
        List<CompilationUnit> allCus = List.of(paymentServiceTestCu, cardValidatorTestCu, refundServiceTestCu,
                fraudServiceTestCu);
        for (CompilationUnit cu : allCus) {
            boolean hasBeforeEach = cu.findAll(MethodDeclaration.class).stream()
                    .anyMatch(m -> m.isAnnotationPresent("BeforeEach"));
            assertThat(hasBeforeEach)
                    .as("Test class %s must use @BeforeEach for isolation", cu.getStorage().get().getPath()).isTrue();
        }
    }

    @Test
    void paymentServiceTest_shouldUseArgumentCaptor() {
        boolean usesArgumentCaptor = paymentServiceTestCu.findAll(MethodCallExpr.class).stream()
                .anyMatch(m -> m.getNameAsString().equals("capture") &&
                        m.getScope().isPresent() &&
                        m.getScope().get().toString().contains("ArgumentCaptor"));

        boolean importsArgumentCaptor = paymentServiceTestCu.getImports().stream()
                .anyMatch(i -> i.getNameAsString().equals("org.mockito.ArgumentCaptor"));

        assertThat(importsArgumentCaptor).as("PaymentServiceTest must use ArgumentCaptor").isTrue();
    }

    @Test
    void cardValidatorTest_shouldUseClock() {
        boolean usesClock = cardValidatorTestCu.findAll(ClassOrInterfaceDeclaration.class).stream()
                .flatMap(c -> c.getFields().stream())
                .anyMatch(f -> f.getElementType().asString().equals("Clock"));

        assertThat(usesClock).as("CardValidatorTest must use Clock for deterministic time testing").isTrue();
    }

    @Test
    void Tests_shouldUseAssertThrows() {
        boolean usesAssertThrows = paymentServiceTestCu.findAll(MethodCallExpr.class).stream()
                .anyMatch(m -> m.getNameAsString().equals("assertThatThrownBy")
                        || m.getNameAsString().equals("assertThrows"));

        assertThat(usesAssertThrows).as("Tests must use assertThrows or assertThatThrownBy for exception testing")
                .isTrue();
    }

    @Test
    void tests_shouldUseDocumentedStripeTestCards() {
        List<CompilationUnit> allCus = List.of(paymentServiceTestCu, cardValidatorTestCu);
        String stripeCard1 = "4242424242424242";
        String stripeCard2 = "4000000000000002";

        boolean usesStripeCards = allCus.stream()
                .anyMatch(cu -> cu.toString().contains(stripeCard1) || cu.toString().contains(stripeCard2));
        assertThat(usesStripeCards).as("Tests should use documented Stripe test cards").isTrue();
    }

    @Test
    void Tests_shouldCheckMockInteractionsWithVerify() {
        boolean usesVerify = paymentServiceTestCu.findAll(MethodCallExpr.class).stream()
                .anyMatch(m -> m.getNameAsString().equals("verify"));

        assertThat(usesVerify).as("Tests must verify mock interactions").isTrue();
    }

    @Test
    void refundServiceTest_shouldUseArgumentCaptor() {
        boolean usesCaptor = refundServiceTestCu.getImports().stream()
                .anyMatch(i -> i.getNameAsString().equals("org.mockito.ArgumentCaptor"));

        assertThat(usesCaptor)
                .as("RefundServiceTest must use ArgumentCaptor")
                .isTrue();
    }

}
