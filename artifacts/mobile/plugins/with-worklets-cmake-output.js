/**
 * @fileOverview Android build role: republishes Worklets' native library where Reanimated 4.1 expects it.
 * System connection: app.config.js installs this Expo config plugin during
 * prebuild; it patches the generated root build.gradle without committing a
 * generated Android project or modifying third-party packages in node_modules.
 */
const { withProjectBuildGradle } = require("expo/config-plugins");

const PATCH_MARKER =
  "// Casparel: republish Worklets CMake output for Reanimated 4.1.";

/**
 * AGP 8.11 leaves libworklets.so under intermediates/cxx, while Reanimated
 * 4.1 links the historical intermediates/cmake path. Copying after Worklets'
 * own native task preserves Gradle's task ordering and works for every ABI.
 */
const gradlePatch = [
  "",
  PATCH_MARKER,
  "subprojects { subproject ->",
  '  if (subproject.name == "react-native-worklets") {',
  "    subproject.afterEvaluate {",
  "      subproject.tasks.matching { nativeTask ->",
  '        nativeTask.name == "externalNativeBuildDebug" ||',
  '          nativeTask.name == "externalNativeBuildRelease"',
  "      }.configureEach { nativeTask ->",
  "        nativeTask.doLast {",
  '          def buildKind = nativeTask.name.endsWith("Debug") ? "debug" : "release"',
  '          subproject.fileTree("${subproject.buildDir}/intermediates/cxx") {',
  '            include "**/obj/*/libworklets.so"',
  "          }.files.each { workletsLibrary ->",
  "            def abi = workletsLibrary.parentFile.name",
  "            subproject.copy {",
  "              from workletsLibrary",
  '              into "${subproject.buildDir}/intermediates/cmake/${buildKind}/obj/${abi}"',
  "            }",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}",
  "",
].join("\n");

module.exports = function withWorkletsCmakeOutput(config) {
  return withProjectBuildGradle(config, (project) => {
    if (!project.modResults.contents.includes(PATCH_MARKER)) {
      project.modResults.contents += gradlePatch;
    }
    return project;
  });
};
