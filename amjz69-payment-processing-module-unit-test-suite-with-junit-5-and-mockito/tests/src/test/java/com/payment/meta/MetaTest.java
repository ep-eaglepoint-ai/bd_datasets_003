package com.payment.meta;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class MetaTest {

        private static final String REPO_PATH = "../repository_after/src/test/java/com/payment";
        private static CompilationUnit paymentServiceTestCu;
        private static CompilationUnit cardValidatorTestCu;
        private static CompilationUnit refundServiceTestCu;
        private static CompilationUnit fraudServiceTestCu;
        private static CompilationUnit cardTestCu;
        private static CompilationUnit transactionTestCu;
        private static CompilationUnit stripeGatewayTestCu;

        @BeforeAll
        static void parseFiles() throws IOException {
                File repoDir = new File(REPO_PATH);
                assertThat(repoDir).as("Repository test path not found: " + repoDir.getAbsolutePath()).exists()
                                .isDirectory();

                paymentServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/PaymentServiceTest.java"));
                cardValidatorTestCu = StaticJavaParser.parse(new File(repoDir, "validation/CardValidatorTest.java"));
                refundServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/RefundServiceTest.java"));
                fraudServiceTestCu = StaticJavaParser.parse(new File(repoDir, "service/FraudServiceTest.java"));
                cardTestCu = StaticJavaParser.parse(new File(repoDir, "model/CardTest.java"));
                transactionTestCu = StaticJavaParser.parse(new File(repoDir, "model/TransactionTest.java"));
                stripeGatewayTestCu = StaticJavaParser.parse(new File(repoDir, "gateway/StripeGatewayTest.java"));
        }

        @Test
        void allTestClasses_shouldUseBeforeEachForIsolation() {
                for (CompilationUnit cu : cuList()) {
                        boolean hasBeforeEach = cu.findAll(MethodDeclaration.class).stream()
                                        .anyMatch(m -> m.isAnnotationPresent("BeforeEach"));
                        assertThat(hasBeforeEach)
                                        .as("Test class %s must use @BeforeEach for isolation",
                                                        cu.getStorage().get().getPath())
                                        .isTrue();
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
                boolean usesAssertThrows = cuList().stream().anyMatch(cu -> cu.findAll(MethodCallExpr.class).stream()
                                .anyMatch(m -> m.getNameAsString().equals("assertThatThrownBy")
                                                || m.getNameAsString().equals("assertThrows")));

                assertThat(usesAssertThrows)
                                .as("Tests must use assertThrows or assertThatThrownBy for exception testing")
                                .isTrue();
        }

        @Test
        void tests_shouldUseDocumentedStripeTestCards() {
                List<CompilationUnit> allCus = List.of(paymentServiceTestCu, cardValidatorTestCu);
                String stripeCard1 = "4242424242424242";
                String stripeCard2 = "4000000000000002";

                boolean usesStripeCards = allCus.stream()
                                .anyMatch(cu -> cu.toString().contains(stripeCard1)
                                                || cu.toString().contains(stripeCard2));
                assertThat(usesStripeCards).as("Tests should use documented Stripe test cards").isTrue();
        }

        @Test
        void testFixtures_shouldUseValidLuhnNumbers() {
                Pattern cardPattern = Pattern.compile("\\d{13,19}");
                for (CompilationUnit cu : cuList()) {
                        cu.findAll(StringLiteralExpr.class).stream()
                                        .map(StringLiteralExpr::getValue)
                                        .filter(s -> cardPattern.matcher(s).matches())
                                        .filter(s -> s.length() >= 13)
                                        .forEach(number -> {
                                                assertThat(isValidLuhn(number))
                                                                .as("Card number %s in %s is invalid according to Luhn algorithm",
                                                                                number,
                                                                                cu.getStorage().get().getFileName())
                                                                .isTrue();
                                        });
                }
        }

        @Test
        void testFixtures_shouldUseNonExpiredDates() {
                boolean usesDynamicDates = cardValidatorTestCu.findAll(MethodCallExpr.class).stream()
                                .anyMatch(m -> m.getNameAsString().equals("plusMonths")
                                                || m.getNameAsString().equals("plusYears"));

                assertThat(usesDynamicDates).as("Tests should use dynamic future dates or Clock injection").isTrue();
        }

        private List<CompilationUnit> cuList() {
                return List.of(paymentServiceTestCu, cardValidatorTestCu, refundServiceTestCu, fraudServiceTestCu,
                                cardTestCu, transactionTestCu, stripeGatewayTestCu);
        }

        private boolean isValidLuhn(String number) {
                int sum = 0;
                boolean alternate = false;
                for (int i = number.length() - 1; i >= 0; i--) {
                        int n = Integer.parseInt(number.substring(i, i + 1));
                        if (alternate) {
                                n *= 2;
                                if (n > 9)
                                        n -= 9;
                        }
                        sum += n;
                        alternate = !alternate;
                }
                return (sum % 10 == 0);
        }
}
