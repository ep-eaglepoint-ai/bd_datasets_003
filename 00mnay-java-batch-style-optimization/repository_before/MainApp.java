public class MainApp {

    public static void main(String[] args) {
        System.out.println("Starting application...");

        UserManager manager = new UserManager();
        manager.loadUsers();
        manager.processUsers();
        manager.generateReport();

        System.out.println("Application finished.");
    }
}
