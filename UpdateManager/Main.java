public class Main {
    public static void main(String[] args) throws Exception {
        String[] userNames = new String[] { "Anga205", "munish42" };
        // Initialize API and ReadingsFile
        LeetCodeApi api = new LeetCodeApi("https://leetcode-api-faisalshohag.anga.codes");
        ReadingsFile readingsFile = new ReadingsFile("ProgressViewer/public/readings.json");

        java.util.Map<String, java.util.List<Reading>> allReadings = readingsFile.load();
        // Ensure all users have an entry
        allReadings = readingsFile.ensureKeys(allReadings, userNames);

        for (String name : userNames) {
            boolean finishedUser = false;
            while (!finishedUser) {
                try {
                    String json = api.getUserJson(name); // throws if HTTP != 200
                    Integer solved = api.parseTotalSolved(json);
                    // if unparsable, solved == null, retry
                    if (solved == null) {
                        System.out.println("Unparsable response for " + name + ", retrying in 30s...");
                        Thread.sleep(30000);
                        continue;
                    }

                    String key = name.toLowerCase();
                    java.util.List<Reading> userReadings = allReadings.get(key);
                    boolean shouldAppend = false;
                    // Decide whether to append new reading
                    if (userReadings == null || userReadings.isEmpty()) {
                        shouldAppend = true;
                    } else {
                        Reading last = userReadings.get(userReadings.size() - 1);
                        shouldAppend = solved > last.solvedCount;
                    }
                    // Append new reading if needed
                    if (shouldAppend) {
                        if (userReadings == null) {
                            userReadings = new java.util.ArrayList<>();
                            allReadings.put(key, userReadings);
                        }
                        double nowTs = TimeUtils.nowUtcSeconds();
                        userReadings.add(new Reading(solved, nowTs));
                    }
                    finishedUser = true; // valid response received (append or not)
                } catch (Exception ex) {
                    // Catch all exceptions to retry
                    System.out.println("Error for " + name + ": " + ex.getMessage() + ". Retrying in 30s...");
                    try { Thread.sleep(30000); } catch (InterruptedException ie) { /* ignore */ }
                }
            }
        }

        readingsFile.save(allReadings);
    }
}
