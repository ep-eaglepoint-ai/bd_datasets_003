#!/bin/sh
mvn -q compile dependency:copy-dependencies -DoutputDirectory=lib
javac -cp "target/classes:lib/*" ../tests/*.java
java -cp "target/classes:../tests:lib/*" SystemTestSuite