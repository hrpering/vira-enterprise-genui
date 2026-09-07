import com.android.build.api.variant.HostTest
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

plugins {
  id("com.android.library")
}

abstract class GeneratePackagedKotlinSources : DefaultTask() {
  @get:InputDirectory
  @get:PathSensitive(PathSensitivity.RELATIVE)
  abstract val sourceRoot: DirectoryProperty

  @get:Input
  abstract val packageName: Property<String>

  @get:InputFile
  @get:Optional
  @get:PathSensitive(PathSensitivity.RELATIVE)
  abstract val portableWireSource: RegularFileProperty

  @get:OutputDirectory
  abstract val outputDirectory: DirectoryProperty

  @TaskAction
  fun generate() {
    val sourceRootFile = sourceRoot.get().asFile
    val output = outputDirectory.get().asFile
    output.deleteRecursively()
    output.mkdirs()

    fun writePackaged(source: java.io.File, relativeName: String) {
      val target = output.resolve(relativeName)
      target.parentFile.mkdirs()
      target.writeText("package ${packageName.get()}\n\n" + source.readText())
    }

    sourceRootFile
      .walkTopDown()
      .filter { file -> file.isFile && file.extension == "kt" }
      .sortedBy { file -> file.relativeTo(sourceRootFile).invariantSeparatorsPath }
      .forEach { source ->
        writePackaged(source, source.relativeTo(sourceRootFile).invariantSeparatorsPath)
      }

    if (portableWireSource.isPresent) {
      writePackaged(portableWireSource.get().asFile, "StudioExperienceModels.kt")
    }
  }
}

val viraPublicPackage = "xyz.tryvira.android"
val portableWireFile = layout.projectDirectory.file("../../../interop/studio-experience/v1/kotlin/StudioExperienceModels.kt")

val generatePackagedMainSources = tasks.register<GeneratePackagedKotlinSources>("generatePackagedMainSources") {
  sourceRoot.set(layout.projectDirectory.dir("src/main/kotlin"))
  packageName.set(viraPublicPackage)
  portableWireSource.set(portableWireFile)
  outputDirectory.set(layout.buildDirectory.dir("generated/vira-kotlin/main"))
}

val generatePackagedTestSources = tasks.register<GeneratePackagedKotlinSources>("generatePackagedTestSources") {
  sourceRoot.set(layout.projectDirectory.dir("src/test/kotlin"))
  packageName.set(viraPublicPackage)
  outputDirectory.set(layout.buildDirectory.dir("generated/vira-kotlin/test"))
}

android {
  namespace = viraPublicPackage
  compileSdk = 36

  defaultConfig {
    minSdk = 26
    testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    consumerProguardFiles("consumer-rules.pro")
  }

  sourceSets {
    getByName("main") {
      // The checked-in Kotlin files intentionally omit their public package;
      // only the generated packaged variant is compiled by Android.
      kotlin.directories.clear()
    }
    getByName("test") {
      kotlin.directories.clear()
    }
  }

  testOptions {
    unitTests.isIncludeAndroidResources = false
  }
}

// Generated Kotlin must be owned by the task that creates it. AGP's Variant
// API carries that producer relationship to every source consumer. The default
// JVM unit test is a HostTest nested component in AGP 9.4, so avoid the legacy
// direct unitTest accessor and wire its Sources through nestedComponents.
androidComponents.onVariants { variant ->
  variant.sources.kotlin?.addGeneratedSourceDirectory(generatePackagedMainSources) {
    it.outputDirectory
  }
  variant.nestedComponents
    .filterIsInstance<HostTest>()
    .forEach { hostTest ->
      hostTest.sources.kotlin?.addGeneratedSourceDirectory(generatePackagedTestSources) {
        it.outputDirectory
      }
    }
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
