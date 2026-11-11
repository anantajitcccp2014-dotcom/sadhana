plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "com.sadhana.diary"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sadhana.diary"
        minSdk = 21
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Постоянный ключ подписи: новые сборки ставятся поверх старых, записи сохраняются.
    signingConfigs {
        create("app") {
            storeFile = file("sadhana.jks")
            storePassword = "sadhana"
            keyAlias = "sadhana"
            keyPassword = "sadhana"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("app")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("app")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
