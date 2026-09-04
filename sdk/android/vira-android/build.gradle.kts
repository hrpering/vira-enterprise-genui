plugins {
  id("com.android.library")
}

val viraPublicPackage = "xyz.tryvira.android"
val generatedMainDir = layout.buildDirectory.dir("generated/vira-kotlin/main")
val generatedTestDir = layout.buildDirectory.dir("generated/vira-kotlin/test")
val portableWireFile = layout.projectDirectory.file("../../../interop/studio-experience/v1/kotlin/StudioExperienceModels.kt")

val generatePackagedMainSources = tasks.register("generatePackagedMainSources") {
  inputs.dir(layout.projectDirectory.dir("src/main/kotlin"))
  inputs.file(portableWireFile)
  outputs.dir(generatedMainDir)

  doLast {
    val output = generatedMainDir.get().asFile
    output.deleteRecursively()
    output.mkdirs()

    fun writePackaged(source: java.io.File, relativeName: String) {
      val target = output.resolve(relativeName)
      target.parentFile.mkdirs()
      target.writeText("package $viraPublicPackage\n\n" + source.readText())
    }

    fileTree("src/main/kotlin") {
      include("**/*.kt")
    }.files.sortedBy { it.relativeTo(projectDir).path }.forEach { source ->
      writePackaged(source, source.relativeTo(file("src/main/kotlin")).path)
    }

    writePackaged(portableWireFile.asFile, "StudioExperienceModels.kt")
  }
}

val generatePackagedTestSources = tasks.register("generatePackagedTestSources") {
  inputs.dir(layout.projectDirectory.dir("src/test/kotlin"))
  outputs.dir(generatedTestDir)

  doLast {
    val output = generatedTestDir.get().asFile
    output.deleteRecursively()
    output.mkdirs()
    fileTree("src/test/kotlin") {
      include("**/*.kt")
    }.files.sortedBy { it.relativeTo(projectDir).path }.forEach { source ->
      val target = output.resolve(source.relativeTo(file("src/test/kotlin")).path)
      target.parentFile.mkdirs()
      target.writeText("package $viraPublicPackage\n\n" + source.readText())
    }
  }
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
      kotlin.directories.clear()
      kotlin.directories.add(generatedMainDir.get().asFile.path)
    }
    getByName("test") {
      kotlin.directories.clear()
      kotlin.directories.add(generatedTestDir.get().asFile.path)
      java.setSrcDirs(listOf(file("src/test/java")))
    }
  }

  testOptions {
    unitTests.isIncludeAndroidResources = false
  }
}

tasks.matching { task ->
  task.name.startsWith("compile") && task.name.contains("Kotlin", ignoreCase = true)
}.configureEach {
  if (name.contains("UnitTest", ignoreCase = true)) {
    dependsOn(generatePackagedTestSources)
  }
  dependsOn(generatePackagedMainSources)
}

tasks.matching { task ->
  task.name.startsWith("compile") && task.name.contains("Java", ignoreCase = true)
}.configureEach {
  dependsOn(generatePackagedMainSources)
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
