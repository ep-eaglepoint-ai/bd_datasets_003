import java.util.ArrayList;
import java.util.List;
import java.util.Collections;
import java.util.Comparator;

public class DataProcessor {

    /**
     * Processes user data and returns analytics results.
     * 
     * @param users List of users to analyze
     * @return ProcessingResult containing all analytics
     */
    public ProcessingResult processUserData(List<User> users) {
        ProcessingResult result = new ProcessingResult();

        // Calculate total engagement score
        int totalEngagement = 0;
        for (User user : users) {
            totalEngagement = totalEngagement + calculateEngagement(user);
        }
        result.setTotalEngagement(totalEngagement);

        // Find average engagement
        int avgEngagement = 0;
        int count = 0;
        for (User user : users) {
            avgEngagement = avgEngagement + calculateEngagement(user);
            count = count + 1;
        }
        result.setAverageEngagement(avgEngagement / count);

        // Find users with above average engagement
        List<User> aboveAverage = new ArrayList<>();
        for (User user : users) {
            if (calculateEngagement(user) > result.getAverageEngagement()) {
                aboveAverage.add(user);
            }
        }
        result.setAboveAverageUsers(aboveAverage);

        // Find top 10 users by engagement
        result.setTopUsers(findTopUsers(users, 10));

        // Find duplicate emails
        result.setDuplicateEmails(findDuplicateEmails(users));

        // Group users by country
        result.setUsersByCountry(groupByCountry(users));

        // Find users who share the same interests
        result.setUsersWithSharedInterests(findUsersWithSharedInterests(users));

        return result;
    }

    /**
     * Calculates engagement score for a user.
     */
    private int calculateEngagement(User user) {
        int score = 0;
        for (Activity activity : user.getActivities()) {
            score = score + activity.getPoints();
        }
        return score;
    }

    /**
     * Finds the top N users by engagement.
     */
    private List<User> findTopUsers(List<User> users, int n) {
        List<User> sortedUsers = new ArrayList<>(users);

        // Bubble sort by engagement score
        for (int i = 0; i < sortedUsers.size(); i++) {
            for (int j = 0; j < sortedUsers.size() - 1; j++) {
                if (calculateEngagement(sortedUsers.get(j)) < calculateEngagement(sortedUsers.get(j + 1))) {
                    User temp = sortedUsers.get(j);
                    sortedUsers.set(j, sortedUsers.get(j + 1));
                    sortedUsers.set(j + 1, temp);
                }
            }
        }

        List<User> topUsers = new ArrayList<>();
        for (int i = 0; i < n && i < sortedUsers.size(); i++) {
            topUsers.add(sortedUsers.get(i));
        }
        return topUsers;
    }

    /**
     * Finds duplicate email addresses.
     */
    private List<String> findDuplicateEmails(List<User> users) {
        List<String> duplicates = new ArrayList<>();

        for (int i = 0; i < users.size(); i++) {
            for (int j = i + 1; j < users.size(); j++) {
                if (users.get(i).getEmail().equals(users.get(j).getEmail())) {
                    // Check if already in duplicates list
                    boolean found = false;
                    for (String dup : duplicates) {
                        if (dup.equals(users.get(i).getEmail())) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        duplicates.add(users.get(i).getEmail());
                    }
                }
            }
        }

        return duplicates;
    }

    /**
     * Groups users by their country.
     */
    private List<CountryGroup> groupByCountry(List<User> users) {
        List<CountryGroup> groups = new ArrayList<>();

        for (User user : users) {
            // Find existing group
            CountryGroup existingGroup = null;
            for (CountryGroup group : groups) {
                if (group.getCountry().equals(user.getCountry())) {
                    existingGroup = group;
                    break;
                }
            }

            if (existingGroup != null) {
                existingGroup.addUser(user);
            } else {
                CountryGroup newGroup = new CountryGroup(user.getCountry());
                newGroup.addUser(user);
                groups.add(newGroup);
            }
        }

        return groups;
    }

    /**
     * Finds pairs of users who share at least one interest.
     */
    private List<UserPair> findUsersWithSharedInterests(List<User> users) {
        List<UserPair> pairs = new ArrayList<>();

        for (int i = 0; i < users.size(); i++) {
            for (int j = i + 1; j < users.size(); j++) {
                User user1 = users.get(i);
                User user2 = users.get(j);

                // Check if they share any interests
                for (String interest1 : user1.getInterests()) {
                    for (String interest2 : user2.getInterests()) {
                        if (interest1.equals(interest2)) {
                            pairs.add(new UserPair(user1, user2, interest1));
                            break;
                        }
                    }
                }
            }
        }

        return pairs;
    }
}

class User {
    private String id;
    private String name;
    private String email;
    private String country;
    private List<Activity> activities;
    private List<String> interests;

    public User(String id, String name, String email, String country) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.country = country;
        this.activities = new ArrayList<>();
        this.interests = new ArrayList<>();
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getCountry() {
        return country;
    }

    public List<Activity> getActivities() {
        return activities;
    }

    public List<String> getInterests() {
        return interests;
    }

    public void addActivity(Activity activity) {
        activities.add(activity);
    }

    public void addInterest(String interest) {
        interests.add(interest);
    }
}

class Activity {
    private String type;
    private int points;

    public Activity(String type, int points) {
        this.type = type;
        this.points = points;
    }

    public String getType() {
        return type;
    }

    public int getPoints() {
        return points;
    }
}

class ProcessingResult {
    private int totalEngagement;
    private int averageEngagement;
    private List<User> aboveAverageUsers;
    private List<User> topUsers;
    private List<String> duplicateEmails;
    private List<CountryGroup> usersByCountry;
    private List<UserPair> usersWithSharedInterests;

    public int getTotalEngagement() {
        return totalEngagement;
    }

    public void setTotalEngagement(int value) {
        totalEngagement = value;
    }

    public int getAverageEngagement() {
        return averageEngagement;
    }

    public void setAverageEngagement(int value) {
        averageEngagement = value;
    }

    public List<User> getAboveAverageUsers() {
        return aboveAverageUsers;
    }

    public void setAboveAverageUsers(List<User> value) {
        aboveAverageUsers = value;
    }

    public List<User> getTopUsers() {
        return topUsers;
    }

    public void setTopUsers(List<User> value) {
        topUsers = value;
    }

    public List<String> getDuplicateEmails() {
        return duplicateEmails;
    }

    public void setDuplicateEmails(List<String> value) {
        duplicateEmails = value;
    }

    public List<CountryGroup> getUsersByCountry() {
        return usersByCountry;
    }

    public void setUsersByCountry(List<CountryGroup> value) {
        usersByCountry = value;
    }

    public List<UserPair> getUsersWithSharedInterests() {
        return usersWithSharedInterests;
    }

    public void setUsersWithSharedInterests(List<UserPair> value) {
        usersWithSharedInterests = value;
    }
}

class CountryGroup {
    private String country;
    private List<User> users;

    public CountryGroup(String country) {
        this.country = country;
        this.users = new ArrayList<>();
    }

    public String getCountry() {
        return country;
    }

    public List<User> getUsers() {
        return users;
    }

    public void addUser(User user) {
        users.add(user);
    }
}

class UserPair {
    private User user1;
    private User user2;
    private String sharedInterest;

    public UserPair(User user1, User user2, String sharedInterest) {
        this.user1 = user1;
        this.user2 = user2;
        this.sharedInterest = sharedInterest;
    }

    public User getUser1() {
        return user1;
    }

    public User getUser2() {
        return user2;
    }

    public String getSharedInterest() {
        return sharedInterest;
    }
}
