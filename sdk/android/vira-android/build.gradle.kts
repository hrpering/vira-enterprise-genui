plugins {
  id("com.android.library")
}

android {
  namespace = "xyz.tryvira.android"
  compileSdk = 36

  defaultConfig {
    minSdk = 26
    consumerProguardFiles("consumer-rules.pro")
  }

  sourceSets {
    getByName("main").java.srcDir("../../../interop/studio-experience/v1/kotlin")
  }

  testOptions {
    unitTests.isIncludeAndroidResources = false
  }
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
