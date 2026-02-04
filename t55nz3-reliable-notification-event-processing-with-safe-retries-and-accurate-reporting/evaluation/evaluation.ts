import * as fs from 'fs';
import * as path from 'path';
import { processNotificationEvents, NotificationEvent } from '../repository_after/processNotificationEvents';

/**
 * Interface for the evaluation result output
 */
interface EvaluationSummary {
  instanceId: string;
  timestamp: string;
  success: boolean;
  metrics: {
    totalEvents: number;
    applied: number;
    duplicates: number;
    rejected: number;
  };
  details: any;
}

async function runEvaluation() {
  const instancesDir = path.join(__dirname, '../instances');
  const resultsDir = path.join(__dirname, '../evaluation_results');

  // Create results directory if it doesn't exist
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
  }

  // Read instances (assuming instance.json exists based on your screenshot)
  const instancePath = path.join(instancesDir, 'instance.json');
  
  if (!fs.existsSync(instancePath)) {
    console.error(`Error: Instance file not found at ${instancePath}`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(instancePath, 'utf8');
    const testEvents: NotificationEvent[] = JSON.parse(rawData);

    console.log(`🚀 Starting evaluation for ${testEvents.length} events...`);

    // Execute the processing logic
    const { states, report } = processNotificationEvents(testEvents);

    // Prepare the evaluation summary
    const summary: EvaluationSummary = {
      instanceId: "instance_001",
      timestamp: new Date().toISOString(),
      success: report.rejected["invalid_event_type"] === undefined,
      metrics: {
        totalEvents: report.totalInputEvents,
        applied: report.applied,
        duplicates: report.duplicates,
        rejected: Object.values(report.rejected).reduce((a, b) => a + b, 0),
      },
      details: {
        finalStatesCount: Object.keys(states).length,
        rejectionReasons: report.rejected
      }
    };

    // Save report to JSON
    const reportPath = path.join(resultsDir, 'evaluation_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    console.log(`✅ Evaluation complete. Report saved to: ${reportPath}`);
    console.table(summary.metrics);

  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

// Execute evaluation
runEvaluation();