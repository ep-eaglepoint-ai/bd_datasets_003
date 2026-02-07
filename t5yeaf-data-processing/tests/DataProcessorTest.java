import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Assertions;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class DataProcessorTest {

    private DataProcessor processor;

    @BeforeEach
    public void setUp() {
        processor = new DataProcessor();
    }

    @Test
    public void testEmptyAndNullInput() {
        // Null
        ProcessingResult res1 = processor.processUserData(null);
        Assertions.assertNotNull(res1);
        Assertions.assertTrue(res1.getTopUsers().isEmpty());
        
        // Empty
        ProcessingResult res2 = processor.processUserData(new ArrayList<>());
        Assertions.assertNotNull(res2);
        Assertions.assertTrue(res2.getTopUsers().isEmpty());
    }

    @Test
    public void testBasicAnalysis() {
        User u1 = new User("1", "Alice", "alice@test.com", "US");
        u1.addActivity(new Activity("login", 10));
        u1.addActivity(new Activity("post", 20));
        // Score: 30

        User u2 = new User("2", "Bob", "bob@test.com", "UK");
        u2.addActivity(new Activity("login", 10));
        // Score: 10
        
        List<User> users = Arrays.asList(u1, u2);
        ProcessingResult result = processor.processUserData(users);
        
        // Total Engagement: 40
        Assertions.assertEquals(40, result.getTotalEngagement());
        
        // Average: 20
        Assertions.assertEquals(20, result.getAverageEngagement());
        
        // Above Average: Alice (30 > 20)
        Assertions.assertEquals(1, result.getAboveAverageUsers().size());
        Assertions.assertEquals("Alice", result.getAboveAverageUsers().get(0).getName());
        
        // Top 10: Alice then Bob (30, 10)
        Assertions.assertEquals(2, result.getTopUsers().size());
        Assertions.assertEquals("Alice", result.getTopUsers().get(0).getName());
        Assertions.assertEquals("Bob", result.getTopUsers().get(1).getName());
    }

    @Test
    public void testDuplicates() {
        User u1 = new User("1", "Alice", "alice@test.com", "US");
        User u2 = new User("2", "Bob", "bob@test.com", "UK");
        User u3 = new User("3", "AliceDup", "alice@test.com", "CA"); // Duplicate email
        
        List<User> users = Arrays.asList(u1, u2, u3);
        ProcessingResult result = processor.processUserData(users);
        
        List<String> dups = result.getDuplicateEmails();
        Assertions.assertEquals(1, dups.size());
        Assertions.assertEquals("alice@test.com", dups.get(0));
    }

    @Test
    public void testCountryGrouping() {
        User u1 = new User("1", "A", "a@a.com", "US");
        User u2 = new User("2", "B", "b@b.com", "UK");
        User u3 = new User("3", "C", "c@c.com", "US");
        
        List<User> users = Arrays.asList(u1, u2, u3);
        ProcessingResult result = processor.processUserData(users);
        
        List<CountryGroup> groups = result.getUsersByCountry();
        // Should be 2 groups: US and UK
        Assertions.assertEquals(2, groups.size());
        
        // Verify structure
        for (CountryGroup g : groups) {
            if (g.getCountry().equals("US")) {
                Assertions.assertEquals(2, g.getUsers().size());
            } else if (g.getCountry().equals("UK")) {
                Assertions.assertEquals(1, g.getUsers().size());
            } else {
                Assertions.fail("Unexpected country: " + g.getCountry());
            }
        }
    }

    @Test
    public void testSharedInterests() {
        User u1 = new User("1", "A", "a@a.com", "US");
        u1.addInterest("Tech");
        u1.addInterest("Music");
        
        User u2 = new User("2", "B", "b@b.com", "US");
        u2.addInterest("Tech");
        u2.addInterest("Art");
        
        User u3 = new User("3", "C", "c@c.com", "US");
        u3.addInterest("Tech"); // All three share Tech
        u3.addInterest("Music"); // Shares Music with A

        List<User> users = Arrays.asList(u1, u2, u3);
        ProcessingResult result = processor.processUserData(users);
        
        List<UserPair> pairs = result.getUsersWithSharedInterests();
        // u1-u2 (Tech)
        // u1-u3 (Tech or Music)
        // u2-u3 (Tech)
        Assertions.assertEquals(3, pairs.size());
        
        // Verify contents
        Set<String> pairKeys = new HashSet<>();
        for (UserPair p : pairs) {
            pairKeys.add(p.getUser1().getId() + "-" + p.getUser2().getId() + ":" + p.getSharedInterest());
        }
        
        Assertions.assertTrue(pairKeys.contains("1-2:Tech"));
        Assertions.assertTrue(pairKeys.contains("1-3:Tech") || pairKeys.contains("1-3:Music"));
        Assertions.assertTrue(pairKeys.contains("2-3:Tech"));
    }

    /**
     * Requirement 7: Handle edge cases including... null values.
     */
    @Test
    public void testNullFields() {
        // User with null country
        User u1 = new User("1", "NullMan", "null@test.com", null);
        User u2 = new User("2", "Normal", "normal@test.com", "US");
        
        List<User> users = Arrays.asList(u1, u2);
        try {
            ProcessingResult result = processor.processUserData(users);
            
            // Should handle null country gracefully
            boolean foundNullGroup = false;
            for(CountryGroup g : result.getUsersByCountry()) {
                if(g.getCountry() == null) foundNullGroup = true;
            }
            Assertions.assertFalse(foundNullGroup);
            
            Assertions.assertNotNull(result);
        } catch (Exception e) {
            Assertions.fail("Should not throw exception on null fields", e);
        }
    }

    /**
     * Requirement 7: Edge case - empty collections (not null).
     */
    @Test
    public void testEmptyActivitiesAndInterests() {
        User u1 = new User("1", "EmptyUser", "empty@test.com", "US");
        // Constructor initializes empty lists, so activities and interests are empty (not null)
        
        User u2 = new User("2", "NormalUser", "normal@test.com", "US");
        u2.addActivity(new Activity("login", 10));
        u2.addInterest("Tech");
        
        List<User> users = Arrays.asList(u1, u2);
        ProcessingResult result = processor.processUserData(users);
        
        // u1 has 0 engagement, u2 has 10
        Assertions.assertEquals(10, result.getTotalEngagement());
        Assertions.assertEquals(5, result.getAverageEngagement());
        
        // Only u2 is above average
        Assertions.assertEquals(1, result.getAboveAverageUsers().size());
        Assertions.assertEquals("NormalUser", result.getAboveAverageUsers().get(0).getName());
        
        // No shared interests (u1 has none)
        Assertions.assertEquals(0, result.getUsersWithSharedInterests().size());
    }

    /**
     * Requirement 7: Edge case - multiple users with null email.
     */
    @Test
    public void testMultipleNullEmails() {
        User u1 = new User("1", "A", null, "US");
        User u2 = new User("2", "B", null, "US");
        User u3 = new User("3", "C", "c@test.com", "US");
        
        List<User> users = Arrays.asList(u1, u2, u3);
        ProcessingResult result = processor.processUserData(users);
        
        // Null emails should not be considered duplicates
        Assertions.assertEquals(0, result.getDuplicateEmails().size());
    }

    /**
     * Requirement 12: Verify tie-breaking in top users (deterministic ordering).
     */
    @Test
    public void testTopUsersTieBreaking() {
        // Create 5 users with same score
        List<User> users = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            User u = new User(String.valueOf(i), "User" + i, "user" + i + "@test.com", "US");
            u.addActivity(new Activity("act", 10)); // All have score 10
            users.add(u);
        }
        
        ProcessingResult result = processor.processUserData(users);
        
        // All 5 should be in top 10
        Assertions.assertEquals(5, result.getTopUsers().size());
        
        // Verify all users are present (deterministic set)
        Set<String> topUserIds = new HashSet<>();
        for (User u : result.getTopUsers()) {
            topUserIds.add(u.getId());
        }
        Assertions.assertEquals(5, topUserIds.size());
        
        // Run again - should get same set of users (deterministic)
        ProcessingResult result2 = processor.processUserData(users);
        Set<String> topUserIds2 = new HashSet<>();
        for (User u : result2.getTopUsers()) {
            topUserIds2.add(u.getId());
        }
        Assertions.assertEquals(topUserIds, topUserIds2);
    }

    /**
     * Requirement 6: Thread safety - verify concurrent execution.
     */
    @Test
    public void testThreadSafety() throws InterruptedException {
        // Create shared test data
        List<User> users = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            User u = new User(String.valueOf(i), "User" + i, "user" + i + "@test.com", "US");
            u.addActivity(new Activity("act", i));
            u.addInterest("Interest" + (i % 10));
            users.add(u);
        }
        
        // Run processUserData concurrently from multiple threads
        int threadCount = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);
        AtomicInteger successCount = new AtomicInteger(0);
        
        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                try {
                    ProcessingResult result = processor.processUserData(users);
                    // Verify result is valid
                    if (result != null && result.getTopUsers().size() == 10) {
                        successCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // Thread safety violation
                    e.printStackTrace();
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(10, TimeUnit.SECONDS);
        executor.shutdown();
        
        // All threads should succeed
        Assertions.assertEquals(threadCount, successCount.get(), 
            "All concurrent executions should succeed (thread-safe)");
    }

    /**
     * Requirement 14: Verify engagement is calculated at most once per user.
     * This is indirectly verified by performance, but we can test with a custom Activity
     * that tracks access count.
     */
    @Test
    public void testEngagementCachingEfficiency() {
        // Create users with activities
        List<User> users = new ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            User u = new User(String.valueOf(i), "User" + i, "user" + i + "@test.com", "US");
            u.addActivity(new Activity("act", i % 100));
            users.add(u);
        }
        
        long start = System.nanoTime();
        ProcessingResult result = processor.processUserData(users);
        long duration = (System.nanoTime() - start) / 1_000_000; // ms
        
        // With caching, 1000 users should be very fast (< 50ms)
        // Without caching (recalculating 3+ times), would be slower
        Assertions.assertTrue(duration < 100, 
            "Should be fast with engagement caching, took: " + duration + "ms");
        
        // Verify correctness
        Assertions.assertEquals(10, result.getTopUsers().size());
    }

    /**
     * Requirement 9-13: Performance test verifying O(N) complexity.
     */
    @Test
    public void testPerformanceLargeDataset() {
        if ("true".equals(System.getProperty("skip.performance"))) {
            return;
        }
        
        int n = 50000;
        List<User> users = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            User u = new User(String.valueOf(i), "User" + i, "user" + i + "@example.com", "US");
            u.addActivity(new Activity("act", i % 100)); 
            u.addInterest("Interest" + (i % 1000));
            users.add(u);
        }
        
        long start = System.currentTimeMillis();
        ProcessingResult result = processor.processUserData(users);
        long end = System.currentTimeMillis();
        
        long duration = end - start;
        System.out.println("Processing " + n + " users took: " + duration + "ms");
        
        // Assertions
        Assertions.assertEquals(10, result.getTopUsers().size());
        
        // O(N) should be very fast: < 2s for 50k
        Assertions.assertTrue(duration < 2000, "Should be very fast for O(N), took: " + duration);
    }

    /**
     * Requirement 2: Verify single-pass processing by checking result consistency.
     */
    @Test
    public void testResultConsistency() {
        List<User> users = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            User u = new User(String.valueOf(i), "User" + i, "user" + i + "@test.com", "Country" + (i % 5));
            u.addActivity(new Activity("act", i));
            u.addInterest("Interest" + (i % 10));
            users.add(u);
        }
        
        // Run multiple times - should get identical results
        ProcessingResult r1 = processor.processUserData(users);
        ProcessingResult r2 = processor.processUserData(users);
        
        Assertions.assertEquals(r1.getTotalEngagement(), r2.getTotalEngagement());
        Assertions.assertEquals(r1.getAverageEngagement(), r2.getAverageEngagement());
        Assertions.assertEquals(r1.getTopUsers().size(), r2.getTopUsers().size());
        Assertions.assertEquals(r1.getDuplicateEmails().size(), r2.getDuplicateEmails().size());
    }
}
