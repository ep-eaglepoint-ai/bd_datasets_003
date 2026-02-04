const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function generateEvaluationId() {
  return Math.random().toString(36).substring(2, 13);
}

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

function parseTestResults(resultsPath) {
  if (!fs.existsSync(resultsPath)) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      success: false,
      output: '',
      error: `Results file not found: ${resultsPath}`,
      testResults: []
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    
    return {
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      total: data.numTotalTests || 0,
      success: data.success || false,
      output: JSON.stringify(data, null, 2),
      testResults: data.testResults || []
    };
  } catch (error) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      success: false,
      output: '',
      error: error.message,
      testResults: []
    };
  }
}

function extractAllTests(testResults) {
  const allTests = [];
  
  testResults.forEach(suite => {
    const suiteName = path.basename(suite.name || 'Unknown');
    const assertions = suite.assertionResults || [];
    
    assertions.forEach(assertion => {
      allTests.push({
        suite: suiteName,
        title: assertion.title || 'Unknown test',
        fullName: assertion.fullName || '',
        status: assertion.status || 'unknown',
        duration: assertion.duration || 0,
        ancestorTitles: assertion.ancestorTitles || [],
        failureMessages: assertion.failureMessages || []
      });
    });
  });
  
  return allTests;
}

function mapTestToRequirement(test) {
  const title = (test.title || '').toLowerCase();
  const fullName = (test.fullName || '').toLowerCase();
  const combined = `${title} ${fullName}`;
  
  const requirementMappings = [
    { 
      id: 1, 
      name: "Click triggers API call and loading state",
      patterns: [/get random dog.*api|trigger.*api|api.*call.*loading/i]
    },
    { 
      id: 2, 
      name: "Successful fetch displays image and clears loading",
      patterns: [/successful.*fetch.*display|display.*image.*clear/i]
    },
    { 
      id: 3, 
      name: "Image src set to fetched URL",
      patterns: [/image.*src.*url|src.*set.*fetch/i]
    },
    { 
      id: 4, 
      name: "Fetch error displays message and retry button",
      patterns: [/error.*display.*message|error.*retry|fetch.*error/i]
    },
    { 
      id: 5, 
      name: "Retry button triggers new fetch",
      patterns: [/retry.*trigger|retry.*fetch|retry.*button/i]
    },
    { 
      id: 6, 
      name: "Loading indicator shows/hides",
      patterns: [/loading.*show|loading.*hide|loading.*spinner|loading.*indicator/i]
    },
    { 
      id: 7, 
      name: "Multiple rapid clicks handled",
      patterns: [/multiple.*click|rapid.*click|simultaneous.*request/i]
    },
    { 
      id: 8, 
      name: "Breed selection fetches that breed",
      patterns: [/breed.*fetch|select.*breed.*fetch|breed.*image/i]
    },
    { 
      id: 9, 
      name: "All Breeds uses general endpoint",
      patterns: [/all breeds.*general|all breeds.*endpoint|general.*endpoint/i]
    },
    { 
      id: 10, 
      name: "Breed dropdown populated on mount",
      patterns: [/dropdown.*populate|breed.*dropdown|populate.*api/i]
    },
    { 
      id: 11, 
      name: "Heart icon adds to favorites",
      patterns: [/heart.*add.*favorite|heart.*icon.*favorite|click.*heart/i]
    },
    { 
      id: 12, 
      name: "Duplicate favorites prevented",
      patterns: [/duplicate.*prevent|duplicate.*favorite|same.*url.*not.*added/i]
    },
    { 
      id: 13, 
      name: "Favorites persist to localStorage",
      patterns: [/favorite.*persist|favorite.*localstorage|localstorage.*favorite/i]
    },
    { 
      id: 14, 
      name: "History capped at 10 items",
      patterns: [/history.*cap|history.*10|oldest.*removed|viewed.*image/i]
    },
    { 
      id: 15, 
      name: "Component cleanup on unmount",
      patterns: [/cleanup.*unmount|unmount.*cleanup|cancel.*pending|cleanup.*request/i]
    }
  ];
  
  for (const req of requirementMappings) {
    for (const pattern of req.patterns) {
      if (pattern.test(combined)) {
        return req;
      }
    }
  }
  
  return null;
}

