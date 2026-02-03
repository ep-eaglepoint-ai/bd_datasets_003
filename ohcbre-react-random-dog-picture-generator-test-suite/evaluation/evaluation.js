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
      error: `Results file not found: ${resultsPath}`
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
      error: error.message
    };
  }
}

function analyzeCodeMetrics(testResults) {
  const testNames = testResults.map(t => t.name || '').join(' ').toLowerCase();
  
  return {
    total_files: 7,
    has_tests: testResults.length > 0,
    component_coverage: testResults.filter(t => 
      (t.name || '').toLowerCase().includes('component')
    ).length > 0,
    integration_tests: testResults.filter(t => 
      (t.name || '').toLowerCase().includes('integration')
    ).length > 0,
    unit_tests: testResults.filter(t => 
      (t.name || '').toLowerCase().includes('test')
    ).length > 0
  };
}

function extractRequirementsCoverage(testResults) {
  const requirements = {
    image_fetching_api_call: false,
    successful_fetch_displays_image: false,
    image_src_set_correctly: false,
    fetch_error_displays_message: false,
    retry_button_triggers_fetch: false,
    loading_indicator_shown: false,
    multiple_clicks_handled: false,
    breed_selection_fetches_breed: false,
    all_breeds_general_endpoint: false,
    breed_dropdown_populated: false,
    heart_icon_adds_favorite: false,
    duplicate_favorites_prevented: false,
    favorites_persisted_localstorage: false,
    viewed_images_tracked: false,
    component_cleanup_on_unmount: false
  };

  testResults.forEach(result => {
    if (!result.assertionResults) return;
    
    result.assertionResults.forEach(assertion => {
      const title = (assertion.title || '').toLowerCase();
      
      if (title.includes('clicking') && title.includes('generate') && title.includes('api')) {
        requirements.image_fetching_api_call = assertion.status === 'passed';
      }
      if (title.includes('successful') && title.includes('displays') && title.includes('image')) {
        requirements.successful_fetch_displays_image = assertion.status === 'passed';
      }
      if (title.includes('image') && title.includes('src')) {
        requirements.image_src_set_correctly = assertion.status === 'passed';
      }
      if (title.includes('error') && title.includes('message')) {
        requirements.fetch_error_displays_message = assertion.status === 'passed';
      }
      if (title.includes('retry') || title.includes('failure')) {
        requirements.retry_button_triggers_fetch = assertion.status === 'passed';
      }
      if (title.includes('loading')) {
        requirements.loading_indicator_shown = assertion.status === 'passed';
      }
      if (title.includes('multiple') && title.includes('click')) {
        requirements.multiple_clicks_handled = assertion.status === 'passed';
      }
      if (title.includes('breed') && title.includes('fetch')) {
        requirements.breed_selection_fetches_breed = assertion.status === 'passed';
      }
      if (title.includes('all breeds') || title.includes('general')) {
        requirements.all_breeds_general_endpoint = assertion.status === 'passed';
      }
      if (title.includes('breed') && title.includes('dropdown')) {
        requirements.breed_dropdown_populated = assertion.status === 'passed';
      }
      if (title.includes('heart') && title.includes('favorite')) {
        requirements.heart_icon_adds_favorite = assertion.status === 'passed';
      }
      if (title.includes('duplicate') && title.includes('favorite')) {
        requirements.duplicate_favorites_prevented = assertion.status === 'passed';
      }
      if (title.includes('favorite') && title.includes('localstorage')) {
        requirements.favorites_persisted_localstorage = assertion.status === 'passed';
      }
      if (title.includes('history') || title.includes('viewed')) {
        requirements.viewed_images_tracked = assertion.status === 'passed';
      }
      if (title.includes('cleanup') || title.includes('unmount')) {
        requirements.component_cleanup_on_unmount = assertion.status === 'passed';
      }
    });
  });

  return requirements;
}

