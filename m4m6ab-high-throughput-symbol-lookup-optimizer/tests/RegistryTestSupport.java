package com.quantflow.tests;

import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

/**
 * Test utility for compiling and loading the MarketRegistry implementation
 * from either repository_before/ or repository_after/ at test time.
 *
 * This keeps the production repositories untouched while allowing the same
 * test suite to validate both implementations.
 */
final class RegistryTestSupport {

    static final String PROP_REPO = "repo";

    static LoadedRegistry loadRegistry() throws Exception {
        String repo = System.getProperty(PROP_REPO, "before").trim();
        if (!repo.equals("before") && !repo.equals("after")) {
            throw new IllegalArgumentException("Unsupported repo value: " + repo);
        }

        Path projectRoot = Path.of(".").toAbsolutePath().normalize();
        Path sourceFile;
        
        if ("after".equals(repo)) {
            // repository_after uses canonical path: repository_after/src/main/java/com/quantflow/MarketRegistry.java
            sourceFile = projectRoot
                    .resolve("repository_after")
                    .resolve("src")
                    .resolve("main")
                    .resolve("java")
                    .resolve("com")
                    .resolve("quantflow")
                    .resolve("MarketRegistry.java");
        } else {
            // repository_before uses old location: repository_before/MarketRegistry.java
            sourceFile = projectRoot
                    .resolve("repository_before")
                    .resolve("MarketRegistry.java");
        }

        if (!Files.exists(sourceFile)) {
            throw new IllegalStateException("Source not found: " + sourceFile);
        }

        Path outputDir = Files.createTempDirectory("registry-classes-" + repo);
        compileJava(sourceFile.toFile(), outputDir.toFile());

        URLClassLoader loader = new URLClassLoader(
                new URL[]{outputDir.toUri().toURL()},
                RegistryTestSupport.class.getClassLoader()
        );

        Class<?> registryClass = Class.forName("com.quantflow.MarketRegistry", true, loader);
        Class<?> symbolRecordClass = Class.forName("com.quantflow.SymbolRecord", true, loader);

        Object registryInstance = registryClass.getDeclaredConstructor().newInstance();

        return new LoadedRegistry(registryClass, symbolRecordClass, registryInstance);
    }

    /**
     * Creates a SymbolRecord instance using reflection with an accessible
     * constructor. This avoids IllegalAccessException when the class has
     * package-private visibility while tests live in a different package.
     */
    static Object newSymbolRecord(LoadedRegistry loaded, String internalId, String ticker) throws Exception {
        java.lang.reflect.Constructor<?> ctor =
                loaded.symbolRecordClass.getDeclaredConstructor(String.class, String.class);
        ctor.setAccessible(true);
        return ctor.newInstance(internalId, ticker);
    }

    private static void compileJava(File sourceFile, File outputDir) throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            throw new IllegalStateException("No Java compiler available. Make sure tests run on a JDK, not a JRE.");
        }

        try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, null, null)) {
            Iterable<? extends javax.tools.JavaFileObject> compilationUnits =
                    fileManager.getJavaFileObjectsFromFiles(Collections.singletonList(sourceFile));

            List<String> options = List.of(
                    "-d", outputDir.getAbsolutePath()
            );

            JavaCompiler.CompilationTask task = compiler.getTask(
                    null, fileManager, null, options, null, compilationUnits
            );

            Boolean success = task.call();
            if (!Boolean.TRUE.equals(success)) {
                throw new IllegalStateException("Compilation failed for " + sourceFile);
            }
        }
    }

    static final class LoadedRegistry {
        final Class<?> registryClass;
        final Class<?> symbolRecordClass;
        final Object registryInstance;

        LoadedRegistry(Class<?> registryClass, Class<?> symbolRecordClass, Object registryInstance) {
            this.registryClass = registryClass;
            this.symbolRecordClass = symbolRecordClass;
            this.registryInstance = registryInstance;
        }
    }
}