function buildRequirementsReport(allTests) {
  const requirements = {};
  
  // Initialize all 15 requirements
  for (let i = 1; i <= 15; i++) {
    requirements[i] = {
      id: i,
      name: getRequirementName(i),
      tests: [],
      covered: false,
      passed: false
    };
  }
  
  // Map tests to requirements
  allTests.forEach(test => {
    const req = mapTestToRequirement(test);
    if (req) {
      requirements[req.id].tests.push({
        title: test.title,
        suite: test.suite,
        status: test.status
      });
      requirements[req.id].covered = true;
      if (test.status === 'passed') {
        requirements[req.id].passed = true;
      }
    }
  });
  
  return requirements;
}

function getRequirementName(id) {
  const names = {
    1: "Click 'Get Random Dog' triggers API call and displays loading state",
    2: "Successful fetch displays image and clears loading state",
    3: "Image src is set to the fetched URL",
    4: "Fetch error displays error message and retry button",
    5: "Retry button triggers new fetch attempt",
    6: "Loading indicator shows during fetch and hides after completion",
    7: "Multiple rapid clicks don't trigger multiple simultaneous requests",
    8: "Selecting a breed fetches random image of that breed only",
    9: "'All Breeds' option fetches from general random endpoint",
    10: "Breed dropdown populates from API on mount",
    11: "Clicking heart icon adds current image to favorites",
    12: "Duplicate favorites are prevented (same URL not added twice)",
    13: "Favorites persist to and load from localStorage",
    14: "History is capped at 10 items (oldest removed when exceeding)",
    15: "Component cleanup cancels pending requests on unmount"
  };
  return names[id] || `Requirement ${id}`;
}

