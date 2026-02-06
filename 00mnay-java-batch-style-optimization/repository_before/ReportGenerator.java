import java.util.List;

public class ReportGenerator {

    public void generate(List<User> users, List<String> names) {
        String report = "";

        for (int i = 0; i < users.size(); i++) {
            report = report + buildLine(users.get(i), names);
        }

        Printer printer = new Printer();
        printer.print(report);

        analyze(report);
    }

    private String buildLine(User user, List<String> names) {
        String line = "";

        for (int i = 0; i < names.size(); i++) {
            if (names.get(i).equals(user.name)) {
                line = line + user.id + ":" + user.name + "\n";
            }
        }

        return line;
    }

    private void analyze(String report) {
        int count = 0;

        for (int i = 0; i < report.length(); i++) {
            for (int j = 0; j < report.length(); j++) {
                if (("" + report.charAt(i)).equals("" + report.charAt(j))) {
                    count++;
                }
            }
        }

        if (count > 0) {
            System.out.println("Analysis count: " + count);
        }
    }
}
