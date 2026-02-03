// Enable POSIX prototypes for popen/pclose/gmtime_r/getpid under -std=c11.
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif

#include <errno.h>
#include <limits.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <unistd.h>

#include <sys/wait.h>

typedef struct {
    char *name;
    char *outcome; // "passed" | "failed" | "error" | "skipped"
} test_case_t;

typedef struct {
    int success;
    int exit_code;
    test_case_t *tests;
    size_t tests_len;
    size_t tests_cap;
    char *output; // merged stdout/stderr
} run_results_t;

static void die_oom(void) {
    fprintf(stderr, "evaluation: out of memory\n");
    exit(0); // evaluation script should never fail the harness
}

static void *xrealloc(void *p, size_t n) {
    void *r = realloc(p, n);
    if (!r) die_oom();
    return r;
}

static char *xstrdup(const char *s) {
    size_t n = strlen(s);
    char *r = (char *)malloc(n + 1);
    if (!r) die_oom();
    memcpy(r, s, n + 1);
    return r;
}

static void tests_push(run_results_t *rr, const char *name, const char *outcome) {
    if (rr->tests_len == rr->tests_cap) {
        rr->tests_cap = rr->tests_cap ? rr->tests_cap * 2 : 16;
        rr->tests = (test_case_t *)xrealloc(rr->tests, rr->tests_cap * sizeof(test_case_t));
    }
    rr->tests[rr->tests_len].name = xstrdup(name);
    rr->tests[rr->tests_len].outcome = xstrdup(outcome);
    rr->tests_len++;
}

static void json_write_escaped(FILE *f, const char *s) {
    fputc('"', f);
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        unsigned char c = *p;
        switch (c) {
            case '\\': fputs("\\\\", f); break;
            case '"': fputs("\\\"", f); break;
            case '\n': fputs("\\n", f); break;
            case '\r': fputs("\\r", f); break;
            case '\t': fputs("\\t", f); break;
            default:
                if (c < 0x20) {
                    fprintf(f, "\\u%04x", (unsigned)c);
                } else {
                    fputc((int)c, f);
                }
        }
    }
    fputc('"', f);
}

static char *slurp_popen(const char *cmd, int *exit_code) {
    FILE *fp = popen(cmd, "r");
    if (!fp) {
        *exit_code = -1;
        return xstrdup("popen failed\n");
    }

    size_t cap = 8192;
    size_t len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) die_oom();

    for (;;) {
        if (len + 4096 + 1 > cap) {
            cap *= 2;
            buf = (char *)xrealloc(buf, cap);
        }
        size_t n = fread(buf + len, 1, 4096, fp);
        len += n;
        if (n == 0) {
            if (feof(fp)) break;
            if (ferror(fp)) break;
        }
    }
    buf[len] = '\0';

    int status = pclose(fp);
    if (status == -1) {
        *exit_code = -1;
    } else if (WIFEXITED(status)) {
        *exit_code = WEXITSTATUS(status);
    } else {
        *exit_code = -1;
    }

    // Truncate very large outputs to keep report sane.
    const size_t max_len = 65536;
    if (len > max_len) {
        const char *tail = "\n...<truncated>...\n";
        size_t tail_len = strlen(tail);
        size_t keep = max_len - tail_len;
        buf[keep] = '\0';
        buf = (char *)xrealloc(buf, keep + tail_len + 1);
        strcat(buf, tail);
    }

    return buf;
}

