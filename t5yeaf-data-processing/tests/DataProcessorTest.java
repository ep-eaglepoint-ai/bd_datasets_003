import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Assertions;
import java.util.*;

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
        // u1-u3 (Tech) -- because Tech is first in u1 list
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
        // User with null country, null interests (or empty), null activities (or empty)
        User u1 = new User("1", "NullMan", "null@test.com", null);
        
        User u2 = new User("2", "Normal", "normal@test.com", "US");
        
        List<User> users = Arrays.asList(u1, u2);
        try {
            ProcessingResult result = processor.processUserData(users);
            
            // Should handle null country gracefully (skip grouping or group under null?)
            boolean foundNullGroup = false;
            for(CountryGroup g : result.getUsersByCountry()) {
                if(g.getCountry() == null) foundNullGroup = true;
            }
            Assertions.assertFalse(foundNullGroup); // Should just skip
            
            // Ensure no crash
            Assertions.assertNotNull(result);
        } catch (Exception e) {
            Assertions.fail("Should not throw exception on null fields", e);
        }
    }

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
        
        // Performance Goal: < 1000ms for 50k
        Assertions.assertTrue(duration < 2000, "Should be very fast for O(N), took: " + duration);
    }
}