function generateEvaluation() {
  const now = new Date();
  const gitInfo = getGitInfo();
  const evaluationId = generateEvaluationId();
  
  // Read test results
  const beforeResults = parseTestResults('/tmp/test-results/before-results.json');
  const afterResults = parseTestResults('/tmp/test-results/after-results.json');
  
  // Extract all individual tests
  const componentTests = extractAllTests(beforeResults.testResults || []);
  const metaTests = extractAllTests(afterResults.testResults || []);
  
  // Build requirements coverage from component tests
  const requirementsReport = buildRequirementsReport(componentTests);
  
  // Count requirements coverage
  const coveredCount = Object.values(requirementsReport).filter(r => r.covered).length;
  const passedCount = Object.values(requirementsReport).filter(r => r.passed).length;
  
  // Group component tests by suite
  const testsBySuite = {};
  componentTests.forEach(test => {
    if (!testsBySuite[test.suite]) {
      testsBySuite[test.suite] = [];
    }
    testsBySuite[test.suite].push(test);
  });
  
  const report = {
    evaluation_metadata: {
      evaluation_id: evaluationId,
      timestamp: now.toISOString(),
      evaluator: "automated_test_suite",
      project: "react_random_dog_picture_generator_test_suite",
      version: "1.0.0"
    },
    environment: {
      node_version: process.version,
      platform: process.platform,
      os: os.type(),
      os_release: os.release(),
      architecture: os.arch(),
      hostname: os.hostname(),
      git_commit: gitInfo.commit,
      git_branch: gitInfo.branch
    },
    test_execution: {
      component_tests: {
        total: beforeResults.total,
        passed: beforeResults.passed,
        failed: beforeResults.failed,
        success: beforeResults.success,
        suites: Object.keys(testsBySuite).map(suite => ({
          name: suite,
          tests: testsBySuite[suite].map(t => ({
            title: t.title,
            status: t.status,
            duration: t.duration,
            requirement_id: mapTestToRequirement(t)?.id || null
          }))
        }))
      },
      meta_tests: {
        total: afterResults.total,
        passed: afterResults.passed,
        failed: afterResults.failed,
        success: afterResults.success,
        tests: metaTests.map(t => ({
          title: t.title,
          status: t.status,
          duration: t.duration
        }))
      },
      summary: {
        component_tests_total: beforeResults.total,
        component_tests_passed: beforeResults.passed,
        component_tests_failed: beforeResults.failed,
        meta_tests_total: afterResults.total,
        meta_tests_passed: afterResults.passed,
        meta_tests_failed: afterResults.failed,
        combined_total: beforeResults.total + afterResults.total,
        combined_passed: beforeResults.passed + afterResults.passed,
        combined_failed: beforeResults.failed + afterResults.failed
      }
    },
    requirements_coverage: {
      total_requirements: 15,
      covered: coveredCount,
      passed: passedCount,
      details: Object.values(requirementsReport).map(req => ({
        id: req.id,
        name: req.name,
        covered: req.covered,
        passed: req.passed,
        tests: req.tests
      }))
    },
    all_component_tests: componentTests.map(t => ({
      suite: t.suite,
      title: t.title,
      status: t.status,
      duration: t.duration,
      mapped_requirement: mapTestToRequirement(t)?.id || null
    })),
    all_meta_tests: metaTests.map(t => ({
      title: t.title,
      status: t.status,
      duration: t.duration
    })),
    final_verdict: {
      component_tests_success: beforeResults.success,
      meta_tests_success: afterResults.success,
      requirements_covered: coveredCount,
      requirements_passed: passedCount,
      total_requirements: 15,
      component_test_pass_rate: beforeResults.total > 0 
        ? ((beforeResults.passed / beforeResults.total) * 100).toFixed(1)
        : "0.0",
      meta_test_pass_rate: afterResults.total > 0 
        ? ((afterResults.passed / afterResults.total) * 100).toFixed(1)
        : "0.0"
    }
  };

  // Create timestamped directory
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const reportsDir = path.join('/app/reports', dateStr, timeStr);
  
  fs.mkdirSync(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print detailed summary to console
  console.log('='.repeat(80));
  console.log('EVALUATION REPORT');
  console.log('='.repeat(80));
  console.log(`Evaluation ID: ${evaluationId}`);
  console.log(`Timestamp: ${report.evaluation_metadata.timestamp}`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('');
  
  console.log('ENVIRONMENT');
  console.log('-'.repeat(40));
  console.log(`Node: ${report.environment.node_version}`);
  console.log(`Platform: ${report.environment.platform}`);
  console.log(`OS: ${report.environment.os}`);
  console.log('');
  
  console.log('COMPONENT TESTS (Testing the Dog component)');
  console.log('-'.repeat(40));
  console.log(`Total: ${beforeResults.total} | Passed: ${beforeResults.passed} | Failed: ${beforeResults.failed}`);
  console.log(`Success: ${beforeResults.success ? '✓' : '✗'}`);
  console.log('');
  
  // Print each test suite and its tests
  Object.keys(testsBySuite).forEach(suite => {
    console.log(`  📁 ${suite}`);
    testsBySuite[suite].forEach(test => {
      const icon = test.status === 'passed' ? '✅' : '❌';
      const reqId = mapTestToRequirement(test)?.id;
      const reqStr = reqId ? ` [Req ${reqId}]` : '';
      console.log(`     ${icon} ${test.title}${reqStr}`);
    });
    console.log('');
  });
  
  console.log('META TESTS (Validating test suite structure)');
  console.log('-'.repeat(40));
  console.log(`Total: ${afterResults.total} | Passed: ${afterResults.passed} | Failed: ${afterResults.failed}`);
  console.log(`Success: ${afterResults.success ? '✓' : '✗'}`);
  console.log('');
  
  metaTests.forEach(test => {
    const icon = test.status === 'passed' ? '✅' : '❌';
    console.log(`  ${icon} ${test.title}`);
  });
  console.log('');
  
  console.log('REQUIREMENTS COVERAGE');
  console.log('-'.repeat(40));
  console.log(`Covered: ${coveredCount}/15 | With Passing Tests: ${passedCount}/15`);
  console.log('');
  
  Object.values(requirementsReport).forEach(req => {
    let icon;
    if (req.passed) {
      icon = '✅';
    } else if (req.covered) {
      icon = '⚠️';
    } else {
      icon = '❌';
    }
    
    const status = req.passed ? 'PASSED' : (req.covered ? 'COVERED (failing)' : 'NOT COVERED');
    console.log(`  ${icon} Req ${req.id}: ${req.name}`);
    console.log(`      Status: ${status}`);
    if (req.tests.length > 0) {
      req.tests.forEach(t => {
        const testIcon = t.status === 'passed' ? '✓' : '✗';
        console.log(`      ${testIcon} ${t.title} (${t.suite})`);
      });
    }
    console.log('');
  });
  
  console.log('FINAL VERDICT');
  console.log('-'.repeat(40));
  console.log(`Component Tests: ${beforeResults.passed}/${beforeResults.total} passed (${report.final_verdict.component_test_pass_rate}%)`);
  console.log(`Meta Tests: ${afterResults.passed}/${afterResults.total} passed (${report.final_verdict.meta_test_pass_rate}%)`);
  console.log(`Requirements Covered: ${coveredCount}/15`);
  console.log(`Requirements with Passing Tests: ${passedCount}/15`);
  console.log('');
  console.log('='.repeat(80));

  return report;
}

// Run evaluation
try {
  generateEvaluation();
  process.exit(0);
} catch (error) {
  console.error('Evaluation failed:', error);
  process.exit(1);
}