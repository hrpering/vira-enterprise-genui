import com.android.build.api.variant.HasUnitTest
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
  abstract val sourceDirectory: DirectoryProperty

  @get:Optional
  @get:InputFile
  @get:PathSensitive(PathSensitivity.RELATIVE)
  abstract val additionalSource: RegularFileProperty

  @get:Input
  abstract val packageName: Property<String>

  @get:OutputDirectory
  abstract val outputDirectory: DirectoryProperty

  @TaskAction
  fun generate() {
    val sourceRoot = sourceDirectory.get().asFile
    val outputRoot = outputDirectory.get().asFile
    val packageDeclaration = "package ${packageName.get()}\n\n"

    outputRoot.deleteRecursively()
    outputRoot.mkdirs()

    fun writePackaged(source: java.io.File, relativeName: String) {
      val target = outputRoot.resolve(relativeName)
      target.parentFile.mkdirs()
      target.writeText(packageDeclaration + source.readText())
    }

    sourceRoot
      .walkTopDown()
      .filter { source -> source.isFile && source.extension == "kt" }
      .sortedBy { source -> source.relativeTo(sourceRoot).path }
      .forEach { source ->
        writePackaged(source, source.relativeTo(sourceRoot).path)
      }

    if (additionalSource.isPresent) {
      val source = additionalSource.get().asFile
      writePackaged(source, source.name)
    }
  }
}

val viraPublicPackage = "xyz.tryvira.android"
val portableWireFile = layout.projectDirectory.file("../../../interop/studio-experience/v1/kotlin/StudioExperienceModels.kt")

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
      // The checked-in Kotlin files intentionally omit a package declaration.
      // Only their generated, packaged form belongs to Android variants.
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

androidComponents {
  onVariants(selector().all()) { variant ->
    val variantName = variant.name.replaceFirstChar { character ->
      if (character.isLowerCase()) character.titlecase() else character.toString()
    }

    val generateMainSources = tasks.register<GeneratePackagedKotlinSources>(
      "generate${variantName}PackagedMainSources",
    ) {
      sourceDirectory.set(layout.projectDirectory.dir("src/main/kotlin"))
      additionalSource.set(portableWireFile)
      packageName.set(viraPublicPackage)
      outputDirectory.set(layout.buildDirectory.dir("generated/vira-kotlin/${variant.name}/main"))
    }

    variant.sources.kotlin!!.addGeneratedSourceDirectory(
      generateMainSources,
      GeneratePackagedKotlinSources::outputDirectory,
    )

    (variant as? HasUnitTest)?.unitTest?.let { unitTest ->
      val generateTestSources = tasks.register<GeneratePackagedKotlinSources>(
        "generate${variantName}PackagedTestSources",
      ) {
        sourceDirectory.set(layout.projectDirectory.dir("src/test/kotlin"))
        packageName.set(viraPublicPackage)
        outputDirectory.set(layout.buildDirectory.dir("generated/vira-kotlin/${variant.name}/test"))
      }

      unitTest.sources.kotlin!!.addGeneratedSourceDirectory(
        generateTestSources,
        GeneratePackagedKotlinSources::outputDirectory,
      )
    }
  }
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
