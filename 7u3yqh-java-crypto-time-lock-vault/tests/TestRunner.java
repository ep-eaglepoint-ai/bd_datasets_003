import java.lang.reflect.Method;

public class TestRunner {
    public static void main(String[] args) {
        TimeLockVaultTest test = new TimeLockVaultTest();
        int passed = 0;
        int failed = 0;
        
        Method[] methods = TimeLockVaultTest.class.getDeclaredMethods();
        for (Method method : methods) {
            if (method.getName().startsWith("test")) {
                System.out.println("Running test: " + method.getName());
                try {
                    method.invoke(test);
                    System.out.println("PASSED: " + method.getName());
                    passed++;
                } catch (Exception e) {
                    System.out.println("FAILED: " + method.getName());
                    e.printStackTrace();
                    failed++;
                }
            }
        }
        
        System.out.println("\nSummary: " + passed + " passed, " + failed + " failed.");
        if (failed == 0) {
            System.out.println("ALL TESTS PASSED");
        } else {
            System.exit(1);
        }
    }
}
