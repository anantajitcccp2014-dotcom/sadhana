package com.sadhana.diary

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * Дневник садханы: страница из assets/index.html в WebView.
 * Записи лежат в файле sadhana.json во внутренней памяти приложения,
 * поэтому интернет не нужен, а обновление APK их не стирает.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var pendingExport: String? = null
    private val lock = Any()

    private val dataFile: File get() = File(filesDir, "sadhana.json")

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

        web = WebView(this)
        web.setBackgroundColor(if (dark) 0xFF11141D.toInt() else 0xFFEEF1F5.toInt())
        setContentView(web)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = true
        s.setSupportZoom(false)

        web.addJavascriptInterface(Bridge(dark), "App")
        web.webViewClient = object : WebViewClient() {
            // Никаких переходов на другие страницы: приложение работает только со своей.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = true
        }
        web.loadUrl("file:///android_asset/index.html")
    }

    override fun onPause() {
        callJs("window.flush && window.flush()")
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        callJs("window.onResume && window.onResume()")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Если открыт большой таймер, «Назад» только сворачивает его.
        web.evaluateJavascript("(window.onBack ? window.onBack() : false)") { result ->
            if (result != "true") finish()
        }
    }

    private fun callJs(js: String) {
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        when (requestCode) {
            REQ_EXPORT -> {
                val json = pendingExport
                pendingExport = null
                if (resultCode != RESULT_OK) return
                var ok = false
                if (uri != null && json != null) {
                    ok = try {
                        val maybe = try {
                            contentResolver.openOutputStream(uri, "wt")
                        } catch (e: Exception) {
                            contentResolver.openOutputStream(uri)
                        }
                        val out = maybe ?: throw IOException("no stream")
                        out.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                        true
                    } catch (e: Exception) {
                        false
                    }
                }
                callJs("window.onBackupSaved($ok)")
            }
            REQ_IMPORT -> {
                if (resultCode != RESULT_OK || uri == null) return
                val text: String? = try {
                    contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                } catch (e: Exception) {
                    null
                }
                val arg = if (text == null) "''" else JSONObject.quote(text)
                callJs("window.onBackupLoaded($arg)")
            }
        }
    }

    /** Методы, которые страница вызывает как window.App.*  */
    inner class Bridge(private val dark: Boolean) {

        @JavascriptInterface
        fun isDark(): Boolean = dark

        @JavascriptInterface
        fun load(): String = synchronized(lock) {
            val f = dataFile
            if (f.exists()) f.readText(Charsets.UTF_8) else ""
        }

        @JavascriptInterface
        fun save(json: String) {
            synchronized(lock) {
                val tmp = File(filesDir, "sadhana.json.tmp")
                tmp.writeText(json, Charsets.UTF_8)
                if (!tmp.renameTo(dataFile)) {
                    dataFile.writeText(json, Charsets.UTF_8)
                    tmp.delete()
                }
            }
        }

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun exportBackup(json: String, name: String) {
            runOnUiThread {
                pendingExport = json
                val i = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, name)
                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(i, REQ_EXPORT)
                } catch (e: Exception) {
                    pendingExport = null
                    web.evaluateJavascript("window.onBackupSaved(false)", null)
                }
            }
        }

        @JavascriptInterface
        fun importBackup() {
            runOnUiThread {
                val i = Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(i, REQ_IMPORT)
                } catch (e: Exception) {
                    web.evaluateJavascript("window.onBackupLoaded('')", null)
                }
            }
        }
    }

    companion object {
        private const val REQ_EXPORT = 1
        private const val REQ_IMPORT = 2
    }
}
