import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LogAnalyzer {

    public AnalysisResult analyzeLogFile(String filePath) throws IOException {
        AnalysisResult result = new AnalysisResult();

        File file = new File(filePath);
        FileReader reader = new FileReader(file);
        String content = "";
        int ch;
        while ((ch = reader.read()) != -1) {
            content = content + (char) ch;
        }
        reader.close();

        String[] lines = content.split("\n");
        result.setTotalLines(lines.length);

        List<String> errorCodes = new ArrayList<>();
        List<String> timestamps = new ArrayList<>();
        List<String> errorMessages = new ArrayList<>();

        for (String line : lines) {
            Pattern timestampPattern = Pattern.compile("\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\]");
            Matcher timestampMatcher = timestampPattern.matcher(line);
            if (timestampMatcher.find()) {
                timestamps.add(timestampMatcher.group(1));
            }

            Pattern errorPattern = Pattern.compile("ERROR-(\\d{4})");
            Matcher errorMatcher = errorPattern.matcher(line);
            if (errorMatcher.find()) {
                errorCodes.add(errorMatcher.group(1));
            }

            if (line.contains("ERROR") || line.contains("FATAL")) {
                errorMessages.add(line);
            }
        }

        result.setErrorCount(errorMessages.size());
        result.setErrorMessages(errorMessages);

        List<ErrorCodeCount> errorCodeCounts = new ArrayList<>();
        for (String code : errorCodes) {
            boolean found = false;
            for (ErrorCodeCount ecc : errorCodeCounts) {
                if (ecc.getCode().equals(code)) {
                    ecc.incrementCount();
                    found = true;
                    break;
                }
            }
            if (!found) {
                errorCodeCounts.add(new ErrorCodeCount(code, 1));
            }
        }
        result.setErrorCodeCounts(errorCodeCounts);

        List<String> uniqueTimestamps = new ArrayList<>();
        for (String ts : timestamps) {
            boolean exists = false;
            for (String uts : uniqueTimestamps) {
                if (uts.equals(ts)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                uniqueTimestamps.add(ts);
            }
        }
        result.setUniqueTimestamps(uniqueTimestamps.size());

        String mostCommon = "";
        int maxCount = 0;
        for (ErrorCodeCount ecc : errorCodeCounts) {
            if (ecc.getCount() > maxCount) {
                maxCount = ecc.getCount();
                mostCommon = ecc.getCode();
            }
        }
        result.setMostCommonErrorCode(mostCommon);
        result.setMostCommonErrorCount(maxCount);

        List<String> hours = new ArrayList<>();
        for (String ts : timestamps) {
            String hour = ts.substring(0, 13);
            boolean exists = false;
            for (String h : hours) {
                if (h.equals(hour)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                hours.add(hour);
            }
        }
        if (hours.size() > 0) {
            result.setAverageErrorsPerHour(errorMessages.size() / hours.size());
        }

        return result;
    }
}

class AnalysisResult {
    private int totalLines;
    private int errorCount;
    private List<String> errorMessages;
    private List<ErrorCodeCount> errorCodeCounts;
    private int uniqueTimestamps;
    private String mostCommonErrorCode;
    private int mostCommonErrorCount;
    private int averageErrorsPerHour;

    public int getTotalLines() {
        return totalLines;
    }

    public void setTotalLines(int value) {
        totalLines = value;
    }

    public int getErrorCount() {
        return errorCount;
    }

    public void setErrorCount(int value) {
        errorCount = value;
    }

    public List<String> getErrorMessages() {
        return errorMessages;
    }

    public void setErrorMessages(List<String> value) {
        errorMessages = value;
    }

    public List<ErrorCodeCount> getErrorCodeCounts() {
        return errorCodeCounts;
    }

    public void setErrorCodeCounts(List<ErrorCodeCount> value) {
        errorCodeCounts = value;
    }

    public int getUniqueTimestamps() {
        return uniqueTimestamps;
    }

    public void setUniqueTimestamps(int value) {
        uniqueTimestamps = value;
    }

    public String getMostCommonErrorCode() {
        return mostCommonErrorCode;
    }

    public void setMostCommonErrorCode(String value) {
        mostCommonErrorCode = value;
    }

    public int getMostCommonErrorCount() {
        return mostCommonErrorCount;
    }

    public void setMostCommonErrorCount(int value) {
        mostCommonErrorCount = value;
    }

    public int getAverageErrorsPerHour() {
        return averageErrorsPerHour;
    }

    public void setAverageErrorsPerHour(int value) {
        averageErrorsPerHour = value;
    }
}

class ErrorCodeCount {
    private String code;
    private int count;

    public ErrorCodeCount(String code, int count) {
        this.code = code;
        this.count = count;
    }

    public String getCode() {
        return code;
    }

    public int getCount() {
        return count;
    }

    public void incrementCount() {
        count++;
    }
}
