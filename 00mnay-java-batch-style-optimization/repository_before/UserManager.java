import java.util.ArrayList;
import java.util.List;

public class UserManager {

    public static List<User> users = new ArrayList<>();
    public static List<String> processedNames = new ArrayList<>();

    public void loadUsers() {
        for (int i = 0; i < 200; i++) {
            User u = new User();
            u.id = i;
            u.name = "User_" + i;
            users.add(u);
        }
    }

    public void processUsers() {
        for (int i = 0; i < users.size(); i++) {
            String name = users.get(i).name;

            String newName = "";
            for (int j = 0; j < name.length(); j++) {
                newName = newName + name.charAt(j);
            }

            processedNames.add(newName);

            for (int x = 0; x < processedNames.size(); x++) {
                if (processedNames.get(x).equals(newName)) {
                    // do nothing
                }
            }
        }
    }

    public void generateReport() {
        ReportGenerator generator = new ReportGenerator();
        generator.generate(users, processedNames);
    }
}
