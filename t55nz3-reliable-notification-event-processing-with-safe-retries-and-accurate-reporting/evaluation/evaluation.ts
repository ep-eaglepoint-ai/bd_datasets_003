import * as fs from 'fs';
import * as path from 'path';
import { processNotificationEvents, NotificationEvent } from '../repository_after/processNotificationEvents';

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
  // Use ONLY the current directory of this script
  const resultsDir = __dirname; 
  const instancePath = path.join(__dirname, '../instances/instance.json');
  
  if (!fs.existsSync(instancePath)) {
    console.error(`❌ Error: Instance file not found`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(instancePath, 'utf8');
    const sanitizedData = rawData.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    const parsedData = JSON.parse(sanitizedData);

    // Dynamic event extraction
    let testEvents: NotificationEvent[] = [];
    const source = parsedData.FAIL_TO_PASS || parsedData.PASS_TO_PASS || parsedData.events || parsedData;
    testEvents = Array.isArray(source) ? source : [source];

    console.log(`🚀 Processing ${testEvents.length} events...`);

    const { states, report } = processNotificationEvents(testEvents);

    const summary: EvaluationSummary = {
      instanceId: parsedData.instance_id || "instance_001",
      timestamp: new Date().toISOString(),
      success: true,
      metrics: {
        totalEvents: report.totalInputEvents,
        applied: report.applied,
        duplicates: report.duplicates,
        rejected: Object.values(report.rejected).reduce((a, b) => a + b, 0),
      },
      details: { rejectionReasons: report.rejected }
    };

    // Define the EXACT path and save
    const reportPath = path.join(resultsDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    console.log(`✅ Success! Report is at: ${reportPath}`);
    console.table(summary.metrics);

  } catch (error: any) {
    console.error('❌ Evaluation failed:', error.message);
    process.exit(1);
  }
}

runEvaluation();