static void parse_test_output(run_results_t *rr) {
    // Our C harness prints:
    //   PASS: test_name
    //   FAILED: test_name
    // plus "ALL TESTS PASSED".
    const char *p = rr->output;
    while (*p) {
        const char *line_start = p;
        const char *nl = strchr(p, '\n');
        size_t line_len = nl ? (size_t)(nl - line_start) : strlen(line_start);

        if (line_len >= 6 && strncmp(line_start, "PASS: ", 6) == 0) {
            char tmp[256];
            size_t n = line_len - 6;
            if (n >= sizeof(tmp)) n = sizeof(tmp) - 1;
            memcpy(tmp, line_start + 6, n);
            tmp[n] = '\0';
            tests_push(rr, tmp, "passed");
        } else if (line_len >= 8 && strncmp(line_start, "FAILED: ", 8) == 0) {
            char tmp[256];
            size_t n = line_len - 8;
            if (n >= sizeof(tmp)) n = sizeof(tmp) - 1;
            memcpy(tmp, line_start + 8, n);
            tmp[n] = '\0';
            tests_push(rr, tmp, "failed");
        }

        p = nl ? nl + 1 : line_start + line_len;
    }
}

static run_results_t run_repo_tests(const char *repo_dir, const char *label, int strict_werror, int timeout_s) {
    run_results_t rr;
    memset(&rr, 0, sizeof(rr));

    // Compile and run directly (no root Makefile dependency).
    // Use coreutils timeout to avoid hangs on corrupted implementations.
    const char *werror = strict_werror ? "-Werror" : "";
    char cmd[1024];
    snprintf(cmd, sizeof(cmd),
             "timeout %ds sh -lc \"gcc -Wall -Wextra %s -g -pthread -std=c11 -I%s %s/pool.c %s/freelist.c tests/test_pool.c -o /tmp/test_pool_%s && /tmp/test_pool_%s\" 2>&1",
             timeout_s,
             werror,
             repo_dir,
             repo_dir,
             repo_dir,
             label,
             label);

    rr.output = slurp_popen(cmd, &rr.exit_code);
    parse_test_output(&rr);

    // Define success based on parsed outcomes (test binary may always exit 0).
    rr.success = 1;
    if (rr.tests_len == 0) {
        rr.success = 0;
        tests_push(&rr, "runner", "error");
    } else {
        for (size_t i = 0; i < rr.tests_len; i++) {
            if (strcmp(rr.tests[i].outcome, "failed") == 0 || strcmp(rr.tests[i].outcome, "error") == 0) {
                rr.success = 0;
                break;
            }
        }
    }

    if (rr.exit_code == 124) {
        // Timed out: mark error for reporting clarity.
        rr.success = 0;
        tests_push(&rr, "timeout", "error");
    }

    return rr;
}

static char *run_one_line(const char *cmd) {
    int ec = 0;
    char *out = slurp_popen(cmd, &ec);
    // Keep only first line
    char *nl = strchr(out, '\n');
    if (nl) *nl = '\0';
    return out;
}

static void generate_run_id(char out[9]) {
    // 8 hex chars + NUL
    FILE *f = fopen("/dev/urandom", "rb");
    uint32_t v = 0;
    if (f) {
        fread(&v, 1, sizeof(v), f);
        fclose(f);
    } else {
        v = (uint32_t)time(NULL) ^ (uint32_t)getpid();
    }
    snprintf(out, 9, "%08x", v);
}

static const char *outcome_for_test(const run_results_t *rr, const char *name) {
    for (size_t i = 0; i < rr->tests_len; i++) {
        if (strcmp(rr->tests[i].name, name) == 0) {
            return rr->tests[i].outcome;
        }
    }
    return NULL;
}

static const char *pass_fail_notrun(const run_results_t *rr, const char *name) {
    const char *o = outcome_for_test(rr, name);
    if (!o) return "Not Run";
    return (strcmp(o, "passed") == 0) ? "Pass" : "Fail";
}