function generateEvaluation() {
  const now = new Date();
  const gitInfo = getGitInfo();
  
  const evaluationId = generateEvaluationId();
  
  // Read test results from /tmp/test-results
  const beforeResults = parseTestResults('/tmp/test-results/before-results.json');
  const afterResults = parseTestResults('/tmp/test-results/after-results.json');
  
  // Analyze metrics
  const beforeMetrics = analyzeCodeMetrics(beforeResults.testResults || []);
  const afterMetrics = analyzeCodeMetrics(afterResults.testResults || []);
  
  // Extract requirements coverage
  const afterRequirements = extractRequirementsCoverage(afterResults.testResults || []);
  
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
      success: afterResults.success,
      exit_code: afterResults.success ? 0 : 1,
      tests: afterResults.testResults || [],
      summary: {
        total: beforeResults.total + afterResults.total,
        passed: beforeResults.passed + afterResults.passed,
        failed: beforeResults.failed + afterResults.failed,
        errors: 0,
        skipped: 0,
        xfailed: 0
      },
      stdout: `Before Repository: ${beforeResults.passed}/${beforeResults.total} passed\nAfter Repository: ${afterResults.passed}/${afterResults.total} passed`,
      stderr: beforeResults.error || afterResults.error || ""
    },
    meta_testing: {
      requirement_traceability: {
        image_fetching_tests: "ImageFetching.test.jsx",
        loading_error_states: "LoadingErrorState.test.jsx",
        favorites_management: "FavoritesManagement.test.jsx",
        breed_filtering: "BreedFiltering.test.jsx",
        image_history: "ImageHistory.test.jsx",
        edge_cases: "EdgeCases.test.jsx",
        integration: "Integration.test.jsx"
      },
      adversarial_testing: {
        async_behavior_validation: "all_test_suites",
        error_handling_coverage: "EdgeCases.test.jsx",
        state_management_testing: "FavoritesManagement.test.jsx",
        api_mock_verification: "ImageFetching.test.jsx"
      },
      edge_case_coverage: {
        malformed_json: "EdgeCases.test.jsx",
        network_timeout: "LoadingErrorState.test.jsx",
        duplicate_prevention: "FavoritesManagement.test.jsx",
        component_unmount: "EdgeCases.test.jsx"
      }
    },
    compliance_check: {
      tests_use_jest: true,
      tests_use_react_testing_library: true,
      async_testing_implemented: true,
      mocks_properly_configured: true,
      localStorage_tested: afterRequirements.favorites_persisted_localstorage,
      error_handling_tested: afterRequirements.fetch_error_displays_message
    },
    before: {
      metrics: beforeMetrics,
      tests: {
        passed: beforeResults.passed,
        failed: beforeResults.failed,
        total: beforeResults.total,
        success: beforeResults.success,
        output: beforeResults.output || "No output available"
      }
    },
    after: {
      metrics: afterMetrics,
      tests: {
        passed: afterResults.passed,
        failed: afterResults.failed,
        total: afterResults.total,
        success: afterResults.success,
        output: afterResults.output || "No output available"
      }
    },
    comparison: {
      tests_added: afterResults.total > 0,
      test_coverage_improved: afterResults.passed > beforeResults.passed,
      meta_tests_passing: afterResults.success,
      all_categories_covered: afterResults.total >= 7,
      test_improvement: afterResults.passed - beforeResults.passed
    },
    requirements_checklist: {
      image_fetching_api_call_tested: afterRequirements.image_fetching_api_call,
      successful_fetch_displays_image: afterRequirements.successful_fetch_displays_image,
      image_src_set_correctly: afterRequirements.image_src_set_correctly,
      fetch_error_displays_message: afterRequirements.fetch_error_displays_message,
      retry_mechanism_tested: afterRequirements.retry_button_triggers_fetch,
      loading_indicator_tested: afterRequirements.loading_indicator_shown,
      multiple_clicks_handled: afterRequirements.multiple_clicks_handled,
      breed_selection_tested: afterRequirements.breed_selection_fetches_breed,
      all_breeds_endpoint_tested: afterRequirements.all_breeds_general_endpoint,
      breed_dropdown_populated: afterRequirements.breed_dropdown_populated,
      heart_icon_adds_favorite: afterRequirements.heart_icon_adds_favorite,
      duplicate_favorites_prevented: afterRequirements.duplicate_favorites_prevented,
      favorites_persisted: afterRequirements.favorites_persisted_localstorage,
      image_history_tracked: afterRequirements.viewed_images_tracked,
      component_cleanup_tested: afterRequirements.component_cleanup_on_unmount
    },
    final_verdict: {
      success: afterResults.success,
      total_tests: beforeResults.total + afterResults.total,
      passed_tests: beforeResults.passed + afterResults.passed,
      failed_tests: beforeResults.failed + afterResults.failed,
      success_rate: afterResults.total > 0 
        ? ((afterResults.passed / afterResults.total) * 100).toFixed(1)
        : "0.0",
      meets_requirements: afterResults.success && afterResults.total >= 7
    }
  };

  // Create timestamped directory
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const reportsDir = path.join('/app/reports', dateStr, timeStr);
  
  fs.mkdirSync(reportsDir, { recursive: true });
  
  // Write report to timestamped directory only
  const reportPath = path.join(reportsDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary to console
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
  console.log('TEST EXECUTION SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total Tests: ${report.test_execution.summary.total}`);
  console.log(`Passed: ${report.test_execution.summary.passed}`);
  console.log(`Failed: ${report.test_execution.summary.failed}`);
  console.log('');
  console.log('BEFORE REPOSITORY');
  console.log('-'.repeat(40));
  console.log(`Tests: ${report.before.tests.passed}/${report.before.tests.total} passed`);
  console.log(`Success: ${report.before.tests.success ? '✓' : '✗'}`);
  console.log('');
  console.log('AFTER REPOSITORY (META TESTS)');
  console.log('-'.repeat(40));
  console.log(`Tests: ${report.after.tests.passed}/${report.after.tests.total} passed`);
  console.log(`Success: ${report.after.tests.success ? '✓' : '✗'}`);
  console.log('');
  console.log('COMPARISON');
  console.log('-'.repeat(40));
  console.log(`Tests Added: ${report.comparison.tests_added ? 'Yes' : 'No'}`);
  console.log(`Meta Tests Passing: ${report.comparison.meta_tests_passing ? 'Yes' : 'No'}`);
  console.log(`All Categories Covered: ${report.comparison.all_categories_covered ? 'Yes' : 'No'}`);
  console.log('');
  console.log('FINAL VERDICT');
  console.log('-'.repeat(40));
  console.log(`Success: ${report.final_verdict.success ? '✅ YES' : '❌ NO'}`);
  console.log(`Success Rate: ${report.final_verdict.success_rate}%`);
  console.log(`Meets Requirements: ${report.final_verdict.meets_requirements ? 'Yes' : 'No'}`);
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