static void write_report_json(const char *path, const char run_id[9], const run_results_t *before, const run_results_t *after) {
    FILE *f = fopen(path, "w");
    if (!f) {
        fprintf(stderr, "evaluation: failed to open %s: %s\n", path, strerror(errno));
        return;
    }

    char *git_commit = run_one_line("git rev-parse HEAD 2>/dev/null");
    if (strlen(git_commit) > 8) git_commit[8] = '\0';
    char *git_branch = run_one_line("git rev-parse --abbrev-ref HEAD 2>/dev/null");
    char *uname_s = run_one_line("uname -a 2>/dev/null");
    char *gcc_v = run_one_line("gcc --version 2>/dev/null");

    time_t now = time(NULL);
    struct tm tm_now;
    gmtime_r(&now, &tm_now);
    char iso[32];
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &tm_now);

    // Criteria mapping to the 10 requirements.
    // We evaluate criteria based on AFTER runs.
    const char *req1 = pass_fail_notrun(after, "concurrent_alloc_unique_addresses");
    const char *req2 = pass_fail_notrun(after, "min_alloc_and_alignment");
    const char *req3 = pass_fail_notrun(after, "min_alloc_and_alignment");
    const char *req4 = pass_fail_notrun(after, "free_last_block_end_bounds");
    const char *req5 = pass_fail_notrun(after, "double_free_and_pointer_validation");
    const char *req6 = pass_fail_notrun(after, "double_free_and_pointer_validation");
    const char *req7 = pass_fail_notrun(after, "coalescing_prev_and_next");
    const char *req8 = pass_fail_notrun(after, "coalescing_reclaims_header_space");
    const char *req9 = pass_fail_notrun(after, "split_remainder_usable_rule");
    const char *req10 = pass_fail_notrun(after, "freelist_helpers_only_count_free_blocks");

    fprintf(f, "{\n");
    fprintf(f, "  \"run_id\": ");
    json_write_escaped(f, run_id);
    fprintf(f, ",\n");
    fprintf(f, "  \"tool\": ");
    json_write_escaped(f, "C Memory Pool Allocator Evaluator");
    fprintf(f, ",\n");
    fprintf(f, "  \"started_at\": ");
    json_write_escaped(f, iso);
    fprintf(f, ",\n");

    fprintf(f, "  \"environment\": {\n");
    fprintf(f, "    \"platform\": ");
    json_write_escaped(f, uname_s);
    fprintf(f, ",\n");
    fprintf(f, "    \"os\": ");
    json_write_escaped(f, "linux");
    fprintf(f, ",\n");
    fprintf(f, "    \"compiler\": ");
    json_write_escaped(f, gcc_v);
    fprintf(f, ",\n");
    fprintf(f, "    \"git_commit\": ");
    json_write_escaped(f, git_commit[0] ? git_commit : "unknown");
    fprintf(f, ",\n");
    fprintf(f, "    \"git_branch\": ");
    json_write_escaped(f, git_branch[0] ? git_branch : "unknown");
    fprintf(f, "\n  },\n");

    // Helper to emit results block
    const run_results_t *blocks[2] = {before, after};
    const char *names[2] = {"before", "after"};
    for (int bi = 0; bi < 2; bi++) {
        const run_results_t *rr = blocks[bi];
        fprintf(f, "  \"%s\": {\n", names[bi]);
        fprintf(f, "    \"success\": %s,\n", rr->success ? "true" : "false");
        fprintf(f, "    \"exit_code\": %d,\n", rr->exit_code);

        // summary
        int passed = 0, failed = 0, errors = 0, skipped = 0;
        for (size_t i = 0; i < rr->tests_len; i++) {
            if (strcmp(rr->tests[i].outcome, "passed") == 0) passed++;
            else if (strcmp(rr->tests[i].outcome, "failed") == 0) failed++;
            else if (strcmp(rr->tests[i].outcome, "error") == 0) errors++;
            else if (strcmp(rr->tests[i].outcome, "skipped") == 0) skipped++;
        }
        fprintf(f, "    \"summary\": {\n");
        fprintf(f, "      \"total\": %zu,\n", rr->tests_len);
        fprintf(f, "      \"passed\": %d,\n", passed);
        fprintf(f, "      \"failed\": %d,\n", failed);
        fprintf(f, "      \"errors\": %d,\n", errors);
        fprintf(f, "      \"skipped\": %d\n", skipped);
        fprintf(f, "    },\n");

        // tests
        fprintf(f, "    \"tests\": [\n");
        for (size_t i = 0; i < rr->tests_len; i++) {
            fprintf(f, "      {\"name\": ");
            json_write_escaped(f, rr->tests[i].name);
            fprintf(f, ", \"outcome\": ");
            json_write_escaped(f, rr->tests[i].outcome);
            fprintf(f, "}%s\n", (i + 1 == rr->tests_len) ? "" : ",");
        }
        fprintf(f, "    ],\n");

        fprintf(f, "    \"output\": ");
        json_write_escaped(f, rr->output ? rr->output : "");
        fprintf(f, "\n  }%s\n", (bi == 0) ? "," : "");
    }

    fprintf(f, "  ,\"criteria_analysis\": {\n");
    fprintf(f, "    \"req1_remove_allocated_from_freelist\": "); json_write_escaped(f, req1); fprintf(f, ",\n");
    fprintf(f, "    \"req2_min_alloc_enforced\": "); json_write_escaped(f, req2); fprintf(f, ",\n");
    fprintf(f, "    \"req3_header_aligned_8_bytes\": "); json_write_escaped(f, req3); fprintf(f, ",\n");
    fprintf(f, "    \"req4_bounds_check_before_adjacent_access\": "); json_write_escaped(f, req4); fprintf(f, ",\n");
    fprintf(f, "    \"req5_double_free_detected\": "); json_write_escaped(f, req5); fprintf(f, ",\n");
    fprintf(f, "    \"req6_pointer_validation_oob_rejected\": "); json_write_escaped(f, req6); fprintf(f, ",\n");
    fprintf(f, "    \"req7_coalesce_prev_and_next\": "); json_write_escaped(f, req7); fprintf(f, ",\n");
    fprintf(f, "    \"req8_free_space_reclaims_headers\": "); json_write_escaped(f, req8); fprintf(f, ",\n");
    fprintf(f, "    \"req9_split_remainder_usable\": "); json_write_escaped(f, req9); fprintf(f, ",\n");
    fprintf(f, "    \"req10_freelist_helpers_count_free_only\": "); json_write_escaped(f, req10); fprintf(f, "\n");
    fprintf(f, "  },\n");

    fprintf(f, "  \"comparison\": {\n");
    fprintf(f, "    \"summary\": ");
    json_write_escaped(f, "Baseline (repository_before) vs fixed (repository_after)");
    fprintf(f, ",\n");
    fprintf(f, "    \"success\": %s\n", after->success ? "true" : "false");
    fprintf(f, "  }\n");

    fprintf(f, "}\n");

    free(git_commit);
    free(git_branch);
    free(uname_s);
    free(gcc_v);

    fclose(f);
}

static void free_results(run_results_t *rr) {
    for (size_t i = 0; i < rr->tests_len; i++) {
        free(rr->tests[i].name);
        free(rr->tests[i].outcome);
    }
    free(rr->tests);
    free(rr->output);
    memset(rr, 0, sizeof(*rr));
}

int main(int argc, char **argv) {
    const char *output_path = "evaluation/report.json";
    int timeout_s = 120;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_path = argv[++i];
        } else if (strcmp(argv[i], "--timeout") == 0 && i + 1 < argc) {
            timeout_s = atoi(argv[++i]);
            if (timeout_s <= 0) timeout_s = 120;
        }
    }

    char run_id[9];
    generate_run_id(run_id);

    printf("Starting C Memory Pool Allocator Evaluation [Run ID: %s]\n", run_id);

    run_results_t before = run_repo_tests("repository_before", "before", 0, timeout_s);
    run_results_t after = run_repo_tests("repository_after", "after", 1, timeout_s);

    write_report_json(output_path, run_id, &before, &after);

    printf("Report saved to: %s\n", output_path);

    free_results(&before);
    free_results(&after);

    // ALWAYS EXIT 0
    return 0;
}
